import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ejectClient } from "../../../packages/cli/src/eject.js";
import { syncClient } from "../../../packages/cli/src/sync.js";

let home: string;

function write(rel: string, content: string): string {
  const abs = path.join(home, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

const gnarlyToml = `# my precious comments
model = "gpt-5" # inline comment

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
`;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-probe-home-"));
  process.env.ROSTER_TEST_HOME = home;
  process.env.ROSTER_HOME = path.join(home, ".roster");
  write(".codex/config.toml", gnarlyToml);
  write(
    ".claude.json",
    `{\n  "theme": "dark",\n  "mcpServers": { "github": { "command": "npx" } }\n}\n`,
  );
});

afterEach(() => {
  delete process.env.ROSTER_TEST_HOME;
  delete process.env.ROSTER_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

function backupNames(): string[] {
  const clientDir = path.join(home, ".roster/backups/codex");
  return fs.readdirSync(clientDir).sort();
}
function backupDirCount(): number {
  const clientDir = path.join(home, ".roster/backups/codex");
  return fs
    .readdirSync(clientDir)
    .filter((d) => d !== "latest" && fs.statSync(path.join(clientDir, d)).isDirectory()).length;
}

describe("PROBE — reproducing the shipped weak test exactly (probe1)", () => {
  it("second sync short-circuits to already-synced; only ONE backup exists", () => {
    const configPath = path.join(home, ".codex/config.toml");
    const t1 = syncClient("codex", new Date("2026-07-05T01:00:00Z"));
    // EXACT bytes the shipped test writes as the alleged "wrong-restore target":
    fs.writeFileSync(
      configPath,
      `model = "gpt-5"\n\n[mcp_servers.roster]\ncommand = "roster"\nargs = ["serve"]\n`,
    );
    const t2 = syncClient("codex", new Date("2026-07-05T02:00:00Z"));

    console.log("PROBE1 t1.action =", t1.action);
    console.log("PROBE1 t2.action =", t2.action);
    console.log("PROBE1 backup entries =", JSON.stringify(backupNames()));
    console.log("PROBE1 backup dir count =", backupDirCount());

    const configBefore = fs.readFileSync(configPath);
    const clientDir = path.join(home, ".roster/backups/codex");
    const oldest = fs.readdirSync(clientDir).filter((d) => d !== "latest").sort()[0]!;
    fs.writeFileSync(path.join(clientDir, oldest, "manifest.json"), "{ not valid json");

    const result = ejectClient("codex");
    console.log("PROBE1 eject.action =", result.action, "| detail =", result.detail);
    console.log(
      "PROBE1 config unchanged after eject =",
      Buffer.compare(fs.readFileSync(configPath), configBefore) === 0,
    );

    // The load-bearing factual claim: exactly one backup, second sync no-ops.
    expect(t2.action).toBe("already-synced");
    expect(backupDirCount()).toBe(1);
  });
});

describe("PROBE — the CORRECT 2-backup setup the claim proposes (probe2)", () => {
  it("second sync writes a NON-roster server → real 2nd backup with distinct bytes", () => {
    const configPath = path.join(home, ".codex/config.toml");
    const t1 = syncClient("codex", new Date("2026-07-05T01:00:00Z"));
    const firstRosterizedBytes = fs.readFileSync(configPath);
    // User adds a NON-roster server after sync → rewriteConfig != null → 2nd backup.
    fs.writeFileSync(
      configPath,
      `model = "gpt-5"\n\n[mcp_servers.roster]\ncommand = "roster"\nargs = ["serve"]\n\n[mcp_servers.evil]\ncommand = "npx"\nargs = ["-y", "evil-mcp"]\n`,
    );
    const secondUserBytes = fs.readFileSync(configPath);
    const t2 = syncClient("codex", new Date("2026-07-05T02:00:00Z"));

    console.log("PROBE2 t1.action =", t1.action);
    console.log("PROBE2 t2.action =", t2.action);
    console.log("PROBE2 backup entries =", JSON.stringify(backupNames()));
    console.log("PROBE2 backup dir count =", backupDirCount());

    const clientDir = path.join(home, ".roster/backups/codex");
    const dirs = fs.readdirSync(clientDir).filter((d) => d !== "latest").sort();
    // Show what each backup's "original" bytes are.
    for (const d of dirs) {
      const orig = fs.readFileSync(path.join(clientDir, d, "original"), "utf8");
      const firstLine = orig.split("\n").slice(0, 1).join("");
      const hasEvil = orig.includes("evil");
      console.log(`PROBE2 backup ${d}: firstLine="${firstLine}" hasEvil=${hasEvil}`);
    }

    const configBefore = fs.readFileSync(configPath); // rosterized-again bytes
    // Corrupt ONLY the oldest (pristine) manifest — same as the shipped test.
    const oldest = dirs[0]!;
    fs.writeFileSync(path.join(clientDir, oldest, "manifest.json"), "{ not valid json");

    const result = ejectClient("codex");
    console.log("PROBE2 eject.action =", result.action, "| detail =", result.detail);
    const cfgNow = fs.readFileSync(configPath);
    console.log(
      "PROBE2 config unchanged =",
      Buffer.compare(cfgNow, configBefore) === 0,
      "| equals-2nd-user-bytes(WRONG-RESTORE) =",
      Buffer.compare(cfgNow, secondUserBytes) === 0,
    );
    void firstRosterizedBytes;

    // In the correct setup TWO real backups exist.
    expect(t2.action).toBe("synced");
    expect(backupDirCount()).toBe(2);
    // Fixed code refuses; config not overwritten with the 2nd backup's bytes.
    expect(result.action).toBe("no-backup");
    expect(String(result.detail)).toContain("INTEGRITY");
  });
});
