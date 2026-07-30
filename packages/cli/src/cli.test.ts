import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "@rosterhq/coach";
import { CLIENTS, discoverClients, type ClientId } from "./clients.js";
import { parseJsonc } from "./jsonc.js";
import { buildReceipt } from "./receipt.js";
import { withFileLockSync } from "./lock.js";
import { atomicWriteFileSync, defaultConfig, mergeServers } from "./rosterfile.js";
import { ejectClient } from "./eject.js";
import { rosterEntry } from "./entry.js";
import { syncClient } from "./sync.js";

let home: string;

function write(rel: string, content: string): string {
  const abs = path.join(home, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-cli-home-"));
  process.env.ROSTER_TEST_HOME = home;
  process.env.ROSTER_HOME = path.join(home, ".roster");
});

afterEach(() => {
  delete process.env.ROSTER_TEST_HOME;
  delete process.env.ROSTER_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

/**
 * Fixture CONTENT is keyed by client id; the PATH each file lands at comes
 * from the client registry itself (configPaths()[0]) — so this test exercises
 * the real per-platform path logic on macOS, Linux, and Windows alike. A
 * literal-path table once green-on-mac/red-on-linux'd CI (VS Code's config
 * lives under Library/… vs ~/.config/… vs %APPDATA%).
 */
const FIXTURE_CONTENT: Record<ClientId, string> = {
  "claude-code": JSON.stringify({
    theme: "dark",
    mcpServers: { github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] } },
  }),
  "claude-desktop": JSON.stringify({
    mcpServers: { fs: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] } },
  }),
  cursor: `{
    // cursor allows comments
    "mcpServers": {
      "browser": { "command": "npx", "args": ["-y", "browser-mcp"], },
    },
  }`,
  codex: `model = "gpt-5"

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.context7.env]
API_STYLE = "camel"
`,
  "gemini-cli": JSON.stringify({
    mcpServers: { notion: { httpUrl: "https://mcp.notion.example/sse" } },
  }),
  hermes: `mcp_servers:
  slack:
    command: npx
    args: ["-y", "slack-mcp"]
    env:
      SLACK_TOKEN: "test-token"
`,
  openclaw: JSON.stringify({
    agents: { list: [] },
    mcpServers: { memory: { command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] } },
  }),
  vscode: `{
    /* vscode block comment */
    "servers": { "sentry": { "url": "https://mcp.sentry.example" } }
  }`,
  windsurf: JSON.stringify({
    mcpServers: { search: { serverUrl: "https://mcp.search.example" } },
  }),
  zed: `{
    "context_servers": { "db": { "command": "pg-mcp" } }, // zed
  }`,
};

function clientFixturePath(id: ClientId): string {
  return CLIENTS.find((c) => c.id === id)!.configPaths()[0]!;
}

function writeClientFixtures(): void {
  for (const [id, content] of Object.entries(FIXTURE_CONTENT)) {
    const abs = clientFixturePath(id as ClientId);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

describe("read-import across all client formats", () => {
  beforeEach(() => {
    writeClientFixtures();
  });

  it("discovers and parses every configured client", () => {
    const discoveries = discoverClients();
    const byClient = Object.fromEntries(
      discoveries.map((d) => [d.client.id, d.servers.map((s) => s.name)]),
    );
    expect(byClient["claude-code"]).toEqual(["github"]);
    expect(byClient["claude-desktop"]).toEqual(["fs"]);
    expect(byClient.cursor).toEqual(["browser"]);
    expect(byClient.codex).toEqual(["context7"]);
    expect(byClient["gemini-cli"]).toEqual(["notion"]);
    expect(byClient.hermes).toEqual(["slack"]);
    expect(byClient.openclaw).toEqual(["memory"]);
    expect(byClient.vscode).toEqual(["sentry"]);
    expect(byClient.windsurf).toEqual(["search"]);
    expect(byClient.zed).toEqual(["db"]);
    expect(discoveries.every((d) => d.parseError === undefined)).toBe(true);
  });

  it("captures env, args, and url variants correctly", () => {
    const all = discoverClients().flatMap((d) => d.servers);
    expect(all.find((s) => s.name === "slack")?.env).toEqual({ SLACK_TOKEN: "test-token" });
    expect(all.find((s) => s.name === "context7")?.env).toEqual({ API_STYLE: "camel" });
    expect(all.find((s) => s.name === "notion")?.url).toBe("https://mcp.notion.example/sse");
    expect(all.find((s) => s.name === "search")?.url).toBe("https://mcp.search.example");
  });

  it("merges into the roster with dedupe by definition", () => {
    const imported = discoverClients().flatMap((d) => d.servers);
    const duplicated = [...imported, { ...imported[0]!, name: "github-again", client: "cursor" as const }];
    const { config, added, merged } = mergeServers(defaultConfig(), duplicated);
    expect(added).toHaveLength(10);
    expect(merged).toEqual(["github"]);
    expect(config.servers.github?.importedFrom.sort()).toEqual(["claude-code", "cursor"]);
  });

  it("a broken config reports a parseError without killing discovery", () => {
    fs.writeFileSync(clientFixturePath("cursor"), "{ not json at all");
    const discoveries = discoverClients();
    const cursor = discoveries.find((d) => d.client.id === "cursor");
    expect(cursor?.parseError).toBeDefined();
    expect(discoveries.find((d) => d.client.id === "codex")?.servers).toHaveLength(1);
  });
});

describe("jsonc", () => {
  it("preserves comment-like content inside strings", () => {
    const parsed = parseJsonc(`{"a": "http://x // not-a-comment", "b": "/*neither*/", }`) as Record<string, string>;
    expect(parsed.a).toBe("http://x // not-a-comment");
    expect(parsed.b).toBe("/*neither*/");
  });
});

describe("receipt truthfulness", () => {
  it("Claude Code line says deferred-not-loaded; OpenClaw skills chars are exact", () => {
    writeClientFixtures();
    // one skill in the default claude skills dir
    write(
      ".claude/skills/demo/SKILL.md",
      "---\nname: demo\ndescription: a demo skill\n---\nBody here",
    );
    const discoveries = discoverClients();
    const receipt = buildReceipt(
      discoveries,
      [
        {
          slug: "demo",
          name: "demo",
          description: "a demo skill",
          body: "Body here",
          dir: path.join(home, ".claude/skills/demo"),
          resources: [],
          scripts: [],
          scanWarnings: [],
          frontmatter: {},
        },
      ],
      0,
    );
    const cc = receipt.clients.find((c) => c.id === "claude-code");
    expect(cc?.note).toContain("natively deferred, not loaded");
    expect(cc?.note).not.toContain("85%");
    const skillPath = `${path.join(home, ".claude/skills/demo")}/SKILL.md`;
    expect(receipt.skills.openclaw?.chars).toBe(195 + 97 + 4 + 12 + skillPath.length);
    expect(receipt.methodology).toContain("estimate");
  });
});

describe("sync + eject (the trust path)", () => {
  const gnarlyToml = `# my precious comments
model = "gpt-5" # inline comment

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
`;

  beforeEach(() => {
    write(".codex/config.toml", gnarlyToml);
    write(
      ".claude.json",
      `{\n  "theme": "dark",\n  "mcpServers": { "github": { "command": "npx" } }\n}\n`,
    );
  });

  it("sync backs up, rewrites only mcp servers, and is idempotent", () => {
    const result = syncClient("codex", new Date("2026-07-05T01:00:00Z"));
    expect(result.action).toBe("synced");

    const rewritten = fs.readFileSync(path.join(home, ".codex/config.toml"), "utf8");
    expect(rewritten).toContain('model = "gpt-5"');
    expect(rewritten).toContain("[mcp_servers.roster]");
    expect(rewritten).not.toContain("context7");

    const again = syncClient("codex", new Date("2026-07-05T02:00:00Z"));
    expect(again.action).toBe("already-synced");
  });

  it("eject restores byte-for-byte, comments and all", () => {
    const configPath = path.join(home, ".codex/config.toml");
    const originalBytes = fs.readFileSync(configPath);
    syncClient("codex", new Date("2026-07-05T01:00:00Z"));
    expect(fs.readFileSync(configPath)).not.toEqual(originalBytes);

    const result = ejectClient("codex");
    expect(result.action).toBe("restored");
    expect(result.detail).toBeUndefined();
    const restored = fs.readFileSync(configPath);
    expect(Buffer.compare(restored, originalBytes)).toBe(0);
    expect(sha256Hex(restored.toString("utf8"))).toBe(sha256Hex(originalBytes.toString("utf8")));
  });

  it("state-file client: eject restores servers KEY-LEVEL, preserving live settings (M2)", () => {
    const configPath = path.join(home, ".claude.json"); // Claude Code's live state file
    syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
    // Claude Code rewrites its state file every session — add unrelated state
    // AND a new mcp key the way a session would:
    const synced = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    synced.numStartups = 42;
    fs.writeFileSync(configPath, JSON.stringify(synced, null, 2));

    const result = ejectClient("claude-code"); // no --force, no refusal
    expect(result.action).toBe("restored");
    const after = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      numStartups?: number;
      theme?: string;
      mcpServers: Record<string, unknown>;
    };
    expect(after.numStartups).toBe(42); // live state preserved
    expect(after.theme).toBe("dark"); // original non-mcp key preserved
    expect(after.mcpServers).not.toHaveProperty("roster"); // roster removed
    expect(after.mcpServers).toHaveProperty("github"); // pre-sync server restored
  });

  it("dedicated client: still refuses to clobber post-sync manual edits without --force", () => {
    const configPath = path.join(home, ".codex/config.toml"); // codex = dedicated (not a state file)
    const original = fs.readFileSync(configPath);
    syncClient("codex", new Date("2026-07-05T01:00:00Z"));
    fs.appendFileSync(configPath, "\n# user edited after sync\n");

    const refused = ejectClient("codex");
    expect(refused.action).toBe("refused-modified");
    expect(fs.readFileSync(configPath, "utf8")).toContain("user edited after sync");

    const forced = ejectClient("codex", { force: true });
    expect(forced.action).toBe("restored");
    expect(Buffer.compare(fs.readFileSync(configPath), original)).toBe(0);
  });

  it("no-global install: synced entry points at THIS install's entrypoint, never the npm `roster` (a third-party package) (M5)", () => {
    const prev = process.env.ROSTER_ASSUME_GLOBAL;
    try {
      process.env.ROSTER_ASSUME_GLOBAL = "0"; // no global binary on PATH
      const first = syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
      expect(first.action).toBe("synced");
      const cfg = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8")) as {
        mcpServers: Record<string, { command: string; args: string[] }>;
      };
      const entry = cfg.mcpServers.roster!;
      expect(entry.command).toBe(process.execPath); // spawnable node, not `npx -y roster` (squatter hazard)
      expect(entry.args[0]).toMatch(/bin\.js$/);
      expect(entry.args[1]).toBe("serve");
      expect(entry.command).not.toBe("npx");
      // Re-sync must recognize the entry regardless of install form and not loop:
      expect(syncClient("claude-code", new Date("2026-07-05T02:00:00Z")).action).toBe("already-synced");
      process.env.ROSTER_ASSUME_GLOBAL = "1"; // same machine later gains a global install
      expect(syncClient("claude-code", new Date("2026-07-05T03:00:00Z")).action).toBe("already-synced");
    } finally {
      if (prev === undefined) delete process.env.ROSTER_ASSUME_GLOBAL;
      else process.env.ROSTER_ASSUME_GLOBAL = prev;
    }
  });

  it("state-file eject KEEPS servers the user added after sync (never destroys in-between work)", () => {
    const configPath = path.join(home, ".claude.json");
    syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
    // User runs `claude mcp add linear ...` while synced:
    const cur = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcpServers: Record<string, unknown> };
    cur.mcpServers.linear = { command: "npx", args: ["-y", "linear-mcp"] };
    fs.writeFileSync(configPath, JSON.stringify(cur, null, 2));

    expect(ejectClient("claude-code").action).toBe("restored");
    const after = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcpServers: Record<string, unknown> };
    expect(after.mcpServers).toHaveProperty("github"); // pre-sync server restored
    expect(after.mcpServers).toHaveProperty("linear"); // post-sync addition SURVIVES
    expect(after.mcpServers).not.toHaveProperty("roster");
  });

  it("handles deleted config with --force by recreating from backup", () => {
    const configPath = path.join(home, ".claude.json");
    const original = fs.readFileSync(configPath);
    syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
    fs.rmSync(configPath);

    expect(ejectClient("claude-code").action).toBe("missing-file");
    const forced = ejectClient("claude-code", { force: true });
    expect(forced.action).toBe("restored");
    expect(Buffer.compare(fs.readFileSync(configPath), original)).toBe(0);
  });

  it("eject with no backup is a clean no-op", () => {
    expect(ejectClient("cursor").action).toBe("no-backup");
  });

  it("eject refuses to restore corrupted backup bytes (integrity guard)", () => {
    const configPath = path.join(home, ".codex/config.toml");
    syncClient("codex", new Date("2026-07-05T01:00:00Z"));
    // Corrupt the stored pristine bytes.
    const clientDir = path.join(home, ".roster/backups/codex");
    const ts = fs.readdirSync(clientDir).find((d) => d !== "latest")!;
    fs.writeFileSync(path.join(clientDir, ts, "original"), "TAMPERED");
    const configBefore = fs.readFileSync(configPath);

    const result = ejectClient("codex");
    expect(result.action).toBe("no-backup");
    expect(result.detail).toContain("INTEGRITY");
    // The (rosterized) config was NOT overwritten with corrupt bytes.
    expect(Buffer.compare(fs.readFileSync(configPath), configBefore)).toBe(0);
  });

  it("re-sync imports servers the user added after first sync; eject restores the PRISTINE original", () => {
    const configPath = path.join(home, ".codex/config.toml");
    const pristineBytes = fs.readFileSync(configPath);

    // First sync: config becomes roster-only; context7 imported into roster.json.
    const first = syncClient("codex", new Date("2026-07-05T01:00:00Z"));
    expect(first.action).toBe("synced");
    expect(first.imported).toBeGreaterThanOrEqual(1);

    // User manually adds a NEW server after syncing.
    const syncedContent = fs.readFileSync(configPath, "utf8");
    fs.writeFileSync(
      configPath,
      `${syncedContent}
[mcp_servers.late-addition]
command = "npx"
args = ["-y", "late-mcp"]
`,
    );

    // Second sync must IMPORT late-addition (never eat it), then rewrite.
    const second = syncClient("codex", new Date("2026-07-05T02:00:00Z"));
    expect(second.action).toBe("synced");
    const roster = JSON.parse(
      fs.readFileSync(path.join(home, ".roster/roster.json"), "utf8"),
    ) as { servers: Record<string, unknown> };
    expect(Object.keys(roster.servers)).toContain("late-addition");
    expect(Object.keys(roster.servers)).not.toContain("roster");

    // Eject restores the ORIGINAL pre-Roster config, not the intermediate rosterized one.
    const ejected = ejectClient("codex");
    expect(ejected.action).toBe("restored");
    expect(Buffer.compare(fs.readFileSync(configPath), pristineBytes)).toBe(0);
  });

  it("refuses loudly when the pristine manifest is corrupt (never silently restores a different backup)", () => {
    const configPath = path.join(home, ".codex/config.toml");
    syncClient("codex", new Date("2026-07-05T01:00:00Z")); // backup #1 = pristine (context7)
    // A genuine SECOND backup: the user re-adds a NON-roster server, so the next
    // sync does NOT short-circuit to already-synced and captures distinct bytes.
    // (Without a non-roster server the 2nd sync no-ops and no wrong-restore
    // target exists — the vacuity a reviewer caught.)
    fs.writeFileSync(
      configPath,
      `model = "gpt-5"\n\n[mcp_servers.roster]\ncommand = "roster"\nargs = ["serve"]\n\n[mcp_servers.evil]\ncommand = "npx"\nargs = ["-y", "evil-mcp"]\n`,
    );
    const second = syncClient("codex", new Date("2026-07-05T02:00:00Z"));
    expect(second.action).toBe("synced"); // proves a real 2nd backup was created
    const clientDir = path.join(home, ".roster/backups/codex");
    expect(fs.readdirSync(clientDir).filter((d) => d !== "latest")).toHaveLength(2);
    const configBefore = fs.readFileSync(configPath);

    // Corrupt ONLY the OLDEST (pristine) backup's manifest.
    const oldest = fs.readdirSync(clientDir).filter((d) => d !== "latest").sort()[0]!;
    fs.writeFileSync(path.join(clientDir, oldest, "manifest.json"), "{ not valid json");

    const result = ejectClient("codex");
    expect(result.action).toBe("no-backup");
    expect(result.detail).toContain("INTEGRITY");
    // Crucially: config was NOT overwritten with backup #2's (evil-bearing) bytes.
    expect(Buffer.compare(fs.readFileSync(configPath), configBefore)).toBe(0);
    expect(fs.readFileSync(configPath, "utf8")).not.toContain("evil");
  });

  it("atomicWriteFileSync uses a PRIVATE tmp (not the shared <target>.tmp) and leaves no litter", () => {
    const target = path.join(home, "cfg.json");
    // Occupy the OLD shared tmp name as a directory: the pre-fix shared-tmp code
    // would writeFileSync into it and throw here. The private-tmp code is immune.
    fs.mkdirSync(`${target}.tmp`);
    atomicWriteFileSync(target, '{"ok":true}\n');
    expect(fs.readFileSync(target, "utf8")).toBe('{"ok":true}\n');
    const litter = fs
      .readdirSync(home)
      .filter((f) => f.startsWith("cfg.json.") && f.endsWith(".tmp") && fs.statSync(path.join(home, f)).isFile());
    expect(litter).toEqual([]); // private tmp cleaned up on success
  });

  it("a file lock preserves an undefined thrown value instead of treating it as success", () => {
    let caught = false;
    try {
      withFileLockSync("throw-undefined", () => {
        throw undefined;
      });
    } catch (error) {
      caught = true;
      expect(error).toBeUndefined();
    }
    expect(caught).toBe(true);
  });

  it("does not report 'synced' (or clobber the client config) when the import step genuinely fails", () => {
    const configPath = path.join(home, ".codex/config.toml"); // beforeEach seeds context7 to import
    // Corrupt roster.json so loadConfig() throws DURING import — previously swallowed.
    fs.mkdirSync(path.join(home, ".roster"), { recursive: true });
    fs.writeFileSync(path.join(home, ".roster/roster.json"), "{ not valid json");

    expect(() => syncClient("codex", new Date("2026-07-05T01:00:00Z"))).toThrow();
    // Trust invariant: the client config is untouched — servers still route to context7, not nowhere.
    expect(fs.readFileSync(configPath, "utf8")).toContain("context7");
  });

  it("refuses loudly (never half-installs) when a config's top level is a JSON array, not an object (D8)", () => {
    const configPath = path.join(home, ".claude.json");
    fs.writeFileSync(configPath, "[]"); // an array is not a servers map
    // Setting a property on an array silently vanishes through JSON.stringify →
    // an eternal false 'synced' loop; rewriteConfig throws instead. bin.ts's
    // per-client try/catch turns this into one `error <client>` line while the
    // rest of the fleet still syncs (fleet isolation, D2/D8).
    expect(() => syncClient("claude-code", new Date("2026-07-05T01:00:00Z"))).toThrow(/not a JSON object/i);
    expect(fs.readFileSync(configPath, "utf8")).toBe("[]"); // left exactly as found
  });

  it("rejects an array-valued roster servers field before rewriting a client", () => {
    const configPath = path.join(home, ".codex/config.toml");
    const original = fs.readFileSync(configPath);
    fs.mkdirSync(path.join(home, ".roster"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".roster/roster.json"),
      `${JSON.stringify({ ...defaultConfig(), servers: [] }, null, 2)}\n`,
    );

    expect(() => syncClient("codex", new Date("2026-07-05T01:00:00Z"))).toThrow(
      /servers.*object/i,
    );
    expect(fs.readFileSync(configPath)).toEqual(original);
  });

  it("persists provenance-only duplicate imports", () => {
    const rosterPath = path.join(home, ".roster/roster.json");
    fs.mkdirSync(path.dirname(rosterPath), { recursive: true });
    const config = defaultConfig();
    config.servers.shared = {
      command: "npx",
      args: ["-y", "shared-mcp"],
      importedFrom: ["claude-code"],
    };
    fs.writeFileSync(rosterPath, `${JSON.stringify(config, null, 2)}\n`);
    write(
      ".cursor/mcp.json",
      JSON.stringify({
        mcpServers: {
          sameDefinition: { command: "npx", args: ["-y", "shared-mcp"] },
        },
      }),
    );

    expect(syncClient("cursor", new Date("2026-07-05T01:00:00Z")).action).toBe("synced");
    const saved = JSON.parse(fs.readFileSync(rosterPath, "utf8")) as {
      servers: Record<string, { importedFrom: string[] }>;
    };
    expect(saved.servers.shared?.importedFrom.sort()).toEqual(["claude-code", "cursor"]);
  });

  it("refuses a URL-only client before roster, backup, or client-config mutation", () => {
    const configPath = write(
      ".cursor/mcp.json",
      JSON.stringify({
        mcpServers: { remote: { url: "https://mcp.example.test/sse" } },
      }),
    );
    const original = fs.readFileSync(configPath);

    expect(() => syncClient("cursor", new Date("2026-07-05T01:00:00Z"))).toThrow(
      /URL-only.*stdio/i,
    );
    expect(fs.readFileSync(configPath)).toEqual(original);
    expect(fs.existsSync(path.join(home, ".roster/roster.json"))).toBe(false);
    expect(fs.existsSync(path.join(home, ".roster/backups/cursor"))).toBe(false);
  });

  it("legacy state-file eject refuses key-level deletion without exact injected identity", () => {
    const configPath = path.join(home, ".claude.json");
    const original = fs.readFileSync(configPath);
    syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
    const synced = fs.readFileSync(configPath);
    const clientDir = path.join(home, ".roster/backups/claude-code");
    const backup = fs.readdirSync(clientDir).find((name) => name !== "latest" && !name.startsWith("."))!;
    const manifestPath = path.join(clientDir, backup, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    delete manifest.injectedEntry;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const refused = ejectClient("claude-code");
    expect(refused.action).toBe("refused-modified");
    expect(refused.detail).toMatch(/legacy|identity/i);
    expect(fs.readFileSync(configPath)).toEqual(synced);

    expect(ejectClient("claude-code", { force: true }).action).toBe("restored");
    expect(fs.readFileSync(configPath)).toEqual(original);
  });

  it("serializes simultaneous Cursor and Codex imports across processes", async () => {
    const cursorServers = Object.fromEntries(
      Array.from({ length: 5_000 }, (_, index) => [
        `cursor-${index}`,
        { command: "cursor-mcp", args: [String(index)] },
      ]),
    );
    write(".cursor/mcp.json", JSON.stringify({ mcpServers: cursorServers }));
    const codexServers = Array.from(
      { length: 1_000 },
      (_, index) =>
        `[mcp_servers."codex-${index}"]\ncommand = "codex-mcp"\nargs = ["${index}"]\n`,
    ).join("\n");
    write(".codex/config.toml", codexServers);
    const rosterPath = path.join(home, ".roster/roster.json");
    fs.mkdirSync(path.dirname(rosterPath), { recursive: true });
    fs.writeFileSync(rosterPath, `${JSON.stringify(defaultConfig(), null, 2)}\n`);

    const release = path.join(home, "release");
    const configLock = path.join(home, ".roster", "locks", `${sha256Hex("config")}.lock`);
    const distSync = pathToFileURL(path.resolve("packages/cli/dist/sync.js")).href;
    const waitArray = "new Int32Array(new SharedArrayBuffer(4))";
    const worker = `
      import fs from "node:fs";
      import path from "node:path";
      const originalRead = fs.readFileSync;
      fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(fs, file, ...args);
        if (
          path.resolve(String(file)) === path.resolve(process.env.ROSTER_CONFIG) &&
          !fs.existsSync(process.env.CONFIG_LOCK)
        ) {
          fs.writeFileSync(process.env.READ_CONFIG_READY, "read");
          while (!fs.existsSync(process.env.PEER_READ_CONFIG_READY)) {
            Atomics.wait(${waitArray}, 0, 0, 5);
          }
        }
        return value;
      };
      fs.writeFileSync(process.env.READY, "ready");
      while (!fs.existsSync(process.env.RELEASE)) Atomics.wait(${waitArray}, 0, 0, 5);
      const { syncClient } = await import(${JSON.stringify(distSync)});
      syncClient(process.env.CLIENT);
    `;
    const readyCursor = path.join(home, "ready-cursor");
    const readyCodex = path.join(home, "ready-codex");
    const readCursor = path.join(home, "read-cursor");
    const readCodex = path.join(home, "read-codex");
    const runWithReadBarrier = (
      client: "cursor" | "codex",
      ready: string,
      readReady: string,
      peerReadReady: string,
    ): Promise<void> =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--input-type=module", "--eval", worker], {
          cwd: path.resolve("."),
          env: {
            ...process.env,
            ROSTER_TEST_HOME: home,
            ROSTER_HOME: path.join(home, ".roster"),
            ROSTER_ASSUME_GLOBAL: "0",
            ROSTER_CONFIG: rosterPath,
            CONFIG_LOCK: configLock,
            READ_CONFIG_READY: readReady,
            PEER_READ_CONFIG_READY: peerReadReady,
            READY: ready,
            RELEASE: release,
            CLIENT: client,
          },
          stdio: ["ignore", "ignore", "pipe"],
        });
        let stderr = "";
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });
        child.once("error", reject);
        child.once("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`${client} sync worker exited ${code}: ${stderr}`));
        });
      });
    const children = [
      runWithReadBarrier("cursor", readyCursor, readCursor, readCodex),
      runWithReadBarrier("codex", readyCodex, readCodex, readCursor),
    ];
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 5_000;
      const poll = (): void => {
        if (fs.existsSync(readyCursor) && fs.existsSync(readyCodex)) {
          resolve();
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error("sync workers did not reach start barrier"));
          return;
        }
        setTimeout(poll, 5);
      };
      poll();
    });
    fs.writeFileSync(release, "go");
    await Promise.all(children);

    const saved = JSON.parse(
      fs.readFileSync(rosterPath, "utf8"),
    ) as { servers: Record<string, unknown> };
    expect(Object.keys(saved.servers)).toHaveLength(6_000);
    expect(saved.servers).toHaveProperty("cursor-0");
    expect(saved.servers).toHaveProperty("cursor-4999");
    expect(saved.servers).toHaveProperty("codex-0");
    expect(saved.servers).toHaveProperty("codex-999");
  }, 20_000);

  /**
   * A NAME is not an IDENTITY. All three of these keyed off the string "roster"
   * and so confused Roster's own proxy entry with a server the user happens to
   * have called that — silently dropping it on import, calling an untrusted
   * binary healthy, and DELETING it on eject (R5-01).
   */
  describe("a user's own server named `roster` is theirs (R5-01)", () => {
    const mine = { command: "node", args: ["/opt/my-own-roster-server.js"] };

    it("is imported and stays routable — not mistaken for our proxy entry", () => {
      write(
        ".cursor/mcp.json",
        JSON.stringify({ mcpServers: { roster: mine, github: { command: "npx", args: ["-y", "gh"] } } }),
      );
      const result = syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
      expect(result.action).toBe("synced");
      expect(result.imported).toBe(2); // BOTH — theirs was silently dropped before

      const roster = JSON.parse(fs.readFileSync(path.join(home, ".roster/roster.json"), "utf8")) as {
        servers: Record<string, { command?: string; args?: string[] }>;
      };
      expect(Object.keys(roster.servers).sort()).toEqual(["github", "roster"]);
      expect(roster.servers.roster).toMatchObject(mine); // their definition, intact
    });

    it("our OWN proxy entry is still never imported (identity, not name)", () => {
      // A config already pointing at us must not re-import the proxy as a server.
      const ours = rosterEntry();
      write(".cursor/mcp.json", JSON.stringify({ mcpServers: { roster: ours } }));
      const result = syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
      expect(result.imported).toBe(0);
      // Nothing was imported, so roster.json is never even written; if it does
      // exist it must not contain us.
      const rosterPath = path.join(home, ".roster/roster.json");
      if (fs.existsSync(rosterPath)) {
        const roster = JSON.parse(fs.readFileSync(rosterPath, "utf8")) as { servers: Record<string, unknown> };
        expect(roster.servers.roster).toBeUndefined();
      }
    });

    it("a bare `roster` command is NOT healthy without a trusted global on PATH", () => {
      const prev = process.env.ROSTER_ASSUME_GLOBAL;
      try {
        process.env.ROSTER_ASSUME_GLOBAL = "0"; // no global roster is ours
        write(".cursor/mcp.json", JSON.stringify({ mcpServers: { roster: { command: "roster", args: ["serve"] } } }));
        // Previously reported "already-synced": a stranger's (or absent) `roster`
        // binary left in place while the client believed it was installed.
        expect(syncClient("cursor", new Date("2026-07-05T01:00:00Z")).action).toBe("synced");
        const cfg = JSON.parse(fs.readFileSync(path.join(home, ".cursor/mcp.json"), "utf8")) as {
          mcpServers: { roster: { command: string } };
        };
        expect(cfg.mcpServers.roster.command).toBe(process.execPath); // healed to our own entrypoint
        const roster = JSON.parse(
          fs.readFileSync(path.join(home, ".roster/roster.json"), "utf8"),
        ) as { servers: Record<string, { command: string; args: string[] }> };
        expect(roster.servers.roster).toEqual({ command: "roster", args: ["serve"], importedFrom: ["cursor"] });
      } finally {
        if (prev === undefined) delete process.env.ROSTER_ASSUME_GLOBAL;
        else process.env.ROSTER_ASSUME_GLOBAL = prev;
      }
    });

    it("an existing foreign bin.js serve entry is imported and replaced, not declared healthy", () => {
      const foreignBin = write("foreign/bin.js", "console.log('foreign');\n");
      const foreign = { command: process.execPath, args: [foreignBin, "serve"] };
      write(".cursor/mcp.json", JSON.stringify({ mcpServers: { roster: foreign } }));

      const result = syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
      expect(result.action).toBe("synced");
      expect(result.imported).toBe(1);
      const saved = JSON.parse(
        fs.readFileSync(path.join(home, ".roster/roster.json"), "utf8"),
      ) as { servers: Record<string, { command: string; args: string[] }> };
      expect(saved.servers.roster).toMatchObject(foreign);
    });

    it("an unrelated npx command containing serve is imported instead of discarded", () => {
      const foreign = { command: "npx", args: ["--yes", "unrelated-package", "serve"] };
      write(".cursor/mcp.json", JSON.stringify({ mcpServers: { unrelated: foreign } }));

      const result = syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
      expect(result.imported).toBe(1);
      const saved = JSON.parse(
        fs.readFileSync(path.join(home, ".roster/roster.json"), "utf8"),
      ) as { servers: Record<string, { command: string; args: string[] }> };
      expect(saved.servers.unrelated).toMatchObject(foreign);
    });

    it("our command tuple plus a user-owned env block is not an exact owned entry", () => {
      const lookalike = {
        ...rosterEntry(),
        env: { USER_MARKER: "preserve-me" },
      };
      write(".cursor/mcp.json", JSON.stringify({ mcpServers: { customized: lookalike } }));

      const result = syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
      expect(result.action).toBe("synced");
      expect(result.imported).toBe(1);
      const saved = JSON.parse(
        fs.readFileSync(path.join(home, ".roster/roster.json"), "utf8"),
      ) as { servers: Record<string, { env?: Record<string, string> }> };
      expect(saved.servers.customized?.env).toEqual({ USER_MARKER: "preserve-me" });
    });

    it("an exact entry from an active manifest remains owned after the install moves", () => {
      write(
        ".cursor/mcp.json",
        JSON.stringify({ mcpServers: { github: { command: "github-mcp" } } }),
      );
      syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
      const clientDir = path.join(home, ".roster/backups/cursor");
      const backup = fs.readdirSync(clientDir).find((name) => name !== "latest" && !name.startsWith("."))!;
      const manifestPath = path.join(clientDir, backup, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        injectedEntry?: { command: string; args: string[] };
      };
      const historical = {
        command: process.execPath,
        args: [path.join(home, "removed-install", "bin.js"), "serve"],
      };
      manifest.injectedEntry = historical;
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      write(".cursor/mcp.json", JSON.stringify({ mcpServers: { oldRoster: historical } }));

      const result = syncClient("cursor", new Date("2026-07-05T02:00:00Z"));
      expect(result.action).toBe("already-synced");
      expect(result.imported).toBe(0);
    });

    it("eject does NOT delete a server the user added under the name `roster` after syncing", () => {
      const configPath = path.join(home, ".claude.json"); // state file → key-level restore
      syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));

      // User runs `claude mcp add roster …` pointing at their OWN server:
      const cur = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcpServers: Record<string, unknown> };
      cur.mcpServers.roster = mine; // same key we occupy — but not our entry
      cur.mcpServers.other = { command: "npx", args: ["-y", "other"] };
      fs.writeFileSync(configPath, JSON.stringify(cur, null, 2));

      expect(ejectClient("claude-code").action).toBe("restored");
      const after = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        mcpServers: Record<string, { command?: string; args?: string[] }>;
      };
      expect(after.mcpServers.roster).toMatchObject(mine); // THEIRS — survives
      expect(after.mcpServers.other).toBeDefined(); // ordinary post-sync addition survives
      expect(after.mcpServers.github).toBeDefined(); // pre-sync original restored
    });

    it("eject still removes the entry WE installed", () => {
      const configPath = path.join(home, ".claude.json");
      syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
      const synced = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcpServers: Record<string, unknown> };
      expect(synced.mcpServers.roster).toBeDefined(); // we are installed

      expect(ejectClient("claude-code").action).toBe("restored");
      const after = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        mcpServers: Record<string, { command?: string }>;
      };
      expect(after.mcpServers.roster).toBeUndefined(); // our proxy is gone
      expect(after.mcpServers.github).toBeDefined(); // their original is back
    });
  });

  /**
   * Eject's one promise is that it never loses your work and never restores the
   * wrong thing. Era closure used to be implied by a best-effort directory rename
   * that swallowed its failures — so when the rename failed, the next sync/eject
   * pair silently restored the PREVIOUS era's config over the user's current one
   * and reported success (R5-02).
   */
  describe("backup era closure is durable (R5-02)", () => {
    const configPath = () => path.join(home, ".cursor/mcp.json");
    const era = (marker: string) =>
      `${JSON.stringify({ marker, mcpServers: { [marker]: { command: marker } } }, null, 2)}\n`;

    // These two force an archive/close FAILURE via chmod, which only bites on
    // POSIX — Windows ignores mode bits for the owner, so the rename would succeed
    // and there'd be no failure to test. The fix itself (a durable marker) is
    // platform-independent fs+string logic, verified on macOS + Linux in CI.
    it.skipIf(process.platform === "win32")("a FAILED archive must not let a later eject restore the previous era", () => {
      const backupsRoot = path.join(home, ".roster", "backups");

      // Era 0: sync, then eject with archiving BLOCKED (backups root not writable).
      write(".cursor/mcp.json", era("ERA0"));
      syncClient("cursor", new Date("2026-07-12T12:00:00Z"));
      fs.chmodSync(backupsRoot, 0o500);
      expect(ejectClient("cursor").action).toBe("restored");
      fs.chmodSync(backupsRoot, 0o700);
      expect(fs.existsSync(path.join(backupsRoot, "cursor"))).toBe(true); // archive really did fail

      // Era 1: a genuinely new pristine, synced and then ejected normally.
      fs.writeFileSync(configPath(), era("ERA1"));
      syncClient("cursor", new Date("2026-07-12T12:00:01Z"));
      expect(ejectClient("cursor").action).toBe("restored");

      // It must be ERA1 that comes back — not the stale ERA0 sitting in the
      // un-archived backup directory.
      expect(fs.readFileSync(configPath(), "utf8")).toBe(era("ERA1"));
    });

    it.skipIf(process.platform === "win32")("says so loudly when the era cannot be closed at all", () => {
      write(".cursor/mcp.json", era("ERA0"));
      syncClient("cursor", new Date("2026-07-12T12:00:00Z"));
      const backupsRoot = path.join(home, ".roster", "backups");
      const clientDir = path.join(backupsRoot, "cursor");
      // Neither the marker (inside clientDir) nor the archive (rename inside
      // backupsRoot) can be written.
      fs.chmodSync(clientDir, 0o500);
      fs.chmodSync(backupsRoot, 0o500);
      const result = ejectClient("cursor");
      fs.chmodSync(backupsRoot, 0o700);
      fs.chmodSync(clientDir, 0o700);

      expect(result.action).toBe("restored"); // the restore itself did happen
      expect(result.detail).toMatch(/could not be closed/); // …but never silently
    });

    it("a normal eject still archives the era away", () => {
      write(".cursor/mcp.json", era("ERA0"));
      syncClient("cursor", new Date("2026-07-12T12:00:00Z"));
      expect(ejectClient("cursor").action).toBe("restored");
      expect(fs.existsSync(path.join(home, ".roster", "backups", "cursor"))).toBe(false);
      expect(ejectClient("cursor").action).toBe("no-backup"); // era is closed
    });
  });

  /**
   * roster.json and the backups hold whatever API keys sat in the imported
   * `env` blocks. They were created 0644 (and the backups dir 0755) under a
   * normal umask — world-readable — and sync REPLACED a user's own 0600 client
   * config with a fresh 0644 one, silently undoing their hardening (R5-06).
   */
  describe.skipIf(process.platform === "win32")("secrets are owner-only on disk (R5-06)", () => {
    const mode = (p: string) => (fs.statSync(p).mode & 0o777).toString(8);

    it("never loosens an existing config, and creates its own files 0600 / dirs 0700", () => {
      const prevUmask = process.umask(0o022); // the permissive default that exposed this
      try {
        const configPath = path.join(home, ".cursor/mcp.json");
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(
          configPath,
          JSON.stringify({ mcpServers: { gh: { command: "npx", env: { TOKEN: "s3cret" } } } }),
          { mode: 0o600 }, // the user hardened this themselves
        );

        const result = syncClient("cursor", new Date("2026-07-05T01:00:00Z"));

        expect(mode(configPath)).toBe("600"); // preserved, not downgraded to 644
        expect(mode(path.join(home, ".roster/roster.json"))).toBe("600"); // holds the imported TOKEN
        expect(mode(path.join(result.backupDir!, "original"))).toBe("600"); // verbatim copy of their config
        expect(mode(path.join(result.backupDir!, "manifest.json"))).toBe("600");
        expect(mode(path.dirname(result.backupDir!))).toBe("700"); // dir listing leaks which clients they run
      } finally {
        process.umask(prevUmask);
      }
    });
  });

  it("a UTF-8 BOM on a client config does not abort the sync — the server is still imported (D2)", () => {
    const configPath = path.join(home, ".claude.json");
    // Editors write a leading BOM; JSON.parse chokes on it. One BOM'd config
    // once aborted a whole fleet run AND lost the import. Both must survive.
    const bom = String.fromCharCode(0xfeff); // U+FEFF UTF-8 BOM
    fs.writeFileSync(
      configPath,
      `${bom}{ "mcpServers": { "linear": { "command": "npx", "args": ["-y", "linear-mcp"] } } }`,
    );
    const result = syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
    expect(result.action).toBe("synced");
    expect(result.imported).toBe(1); // linear was imported, not lost to a parse abort
    expect(fs.readFileSync(path.join(home, ".roster/roster.json"), "utf8")).toContain("linear");
    const rewritten = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(rewritten.mcpServers)).toEqual(["roster"]); // clean roster-only rewrite
  });
});
