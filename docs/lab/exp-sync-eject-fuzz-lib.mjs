/**
 * Shared harness for the sync/eject fuzz experiments (slug: sync-eject-fuzz).
 * Imports the REAL built CLI package (dist/) exactly like docs/verification/dense-live.mjs,
 * runs against real files under ROSTER_TEST_HOME fixture homes. No mocks.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const LAB = path.join(repo, "docs", "lab");
export const SCRATCH = path.join(LAB, "tmp-sync-eject-fuzz");

fs.mkdirSync(SCRATCH, { recursive: true }); // scratch is disposable; recreated on any rerun

const req = createRequire(path.join(repo, "packages/cli/package.json"));
export const cli = await import(req.resolve("@rosterhq/cli"));
export const { syncClient, ejectClient, CLIENTS, WRITE_CLIENTS, loadConfig } = cli;

/** Canonical config path for a client under a given fixture home (darwin). */
export function configPathFor(clientId, home) {
  switch (clientId) {
    case "claude-code": return path.join(home, ".claude.json");
    case "claude-desktop": return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    case "cursor": return path.join(home, ".cursor", "mcp.json");
    case "codex": return path.join(home, ".codex", "config.toml");
    case "gemini-cli": return path.join(home, ".gemini", "settings.json");
    case "hermes": return path.join(home, ".hermes", "config.yaml");
    case "openclaw": return path.join(home, ".openclaw", "openclaw.json");
    case "vscode": return path.join(home, "Library", "Application Support", "Code", "User", "mcp.json");
    case "windsurf": return path.join(home, ".codeium", "windsurf", "mcp_config.json");
    case "zed": return path.join(home, ".config", "zed", "settings.json");
    default: throw new Error(`unknown client ${clientId}`);
  }
}

let caseCounter = 0;
/** Fresh fixture home; sets ROSTER_TEST_HOME so ALL cli paths resolve inside it. */
export function freshHome(tag) {
  const home = path.join(SCRATCH, `${tag}-${caseCounter++}`);
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true });
  process.env.ROSTER_TEST_HOME = home;
  delete process.env.ROSTER_HOME;
  return home;
}

export function writeConfig(clientId, home, bytes) {
  const p = configPathFor(clientId, home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, bytes);
  return p;
}

/** First byte where two buffers differ, with hex context; null when identical. */
export function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return diffAt(a, b, i);
  }
  if (a.length !== b.length) return diffAt(a, b, n);
  return null;
}
function diffAt(a, b, i) {
  const ctx = (buf) => buf.subarray(Math.max(0, i - 8), i + 8).toString("hex");
  return { offset: i, lenA: a.length, lenB: b.length, hexA: ctx(a), hexB: ctx(b) };
}

export function backupsRoot(home, clientId) {
  return path.join(home, ".roster", "backups", clientId);
}

export function listBackupDirs(home, clientId) {
  const root = backupsRoot(home, clientId);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((e) => fs.statSync(path.join(root, e)).isDirectory()).sort();
}

/** mulberry32 — deterministic PRNG so every fuzz run is reproducible. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function saveSection(name, data) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, `section-${name}.json`), JSON.stringify(data, null, 2));
  console.log(`\n[section ${name} saved]`);
}
