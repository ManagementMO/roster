import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CoachStore, openCoachDb, type CoachDb } from "@rosterhq/coach";
import { scanSkillLibrary } from "@rosterhq/playbook";
import { BackendManager } from "./backends.js";
import { RosterServer, type RouterMode } from "./rosterServer.js";

/** A scripted fake MCP backend: echo succeeds, flaky always isError-internal. */
function fakeBackend(sourceName: string): Server {
  const server = new Server({ name: sourceName, version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "echo",
        description: "Echo the provided text back to the caller",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
      {
        name: "flaky",
        description: "A tool that always fails with an internal error (test double)",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === "echo") {
      const text = (req.params.arguments as { text?: string } | undefined)?.text ?? "";
      return { content: [{ type: "text", text }] };
    }
    return {
      isError: true,
      content: [{ type: "text", text: "Internal Server Error: backend exploded" }],
    };
  });
  return server;
}

interface Rig {
  client: Client;
  db: CoachDb;
  store: CoachStore;
  roster: RosterServer;
  close(): Promise<void>;
}

async function buildRig(mode: RouterMode, opts: { skillsDir?: string } = {}): Promise<Rig> {
  const db = openCoachDb(":memory:");
  const store = new CoachStore(db);
  const manager = new BackendManager(2_000);

  // Backend A: primary fake. Backend B: an alternate echo source for Sixth Man.
  for (const source of ["alpha", "beta"] as const) {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await fakeBackend(source).connect(serverT);
    await manager.connect({ name: source, transport: clientT });
  }

  const skills = opts.skillsDir ? scanSkillLibrary(opts.skillsDir) : [];
  const roster = new RosterServer({ mode, manager, store, skills, sessionId: "test-session" });
  roster.syncCapabilities();

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await roster.server.connect(serverT);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  await client.connect(clientT);

  return {
    client,
    db,
    store,
    roster,
    close: async () => {
      await client.close();
      await manager.close();
    },
  };
}

let rig: Rig;
afterEach(async () => {
  await rig?.close();
});

describe("transparent mode", () => {
  beforeEach(async () => {
    rig = await buildRig("transparent");
  });

  it("re-exports every backend tool under a namespaced, static list", async () => {
    const { tools } = await rig.client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["alpha__echo", "alpha__flaky", "beta__echo", "beta__flaky"]);
  });

  it("passes calls through byte-faithfully and records a success outcome", async () => {
    const result = await rig.client.callTool({
      name: "alpha__echo",
      arguments: { text: "hello roster" },
    });
    expect((result.content as Array<{ text: string }>)[0]?.text).toBe("hello roster");

    const rows = rig.db
      .prepare("SELECT capability, class FROM outcome")
      .all() as Array<{ capability: string; class: string }>;
    expect(rows).toEqual([{ capability: "alpha__echo", class: "success" }]);
  });

  it("classifies backend isError results without altering them", async () => {
    const result = await rig.client.callTool({ name: "alpha__flaky", arguments: { text: "x" } });
    expect(result.isError).toBe(true);
    const rows = rig.db.prepare("SELECT class FROM outcome").all() as Array<{ class: string }>;
    expect(rows[0]?.class).toBe("tool_fail:internal");
  });

  it("rejects unknown tools with a protocol error", async () => {
    await expect(
      rig.client.callTool({ name: "nope__missing", arguments: {} }),
    ).rejects.toThrow(/Unknown tool/);
  });

  it("never stores raw args — only hashes", async () => {
    await rig.client.callTool({ name: "alpha__echo", arguments: { text: "SECRET-VALUE" } });
    const row = rig.db.prepare("SELECT args_hash FROM outcome").get() as { args_hash: string };
    expect(row.args_hash).toMatch(/^[0-9a-f]{64}$/);
    const everything = JSON.stringify(
      rig.db.prepare("SELECT * FROM outcome").all(),
    );
    expect(everything).not.toContain("SECRET-VALUE");
  });
});

describe("five mode", () => {
  let skillsDir: string;

  beforeEach(async () => {
    skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-router-skills-"));
    const dir = path.join(skillsDir, "release-runbook");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      "---\nname: release-runbook\ndescription: Step-by-step release checklist for shipping safely\n---\n\n1. Tag.\n2. Build.\n3. Verify.\n",
    );
    rig = await buildRig("five", { skillsDir });
  });

  afterEach(() => {
    fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  it("exposes exactly draft and call — the list never changes", async () => {
    const { tools } = await rig.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["call", "draft"]);
  });

  it("draft ranks tools and skills together for a need", async () => {
    const result = await rig.client.callTool({
      name: "draft",
      arguments: { need: "echo some text back", k: 5 },
    });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      starters: Array<{ id: string; kind: string }>;
    };
    const ids = payload.starters.map((s) => s.id);
    expect(ids).toContain("alpha__echo");

    const release = await rig.client.callTool({
      name: "draft",
      arguments: { need: "release checklist for shipping" },
    });
    const releasePayload = JSON.parse(
      (release.content as Array<{ text: string }>)[0]!.text,
    ) as { starters: Array<{ id: string; kind: string }> };
    expect(releasePayload.starters.map((s) => s.id)).toContain("skill__release-runbook");
  });

  it("call executes a drafted tool and logs need-linked outcomes", async () => {
    await rig.client.callTool({ name: "draft", arguments: { need: "echo text" } });
    const result = await rig.client.callTool({
      name: "call",
      arguments: { tool: "alpha__echo", args: { text: "via five" } },
    });
    expect((result.content as Array<{ text: string }>)[0]?.text).toBe("via five");
    const row = rig.db
      .prepare("SELECT need_hash, class FROM outcome ORDER BY id DESC LIMIT 1")
      .get() as { need_hash: string | null; class: string };
    expect(row.class).toBe("success");
    expect(row.need_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("calling a skill returns its full instructions (the bridge)", async () => {
    const result = await rig.client.callTool({
      name: "call",
      arguments: { tool: "skill__release-runbook" },
    });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      instructions: string;
    };
    expect(payload.instructions).toContain("1. Tag.");
  });

  it("Sixth Man: failure carries a suggested alternate from another source, suggest-only", async () => {
    await rig.client.callTool({ name: "draft", arguments: { need: "echo text please" } });
    const result = await rig.client.callTool({
      name: "call",
      arguments: { tool: "alpha__flaky", args: { text: "hi" } },
    });
    expect(result.isError).toBe(true);
    const texts = (result.content as Array<{ text: string }>).map((c) => c.text);
    const suggestionBlock = texts.find((t) => t.includes("_roster"));
    expect(suggestionBlock).toBeDefined();
    const suggestion = JSON.parse(suggestionBlock!) as {
      _roster: { suggested_alternate: { tool: string; args_compatible: boolean } };
    };
    expect(suggestion._roster.suggested_alternate.tool.startsWith("beta__")).toBe(true);
    expect(suggestion._roster.suggested_alternate.args_compatible).toBe(true);

    // Suggest-only: no second backend call was fired by the router itself.
    const calls = rig.db.prepare("SELECT capability FROM outcome").all() as Array<{
      capability: string;
    }>;
    expect(calls.filter((c) => c.capability.startsWith("beta__"))).toHaveLength(0);
  });

  it("draft with empty need is rejected", async () => {
    await expect(rig.client.callTool({ name: "draft", arguments: { need: " " } })).rejects.toThrow();
  });

  it("a provided-but-unknown draft_id does NOT cross-attribute to another draft", async () => {
    const draftRes = await rig.client.callTool({ name: "draft", arguments: { need: "echo text" } });
    const realId = JSON.parse((draftRes.content as Array<{ text: string }>)[0]!.text).draft_id as string;
    expect(realId).toMatch(/^d\d+$/);
    // call with a bogus draft_id: must still execute, but attribute to NO need
    const res = await rig.client.callTool({
      name: "call",
      arguments: { tool: "alpha__echo", args: { text: "x" }, draft_id: "d9999" },
    });
    expect((res.content as Array<{ text: string }>)[0]?.text).toBe("x");
    const row = rig.db
      .prepare("SELECT need_hash FROM outcome ORDER BY id DESC LIMIT 1")
      .get() as { need_hash: string | null };
    expect(row.need_hash).toBeNull();
  });

  it("logs Sixth Man suggestions to the suggestion table", async () => {
    await rig.client.callTool({ name: "draft", arguments: { need: "echo text please" } });
    await rig.client.callTool({ name: "call", arguments: { tool: "alpha__flaky", args: { text: "x" } } });
    const sugg = rig.db.prepare("SELECT failed_capability, suggested_capability, taken FROM suggestion").all() as Array<{
      failed_capability: string;
      suggested_capability: string;
      taken: number;
    }>;
    expect(sugg).toHaveLength(1);
    expect(sugg[0]?.failed_capability).toBe("alpha__flaky");
    expect(sugg[0]?.suggested_capability.startsWith("beta__")).toBe(true);
    expect(sugg[0]?.taken).toBe(0);
  });
});

describe("backend connect timeout (fix wave round 2)", () => {
  it("bounds a wedged handshake instead of hanging boot, and registers nothing", async () => {
    // A transport that starts but never delivers an initialize response.
    const hanging = {
      onclose: undefined,
      onerror: undefined,
      onmessage: undefined,
      start: async () => undefined,
      send: async () => undefined,
      close: async () => undefined,
    };
    const manager = new BackendManager(2_000, 150); // 150ms connect timeout
    await expect(
      manager.connect({ name: "wedged", transport: hanging } as never),
    ).rejects.toThrow(/timeout/);
    expect(manager.allTools()).toHaveLength(0);
    await manager.close();
  });
});
