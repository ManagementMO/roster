import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "@rosterhq/coach";
import { atomicWriteFileSync } from "../../../packages/cli/src/rosterfile.js";
import { rawBackups, listBackups, syncClient } from "../../../packages/cli/src/sync.js";
import type { ClientId } from "../../../packages/cli/src/clients.js";

/**
 * MUTANT eject: a plausible FUTURE refactor that "helpfully" advances to the
 * oldest backup that still HAS a valid manifest when the true-oldest manifest
 * is corrupt, and only falls back to the INTEGRITY refusal when NO valid
 * backup exists at all. This is precisely the "advance-to-newer-when-a-newer-
 * exists" behavior the shipped test's title says it guards against. Everything
 * else mirrors the real ejectClient body.
 */
function ejectMutant(clientId: ClientId, opts: { force?: boolean } = {}) {
  const all = rawBackups(clientId);
  if (all.length === 0) return { client: clientId, action: "no-backup" as const };
  let chosen = all[0]!;
  if (!chosen.manifest) {
    const advanced = all.find((b) => b.manifest !== null); // <-- the regression
    if (!advanced) {
      return {
        client: clientId,
        action: "no-backup" as const,
        detail:
          "BACKUP INTEGRITY FAILURE: the pristine backup's manifest is missing or corrupt — refusing to restore a different backup; inspect the backup dir",
      };
    }
    chosen = advanced;
  }
  const manifest = chosen.manifest!;
  const targetPath = manifest.sourcePath;
  const latest =
    listBackups(clientId)
      .filter((b) => b.manifest.sourcePath === targetPath)
      .pop() ?? { dir: chosen.dir, manifest };
  const originalPath = path.join(chosen.dir, "original");
  if (!fs.existsSync(originalPath))
    return { client: clientId, action: "no-backup" as const, detail: "backup bytes missing" };
  if (fs.existsSync(targetPath)) {
    const currentSha = sha256Hex(fs.readFileSync(targetPath));
    if (currentSha !== latest.manifest.writtenSha256 && !opts.force)
      return { client: clientId, action: "refused-modified" as const };
  }
  const originalBytes = fs.readFileSync(originalPath);
  if (sha256Hex(originalBytes) !== manifest.originalSha256)
    return { client: clientId, action: "no-backup" as const, detail: "hash mismatch" };
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  atomicWriteFileSync(targetPath, originalBytes);
  return { client: clientId, action: "restored" as const, configPath: targetPath };
}

let home: string;
function write(rel: string, content: string) {
  const abs = path.join(home, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
const gnarlyToml = `# my precious comments
model = "gpt-5" # inline comment

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
`;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-mutant-home-"));
  process.env.ROSTER_TEST_HOME = home;
  process.env.ROSTER_HOME = path.join(home, ".roster");
  write(".codex/config.toml", gnarlyToml);
});
afterEach(() => {
  delete process.env.ROSTER_TEST_HOME;
  delete process.env.ROSTER_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

describe("MUTANT catch-power", () => {
  it("SHIPPED-TEST setup (1 backup) — does it catch the advance-to-newer mutant?", () => {
    const configPath = path.join(home, ".codex/config.toml");
    syncClient("codex", new Date("2026-07-05T01:00:00Z"));
    fs.writeFileSync(
      configPath,
      `model = "gpt-5"\n\n[mcp_servers.roster]\ncommand = "roster"\nargs = ["serve"]\n`,
    );
    syncClient("codex", new Date("2026-07-05T02:00:00Z")); // no-op: already-synced
    const configBefore = fs.readFileSync(configPath);
    const clientDir = path.join(home, ".roster/backups/codex");
    const oldest = fs.readdirSync(clientDir).filter((d) => d !== "latest").sort()[0]!;
    fs.writeFileSync(path.join(clientDir, oldest, "manifest.json"), "{ not valid json");

    const result = ejectMutant("codex");
    // Replay the SHIPPED test's exact assertions against the MUTANT:
    const actionOk = result.action === "no-backup";
    const detailOk = String((result as { detail?: string }).detail ?? "").includes("INTEGRITY");
    const configOk = Buffer.compare(fs.readFileSync(configPath), configBefore) === 0;
    console.log(
      `MUTANT vs SHIPPED-SETUP: action=${result.action} action_ok=${actionOk} detail_ok=${detailOk} config_ok=${configOk} => SHIPPED TEST ${actionOk && detailOk && configOk ? "PASSES (misses the bug)" : "FAILS (catches it)"}`,
    );
    // The point: the shipped test's assertions all hold even on the buggy mutant.
    expect(actionOk && detailOk && configOk).toBe(true);
  });

  it("CORRECT setup (2 backups) — does it catch the advance-to-newer mutant?", () => {
    const configPath = path.join(home, ".codex/config.toml");
    syncClient("codex", new Date("2026-07-05T01:00:00Z"));
    fs.writeFileSync(
      configPath,
      `model = "gpt-5"\n\n[mcp_servers.roster]\ncommand = "roster"\nargs = ["serve"]\n\n[mcp_servers.evil]\ncommand = "npx"\nargs = ["-y", "evil-mcp"]\n`,
    );
    const secondUserBytes = fs.readFileSync(configPath);
    syncClient("codex", new Date("2026-07-05T02:00:00Z")); // real 2nd backup
    const configBefore = fs.readFileSync(configPath);
    const clientDir = path.join(home, ".roster/backups/codex");
    const oldest = fs.readdirSync(clientDir).filter((d) => d !== "latest").sort()[0]!;
    fs.writeFileSync(path.join(clientDir, oldest, "manifest.json"), "{ not valid json");

    const result = ejectMutant("codex");
    const actionOk = result.action === "no-backup";
    const detailOk = String((result as { detail?: string }).detail ?? "").includes("INTEGRITY");
    const cfgNow = fs.readFileSync(configPath);
    const configOk = Buffer.compare(cfgNow, configBefore) === 0;
    const wrongRestored = Buffer.compare(cfgNow, secondUserBytes) === 0;
    console.log(
      `MUTANT vs CORRECT-SETUP: action=${result.action} action_ok=${actionOk} detail_ok=${detailOk} config_ok=${configOk} wrongRestored=${wrongRestored} => CORRECT TEST ${actionOk && detailOk && configOk ? "PASSES (misses the bug)" : "FAILS (catches it)"}`,
    );
    // The correct 2-backup test WOULD catch the mutant (assertions fail).
    expect(actionOk && detailOk && configOk).toBe(false);
    expect(wrongRestored).toBe(true); // mutant silently restored the WRONG backup
  });
});
