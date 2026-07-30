import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "@rosterhq/coach";
import { CLIENTS, discoverClients, type ClientId } from "./clients.js";
import { parseJsonc } from "./jsonc.js";
import { buildReceipt } from "./receipt.js";
import { withFileLockSync } from "./lock.js";
import { atomicWriteFileSync, defaultConfig, mergeServers } from "./rosterfile.js";
import { createEjectJournal, hasEjectJournal } from "./ejectJournal.js";
import { ejectClient } from "./eject.js";
import { rosterEntry } from "./entry.js";
import { readRegularFileNoFollow } from "./safeFile.js";
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

  it("sweeps a staging dir orphaned by an interrupted prior sync (L12)", () => {
    expect(syncClient("codex", new Date("2026-07-05T01:00:00Z")).action).toBe("synced");
    const backupsDir = path.join(home, ".roster/backups/codex");

    // Simulate a sync that crashed after mkdir(staging) but before the atomic
    // rename into place: a `<ts>.staging-<hex>` dir carrying a partial, private
    // copy of the config. Nothing ever removed these, so they leaked forever.
    const orphan = path.join(backupsDir, "2026-07-05T09-09-09-999Z.staging-deadbeef");
    fs.mkdirSync(orphan, { recursive: true });
    fs.writeFileSync(path.join(orphan, "original"), "PARTIAL — never published");
    expect(fs.existsSync(orphan)).toBe(true);

    // The next sync (already-synced here) runs under the client lock and must
    // garbage-collect the orphan while leaving real, published backups intact.
    syncClient("codex", new Date("2026-07-05T02:00:00Z"));
    expect(fs.existsSync(orphan)).toBe(false);
    const realBackups = fs
      .readdirSync(backupsDir)
      .filter((n) => !n.startsWith(".") && !n.includes(".staging-") && n !== "latest");
    expect(realBackups.length).toBeGreaterThanOrEqual(1);
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

  /**
   * NEW-1 regression. Claude Code rewrites its state file and annotates every
   * MCP entry with `type: "stdio"`. On the reviewed base, `normalizeSpawnEntry`
   * required EXACTLY {command,args}, so the annotated proxy no longer matched;
   * eject reported "restored" while leaving Roster's proxy installed, then
   * closed the era so a retry found no backup — the flagship client left
   * permanently rosterized. Ownership must tolerate the known-inert client
   * transport annotation while still requiring exact command/args and rejecting
   * meaningful env / conflicting transport.
   */
  describe("eject recognizes a client-annotated owned proxy (NEW-1)", () => {
    const configPath = () => path.join(home, ".claude.json");
    const annotateRosterEntry = (extra: Record<string, unknown>): void => {
      const cfg = JSON.parse(fs.readFileSync(configPath(), "utf8")) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      expect(cfg.mcpServers.roster, "roster proxy present after sync").toBeDefined();
      cfg.mcpServers.roster = { ...cfg.mcpServers.roster, ...extra }; // client re-serializes with extra keys
      fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
    };

    it('removes the proxy when the client added type:"stdio", and closes the era', () => {
      syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
      annotateRosterEntry({ type: "stdio" });

      const result = ejectClient("claude-code");
      expect(result.action).toBe("restored");
      const after = JSON.parse(fs.readFileSync(configPath(), "utf8")) as {
        mcpServers: Record<string, unknown>;
      };
      expect(after.mcpServers).not.toHaveProperty("roster"); // proxy actually removed
      expect(after.mcpServers).toHaveProperty("github"); // user's server restored
      // Era closed on genuine success: a retry finds nothing to restore.
      expect(ejectClient("claude-code").action).toBe("no-backup");
    });

    it("NEVER removes a lookalike: user server named roster / env / different command survive", () => {
      // A user's OWN server, merely sharing the name and even the command+args
      // but carrying a meaningful env (a token) — a hardened lookalike.
      syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
      const injected = rosterEntry();
      const cfg = JSON.parse(fs.readFileSync(configPath(), "utf8")) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      cfg.mcpServers.roster = { ...injected, env: { TOKEN: "sk-secret" } }; // meaningful env
      cfg.mcpServers.mine = { command: injected.command, args: injected.args, type: "http" }; // conflicting transport
      cfg.mcpServers.other = { command: "some-other", args: ["serve"] }; // different command
      fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));

      const result = ejectClient("claude-code");
      expect(result.action).toBe("restored");
      const after = JSON.parse(fs.readFileSync(configPath(), "utf8")) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      // The env-bearing lookalike is the user's; it MUST survive (data-loss guard).
      expect(after.mcpServers.roster).toEqual({ ...injected, env: { TOKEN: "sk-secret" } });
      expect(after.mcpServers.mine).toBeDefined(); // conflicting transport → not ours
      expect(after.mcpServers.other).toBeDefined(); // different command → not ours
    });
  });

  /**
   * NEW-3. A key-level eject that was interrupted leaves a durable journal. If the
   * client then rewrites its state file to a THIRD state (neither the rosterized
   * "before" nor the planned "desired"), the reviewed base refused on resume and
   * RETAINED the journal — and sync refuses while a journal exists — so eject and
   * sync were both permanently locked out. Resume now RE-DERIVES the key-level
   * merge idempotently from the current bytes, so the client recovers.
   */
  describe("key-level eject journal recovers from a third state (NEW-3)", () => {
    const configPath = () => path.join(home, ".claude.json");
    const boundary = "2026-07-05T01-00-00-000Z";

    function plantInterruptedKeyLevelJournal(): void {
      // A real pending journal, as an eject that died after writing the journal
      // but before completing would leave. Inputs mirror planRestore's state-file
      // branch: pre-sync original bytes, the injected proxy, and a plausible
      // desired (unused on the third-state path, which re-derives).
      const backupDir = path.join(home, ".roster", "backups", "claude-code", boundary);
      const originalBytes = fs.readFileSync(path.join(backupDir, "original"));
      const rosterizedBytes = fs.readFileSync(configPath());
      createEjectJournal("claude-code", boundary, [
        {
          sourcePath: configPath(),
          beforeSha256: sha256Hex(rosterizedBytes),
          desiredBytes: originalBytes,
          keyLevel: true,
          originalBytes,
          injectedEntries: [rosterEntry()],
        },
      ]);
    }

    it("re-derives the merge from a third-state file instead of deadlocking", () => {
      syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
      plantInterruptedKeyLevelJournal();
      expect(hasEjectJournal("claude-code")).toBe(true);

      // The client rewrites its state file AGAIN (a third state): bumps live
      // state, adds a brand-new user server, and — as a real client would — still
      // carries the roster proxy it has not been told to drop yet.
      const cfg = JSON.parse(fs.readFileSync(configPath(), "utf8")) as {
        mcpServers: Record<string, unknown>;
        numStartups?: number;
      };
      cfg.numStartups = 99;
      cfg.mcpServers.newthing = { command: "new-mcp", args: ["--go"] };
      fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));

      const result = ejectClient("claude-code"); // resume path
      expect(result.action).toBe("restored");
      const after = JSON.parse(fs.readFileSync(configPath(), "utf8")) as {
        mcpServers: Record<string, unknown>;
        numStartups?: number;
      };
      expect(after.mcpServers).not.toHaveProperty("roster"); // owned proxy removed
      expect(after.mcpServers).toHaveProperty("github"); // pre-sync original restored
      expect(after.mcpServers).toHaveProperty("newthing"); // post-crash user addition preserved
      expect(after.numStartups).toBe(99); // unrelated live state preserved

      // Deadlock broken: journal cleared, and sync is usable again.
      expect(hasEjectJournal("claude-code")).toBe(false);
      expect(["synced", "already-synced"]).toContain(
        syncClient("claude-code", new Date("2026-07-06T01:00:00Z")).action,
      );
    });

    it("a corrupt journal is refused (recoverable), never silently applied", () => {
      syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
      plantInterruptedKeyLevelJournal();
      // Corrupt the plan on disk.
      fs.writeFileSync(
        path.join(home, ".roster", "eject-journals", "claude-code", "plan.json"),
        "{ not valid json",
      );
      const result = ejectClient("claude-code");
      expect(result.action).toBe("integrity-error");
      expect(hasEjectJournal("claude-code")).toBe(true); // retained for inspection
    });
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

  it("handles a deleted ordinary config directory with --force", () => {
    const configPath = write(
      ".cursor/mcp.json",
      `${JSON.stringify({ mcpServers: { github: { command: "github-mcp" } } })}\n`,
    );
    const original = fs.readFileSync(configPath);
    syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
    fs.rmSync(path.dirname(configPath), { recursive: true });

    expect(ejectClient("cursor").action).toBe("missing-file");
    expect(ejectClient("cursor", { force: true }).action).toBe("restored");
    expect(fs.readFileSync(configPath)).toEqual(original);
  });

  describe.skipIf(process.platform === "win32")("symlink-preserving client writes", () => {
    const sourcePath = () => path.join(home, ".cursor/mcp.json");
    const targetPath = () => path.join(home, "cursor-target.json");
    const original = `${JSON.stringify({
      theme: "dark",
      mcpServers: { github: { command: "github-mcp" } },
    }, null, 2)}\n`;

    function installSymlink(target = targetPath()): string {
      fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
      fs.writeFileSync(target, original);
      const rawTarget = path.relative(path.dirname(sourcePath()), target);
      fs.symlinkSync(rawTarget, sourcePath());
      return rawTarget;
    }

    it("sync and eject preserve the link and restore bytes through its original target", () => {
      const rawTarget = installSymlink();

      const synced = syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
      expect(fs.lstatSync(sourcePath()).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(sourcePath())).toBe(rawTarget);
      expect(fs.readFileSync(targetPath(), "utf8")).toContain('"roster"');
      const manifest = JSON.parse(
        fs.readFileSync(path.join(synced.backupDir!, "manifest.json"), "utf8"),
      ) as { writePath?: string; symlinkTarget?: string };
      expect(manifest.writePath).toBe(fs.realpathSync(targetPath()));
      expect(manifest.symlinkTarget).toBe(rawTarget);

      expect(ejectClient("cursor").action).toBe("restored");
      expect(fs.lstatSync(sourcePath()).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(sourcePath())).toBe(rawTarget);
      expect(fs.readFileSync(targetPath(), "utf8")).toBe(original);
    });

    it("refuses a repointed link without touching either target", () => {
      installSymlink();
      syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
      const syncedBytes = fs.readFileSync(targetPath());
      const secondTarget = path.join(home, "cursor-other.json");
      fs.writeFileSync(secondTarget, syncedBytes);
      fs.unlinkSync(sourcePath());
      fs.symlinkSync(path.relative(path.dirname(sourcePath()), secondTarget), sourcePath());

      const firstBefore = fs.readFileSync(targetPath());
      const secondBefore = fs.readFileSync(secondTarget);
      const result = ejectClient("cursor");
      expect(result.action).toBe("refused-modified");
      expect(result.detail).toMatch(/symlink|topology/i);
      expect(fs.readFileSync(targetPath())).toEqual(firstBefore);
      expect(fs.readFileSync(secondTarget)).toEqual(secondBefore);
    });

    it("refuses a repointed symlinked parent directory without touching either config", () => {
      const firstDir = path.join(home, "cursor-dir-one");
      const secondDir = path.join(home, "cursor-dir-two");
      fs.mkdirSync(firstDir);
      fs.mkdirSync(secondDir);
      const firstConfig = path.join(firstDir, "mcp.json");
      const secondConfig = path.join(secondDir, "mcp.json");
      fs.writeFileSync(firstConfig, original);
      fs.symlinkSync(firstDir, path.join(home, ".cursor"), "dir");

      syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
      const syncedBytes = fs.readFileSync(firstConfig);
      fs.writeFileSync(secondConfig, syncedBytes);
      fs.unlinkSync(path.join(home, ".cursor"));
      fs.symlinkSync(secondDir, path.join(home, ".cursor"), "dir");

      const firstBefore = fs.readFileSync(firstConfig);
      const secondBefore = fs.readFileSync(secondConfig);
      const result = ejectClient("cursor");
      expect(result.action).toBe("refused-modified");
      expect(result.detail).toMatch(/symlink|topology/i);
      expect(fs.readFileSync(firstConfig)).toEqual(firstBefore);
      expect(fs.readFileSync(secondConfig)).toEqual(secondBefore);
    });
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
    expect(result.action).toBe("integrity-error");
    expect(result.detail).toContain("INTEGRITY");
    // The (rosterized) config was NOT overwritten with corrupt bytes.
    expect(Buffer.compare(fs.readFileSync(configPath), configBefore)).toBe(0);
  });

  it("rejects corruption in a non-pristine backup before restoring any path", () => {
    const configPath = path.join(home, ".codex/config.toml");
    syncClient("codex", new Date("2026-07-05T01:00:00Z"));
    fs.writeFileSync(
      configPath,
      `model = "gpt-5"\n\n[mcp_servers.later]\ncommand = "later-mcp"\n`,
    );
    syncClient("codex", new Date("2026-07-05T02:00:00Z"));
    const clientDir = path.join(home, ".roster/backups/codex");
    const backups = fs
      .readdirSync(clientDir)
      .filter((name) => !name.startsWith(".") && name !== "latest")
      .sort();
    expect(backups).toHaveLength(2);
    fs.writeFileSync(path.join(clientDir, backups[1]!, "original"), "TAMPERED");
    const before = fs.readFileSync(configPath);

    const result = ejectClient("codex");
    expect(result.action).toBe("integrity-error");
    expect(result.detail).toContain("INTEGRITY");
    expect(fs.readFileSync(configPath)).toEqual(before);
  });

  it("refuses a corrupt backup-era boundary instead of reopening stale backups", () => {
    const configPath = write(
      ".cursor/mcp.json",
      `${JSON.stringify({ mcpServers: { github: { command: "github-mcp" } } })}\n`,
    );
    syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
    const before = fs.readFileSync(configPath);
    fs.writeFileSync(
      path.join(home, ".roster/backups/cursor/.closed-through"),
      "not-a-boundary\n",
    );

    const result = ejectClient("cursor");
    expect(result.action).toBe("integrity-error");
    expect(result.detail).toMatch(/boundary|marker/i);
    expect(fs.readFileSync(configPath)).toEqual(before);
  });

  it("eject restores every active Claude project path before closing the era", () => {
    const previousCwd = process.cwd();
    const firstProject = path.join(home, "projects", "first");
    const secondProject = path.join(home, "projects", "second");
    const firstConfig = path.join(firstProject, ".mcp.json");
    const secondConfig = path.join(secondProject, ".mcp.json");
    const firstOriginal = `${JSON.stringify({
      marker: "first",
      mcpServers: { first: { command: "first-mcp" } },
    })}\n`;
    const secondOriginal = `${JSON.stringify({
      marker: "second",
      mcpServers: { second: { command: "second-mcp" } },
    })}\n`;
    fs.rmSync(path.join(home, ".claude.json"));
    fs.mkdirSync(firstProject, { recursive: true });
    fs.mkdirSync(secondProject, { recursive: true });
    fs.writeFileSync(firstConfig, firstOriginal);
    fs.writeFileSync(secondConfig, secondOriginal);

    try {
      process.chdir(firstProject);
      syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
      process.chdir(secondProject);
      syncClient("claude-code", new Date("2026-07-05T02:00:00Z"));

      const result = ejectClient("claude-code");
      expect(result.action).toBe("restored");
      expect(result.restoredPaths?.sort()).toEqual(
        [fs.realpathSync(firstConfig), fs.realpathSync(secondConfig)].sort(),
      );
      expect(fs.readFileSync(firstConfig, "utf8")).toBe(firstOriginal);
      expect(fs.readFileSync(secondConfig, "utf8")).toBe(secondOriginal);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("recovers an interrupted eject after target write and closes only its planned era", async () => {
    const configPath = write(
      ".cursor/mcp.json",
      `${JSON.stringify({ marker: "ERA0", mcpServers: { zero: { command: "zero" } } })}\n`,
    );
    const era0 = fs.readFileSync(configPath);
    syncClient("cursor", new Date("2026-07-05T01:00:00Z"));

    const barrier = path.join(home, "eject-close-barrier");
    const worker = `
      import fs from "node:fs";
      const originalOpen = fs.openSync;
      fs.openSync = function(file, ...args) {
        const candidate = String(file);
        if (candidate.includes(".closed-through.") && candidate.endsWith(".tmp")) {
          fs.writeFileSync(process.env.BARRIER, "ready");
          for (;;) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
        return originalOpen.call(fs, file, ...args);
      };
      const { ejectClient } = await import(${JSON.stringify(
        pathToFileURL(path.resolve("packages/cli/dist/eject.js")).href,
      )});
      ejectClient("cursor");
    `;
    const child = spawn(process.execPath, ["--input-type=module", "--eval", worker], {
      cwd: path.resolve("."),
      env: {
        ...process.env,
        ROSTER_TEST_HOME: home,
        ROSTER_HOME: path.join(home, ".roster"),
        BARRIER: barrier,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 5_000;
      const poll = (): void => {
        if (fs.existsSync(barrier)) {
          resolve();
          return;
        }
        if (child.exitCode !== null) {
          reject(new Error(`eject worker exited before the close barrier: ${stderr}`));
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error(`eject worker did not reach the close barrier: ${stderr}`));
          return;
        }
        setTimeout(poll, 5);
      };
      poll();
    });
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    expect(fs.readFileSync(configPath)).toEqual(era0);
    expect(() =>
      syncClient("cursor", new Date("2026-07-05T01:30:00Z")),
    ).toThrow(/pending recovery/i);
    if (process.platform !== "win32") {
      const journal = path.join(home, ".roster/eject-journals/cursor");
      const mode = (target: string) => fs.statSync(target).mode & 0o777;
      expect(mode(journal)).toBe(0o700);
      expect(mode(path.join(journal, "plan.json"))).toBe(0o600);
      expect(mode(path.join(journal, "target-0.bin"))).toBe(0o600);
    }

    const recovered = ejectClient("cursor");
    expect(recovered.action).toBe("restored");

    const era1 = `${JSON.stringify({
      marker: "ERA1",
      mcpServers: { one: { command: "one" } },
    })}\n`;
    fs.writeFileSync(configPath, era1);
    syncClient("cursor", new Date("2026-07-05T02:00:00Z"));
    expect(ejectClient("cursor").action).toBe("restored");
    expect(fs.readFileSync(configPath, "utf8")).toBe(era1);
  });

  it("preserves a state-file change that lands between planning and publish", () => {
    const configPath = path.join(home, ".claude.json");
    syncClient("claude-code", new Date("2026-07-05T01:00:00Z"));
    const canonicalConfigPath = fs.realpathSync(configPath);
    const configStat = fs.statSync(canonicalConfigPath, { bigint: true });
    const originalRead = fs.readFileSync;
    let changed = false;
    fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      const value = Reflect.apply(originalRead, fs, [file, ...args]) as Buffer | string;
      const readsConfig =
        typeof file === "number"
          ? (() => {
              const stat = fs.fstatSync(file, { bigint: true });
              return stat.dev === configStat.dev && stat.ino === configStat.ino;
            })()
          : fs.realpathSync(String(file)) === canonicalConfigPath;
      if (
        !changed &&
        readsConfig
      ) {
        changed = true;
        const live = JSON.parse(Buffer.isBuffer(value) ? value.toString("utf8") : value) as Record<
          string,
          unknown
        >;
        live.concurrentSetting = "keep-me";
        fs.writeFileSync(configPath, `${JSON.stringify(live, null, 2)}\n`);
      }
      return value;
    }) as typeof fs.readFileSync;
    try {
      expect(ejectClient("claude-code").action).toBe("restored");
    } finally {
      fs.readFileSync = originalRead;
    }

    const restored = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(restored.concurrentSetting).toBe("keep-me");
  });

  it("the built CLI exits nonzero on backup-manifest integrity failure", () => {
    write(
      ".cursor/mcp.json",
      `${JSON.stringify({ mcpServers: { github: { command: "github-mcp" } } })}\n`,
    );
    syncClient("cursor", new Date("2026-07-05T01:00:00Z"));
    const clientDir = path.join(home, ".roster/backups/cursor");
    const backup = fs.readdirSync(clientDir).find((name) => !name.startsWith(".") && name !== "latest")!;
    fs.writeFileSync(path.join(clientDir, backup, "manifest.json"), "{ broken");

    const result = spawnSync(
      process.execPath,
      [path.resolve("packages/cli/dist/bin.js"), "eject", "--client", "cursor"],
      {
        cwd: path.resolve("."),
        env: {
          ...process.env,
          ROSTER_TEST_HOME: home,
          ROSTER_HOME: path.join(home, ".roster"),
        },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/INTEGRITY/i);
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
    expect(result.action).toBe("integrity-error");
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

  describe("descriptor-pinned integrity reads", () => {
    it("reads through the validated descriptor instead of reopening the path", () => {
      const target = write("integrity/original.bin", "trusted");
      const originalRead = fs.readFileSync;
      let descriptorRead = false;
      fs.readFileSync = ((file, ...args) => {
        if (typeof file === "number") {
          descriptorRead = true;
        } else if (path.resolve(String(file)) === path.resolve(target)) {
          throw new Error("integrity path was reopened");
        }
        return Reflect.apply(originalRead, fs, [file, ...args]);
      }) as typeof fs.readFileSync;
      try {
        expect(readRegularFileNoFollow(target).toString("utf8")).toBe("trusted");
      } finally {
        fs.readFileSync = originalRead;
      }
      expect(descriptorRead).toBe(true);
    });

    it("rejects a different file installed at the path after open", () => {
      const target = write("integrity/swap.bin", "trusted");
      const displaced = path.join(home, "integrity/swap-displaced.bin");
      const originalOpen = fs.openSync;
      let replaced = false;
      fs.openSync = ((file, ...args) => {
        const fd = Reflect.apply(originalOpen, fs, [file, ...args]);
        if (!replaced && path.resolve(String(file)) === path.resolve(target)) {
          replaced = true;
          fs.renameSync(target, displaced);
          fs.writeFileSync(target, "attacker-controlled");
        }
        return fd;
      }) as typeof fs.openSync;
      try {
        expect(() => readRegularFileNoFollow(target)).toThrow(/changed while being opened/i);
      } finally {
        fs.openSync = originalOpen;
      }
    });
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

      expect(result.action).toBe("integrity-error"); // restore landed, but the operation is not safely complete
      expect(result.detail).toMatch(/could not be closed/); // never a zero-exit success
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
