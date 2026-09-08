import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CoachStore, openCoachDb } from "@roster/coach";
import { scanSkillLibrary } from "@roster/playbook";
import { BackendManager, RosterServer } from "@roster/router";
import { describe, expect, it } from "vitest";
import { capabilities, exampleCall, presets } from "../src/lib/demo.js";
import { commands } from "../src/lib/site.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));

describe("website examples against the actual product", () => {
  it("returns each fixture through real draft/call and excludes instruction delivery from ratings", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-site-fixtures-"));
    const db = openCoachDb(":memory:");
    const store = new CoachStore(db);
    const manager = new BackendManager();
    const backendServers: Server[] = [];
    const client = new Client({ name: "site-fixture-agent", version: "0.0.1" });
    let router: RosterServer | undefined;
    try {
      const toolFixtures = Object.values(capabilities).filter((capability) => capability.kind === "tool");
      const sources = [...new Set(toolFixtures.map((capability) => capability.id.split("__")[0]!))];
      for (const source of sources) {
        const tools = toolFixtures.filter((capability) => capability.id.startsWith(`${source}__`));
        const backend = new Server({ name: source, version: "fixture" }, { capabilities: { tools: {} } });
        backend.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map((capability) => ({
          name: capability.id.split("__")[1]!,
          description: capability.description,
          inputSchema: { type: "object", properties: Object.fromEntries(Object.entries(capability.args).map(([key, value]) => [key, { type: typeof value }])) },
        })) }));
        backend.setRequestHandler(CallToolRequestSchema, async (request) => {
          const fixture = tools.find((tool) => tool.id === `${source}__${request.params.name}`)!;
          expect(request.params.arguments).toEqual(fixture.args);
          return { content: [{ type: "text", text: fixture.result }] };
        });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await backend.connect(serverTransport);
        await manager.connect({ name: source, transport: clientTransport });
        backendServers.push(backend);
      }
      for (const skill of Object.values(capabilities).filter((capability) => capability.kind === "skill")) {
        const slug = skill.id.slice("skill__".length);
        const directory = path.join(home, slug);
        fs.mkdirSync(directory);
        fs.writeFileSync(path.join(directory, "SKILL.md"), `---\nname: ${slug}\ndescription: ${JSON.stringify(skill.description)}\n---\n${skill.result}\n`);
        for (const resource of skill.resources ?? []) {
          const relative = resource.split(`/${slug}/`)[1]!;
          const file = path.join(directory, relative);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, "Fixture reference.");
        }
      }
      router = new RosterServer({ mode: "five", manager, store, skills: scanSkillLibrary(home) });
      router.syncCapabilities();
      const [agentTransport, routerTransport] = InMemoryTransport.createLinkedPair();
      await router.server.connect(routerTransport);
      await client.connect(agentTransport);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["draft", "call"]);
      const drafted = await client.callTool({ name: "draft", arguments: { need: presets[0].need, k: 5 } });
      const draft = JSON.parse((drafted.content as Array<{ text: string }>)[0]!.text);
      expect(draft.draft_id).toBe("d1");
      expect(draft.starters).toHaveLength(5);
      for (const capability of Object.values(capabilities)) {
        const result = await client.callTool({ name: "call", arguments: exampleCall({ preset: 0, selected: capability.id, called: false }) });
        const text = (result.content as Array<{ text: string }>)[0]!.text;
        if (capability.kind === "tool") expect(text).toBe(capability.result);
        else {
          expect(JSON.parse(text).instructions).toBe(capability.result);
          expect(JSON.parse(text).resources).toHaveLength(capability.resources!.length);
        }
      }
      store.recomputeRatings();
      expect(store.getRating("playwright__browser_snapshot")?.n).toBe(1);
      expect(store.getRating("skill__project-guide")).toBeNull();
      const rows = JSON.stringify(db.prepare("SELECT * FROM outcome").all());
      expect(rows).not.toContain("Enter an email to continue");
      expect(rows).not.toContain("/example/shop");
      expect(rows).not.toContain(presets[0].need);
    } finally {
      await client.close();
      await manager.close();
      await router?.server.close();
      await Promise.all(backendServers.map((server) => server.close()));
      store.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("runs the documented source CLI sequence in a disposable home and restores exact bytes", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-site-cli-"));
    const configDir = path.join(home, ".cursor");
    fs.mkdirSync(configDir);
    const original = '{\n  "mcpServers": { "fixture": { "command": "node", "args": ["fixture.mjs"] } }\n}\n';
    const configPath = path.join(configDir, "mcp.json");
    fs.writeFileSync(configPath, original);
    const run = (command: string) => execFileSync(process.execPath, [path.join(root, "packages/cli/dist/bin.js"), ...command.split(" ").slice(2)], {
      cwd: home,
      env: { ...process.env, ROSTER_TEST_HOME: home, ROSTER_HOME: path.join(home, ".roster"), ROSTER_NO_FETCH: "1", ROSTER_ASSUME_GLOBAL: "0" },
      encoding: "utf8",
    });
    try {
      expect(run(commands.help)).toContain("the tool router for AI agents");
      expect(run(commands.init)).toContain("Day-0 receipt");
      expect(fs.readFileSync(configPath, "utf8")).toBe(original);
      const rosterFile = path.join(home, ".roster", "roster.json");
      const config = JSON.parse(fs.readFileSync(rosterFile, "utf8"));
      config.embeddings = "off";
      fs.writeFileSync(rosterFile, JSON.stringify(config));
      expect(run(commands.sync)).toContain("synced");
      expect(run(commands.receipt)).toContain("routed through Roster");
      expect(run(commands.telemetry)).toContain("OFF");
      expect(run(commands.eject)).toContain("restored");
      expect(fs.readFileSync(configPath, "utf8")).toBe(original);
      expect(JSON.parse(fs.readFileSync(rosterFile, "utf8")).telemetry.enabled).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
