import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "@rosterhq/coach";
import { CLIENTS, discoverClients, type ClientId } from "./clients.js";
import { parseJsonc } from "./jsonc.js";
import { buildReceipt } from "./receipt.js";
import { atomicWriteFileSync, defaultConfig, mergeServers } from "./rosterfile.js";
import { ejectClient } from "./eject.js";
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
    fs.writeFileSync(
      configPath,
      `model = "gpt-5"

[mcp_servers.roster]
command = "roster"
args = ["serve"]

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

  it("does not report 'synced' (or clobber the client config) when the import step genuinely fails", () => {
    const configPath = path.join(home, ".codex/config.toml"); // beforeEach seeds context7 to import
    // Corrupt roster.json so loadConfig() throws DURING import — previously swallowed.
    fs.mkdirSync(path.join(home, ".roster"), { recursive: true });
    fs.writeFileSync(path.join(home, ".roster/roster.json"), "{ not valid json");

    expect(() => syncClient("codex", new Date("2026-07-05T01:00:00Z"))).toThrow();
    // Trust invariant: the client config is untouched — servers still route to context7, not nowhere.
    expect(fs.readFileSync(configPath, "utf8")).toContain("context7");
  });
});
