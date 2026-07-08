import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { sha256Hex } from "@rosterhq/coach";
import { CLIENTS, type ClientId, type ImportedServer } from "./clients.js";
import { parseJsonc } from "./jsonc.js";
import { atomicWriteFileSync, backupDirFor, loadConfig, mergeServers, saveConfig } from "./rosterfile.js";

/** The four write clients (handoff §6.3). Read-import covers everything; writes stay narrow. */
export const WRITE_CLIENTS: ClientId[] = ["claude-code", "cursor", "codex", "openclaw"];

export interface BackupManifest {
  client: ClientId;
  sourcePath: string;
  originalSha256: string;
  writtenSha256: string;
  timestamp: string;
}

export interface SyncResult {
  client: ClientId;
  configPath: string;
  action: "synced" | "already-synced" | "not-found";
  backupDir?: string;
  imported?: number;
}

/**
 * A global `roster` binary on PATH → `roster serve` (audit M5: the entry must
 * be spawnable for the install the user actually has). Overridable via
 * ROSTER_ASSUME_GLOBAL for tests/CI.
 */
export function hasGlobalRoster(): boolean {
  if (process.env.ROSTER_ASSUME_GLOBAL === "1") return true;
  if (process.env.ROSTER_ASSUME_GLOBAL === "0") return false;
  const names = process.platform === "win32" ? ["roster.cmd", "roster.exe", "roster"] : ["roster"];
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .some((dir) => names.some((n) => {
      try {
        return dir !== "" && fs.existsSync(path.join(dir, n));
      } catch {
        return false;
      }
    }));
}

/**
 * No global binary → point at THIS install's own entrypoint (node + absolute
 * dist/bin.js): spawnable today for repo checkouts, pnpm links, and npx-cache
 * installs. Deliberately NOT `npx -y roster`: the npm name `roster` is
 * currently a THIRD-PARTY package (verified 2026-07-07, roster@0.0.3), so that
 * entry would download and execute a stranger's code on every client boot —
 * a squatter hazard until OUR package is published under whatever name P1's
 * clearance lands on. Flipping the no-global default to the npx form is a
 * one-line launch-day change (STATUS §4F).
 */
function rosterEntry(): { command: string; args: string[] } {
  if (hasGlobalRoster()) return { command: "roster", args: ["serve"] };
  const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), "bin.js");
  return { command: process.execPath, args: [bin, "serve"] };
}

/**
 * Sync order is a trust invariant:
 *   1. IMPORT any servers currently in the client config into roster.json
 *      (a re-sync must never eat servers the user added after the first sync);
 *   2. persist backup bytes + manifest + latest pointer;
 *   3. only THEN rewrite the client config, atomically (tmp + rename).
 * A crash at any point leaves either the untouched original or a fully
 * referenced backup — never a clobbered config without a findable backup.
 */
export function syncClient(clientId: ClientId, now = new Date()): SyncResult {
  const spec = CLIENTS.find((c) => c.id === clientId);
  if (!spec) throw new Error(`unknown client: ${clientId}`);
  const configPath = spec.configPaths().find((p) => fs.existsSync(p));
  if (!configPath) return { client: clientId, configPath: "", action: "not-found" };

  const originalBytes = fs.readFileSync(configPath);

  // Step 1 — import before we overwrite anything. ONLY the parse may fail
  // benignly (unparseable config = nothing to import). A failure of the import
  // SAVE must propagate: swallowing it let sync report "synced" while the
  // user's servers were never persisted to roster.json — routed nowhere.
  let imported = 0;
  let servers: ImportedServer[] = [];
  try {
    servers = spec.parse(originalBytes.toString("utf8"), configPath);
  } catch {
    servers = []; // unparseable: the backup still protects the original bytes
  }
  if (servers.length > 0) {
    const config = loadConfig();
    const { added } = mergeServers(config, servers);
    if (added.length > 0) saveConfig(config);
    imported = added.length;
  }

  const rewritten = rewriteConfig(clientId, originalBytes.toString("utf8"));
  if (rewritten === null) {
    return { client: clientId, configPath, action: "already-synced", imported };
  }

  // Step 2 — backup + manifest + pointer BEFORE touching the config. The
  // backup dir is assembled in a STAGING dir and renamed into place atomically,
  // so a crash mid-write can never leave a manifest-less backup (which would
  // later brick eject). listBackups skips ".staging-" dirs.
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const backupDir = backupDirFor(clientId, timestamp);
  const stagingDir = `${backupDir}.staging-${crypto.randomBytes(4).toString("hex")}`;
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.writeFileSync(path.join(stagingDir, "original"), originalBytes);
  const manifest: BackupManifest = {
    client: clientId,
    sourcePath: configPath,
    originalSha256: sha256Hex(originalBytes),
    writtenSha256: sha256Hex(rewritten),
    timestamp,
  };
  fs.writeFileSync(path.join(stagingDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(stagingDir, backupDir); // atomic publish: complete backup or none
  fs.writeFileSync(path.join(path.dirname(backupDir), "latest"), timestamp);

  // Step 3 — atomic config replacement (private tmp + rename).
  atomicWriteFileSync(configPath, rewritten);

  return { client: clientId, configPath, action: "synced", backupDir, imported };
}

/** Returns the new file content, or null when the config already points solely at Roster. */
function rewriteConfig(clientId: ClientId, content: string): string | null {
  const entry = rosterEntry();
  if (clientId === "codex") {
    const data = parseToml(content) as Record<string, unknown>;
    if (isAlreadySynced(data.mcp_servers)) return null;
    data.mcp_servers = { roster: entry };
    return `${stringifyToml(data)}\n`;
  }
  const data = parseJsonc(content);
  // A top-level array or scalar isn't a servers map: setting a property on it
  // silently vanishes (JSON.stringify drops array props → an eternal false
  // "synced" loop) or throws — reject loudly so the fleet loop reports it and
  // moves on, never half-installing (audit D8).
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`config is not a JSON object (got ${Array.isArray(data) ? "array" : typeof data})`);
  }
  const obj = data as Record<string, unknown>;
  if (isAlreadySynced(obj.mcpServers)) return null;
  obj.mcpServers = { roster: entry };
  return `${JSON.stringify(obj, null, 2)}\n`;
}

function isAlreadySynced(servers: unknown): boolean {
  if (servers === null || typeof servers !== "object") return false;
  const entries = Object.entries(servers as Record<string, unknown>);
  if (entries.length !== 1 || entries[0]![0] !== "roster") return false;
  const entry = entries[0]![1] as Record<string, unknown> | null;
  if (entry === null || typeof entry !== "object") return false;
  const args = Array.isArray(entry.args) ? entry.args.map(String) : [];
  // Ours in ANY install form — global (`roster serve`), execPath+bin.js, or the
  // post-publish npx form: the single server key is "roster" (checked above)
  // and it launches `serve`. A machine that installs differently must not loop.
  return entry.command === "roster" || args.includes("serve");
}

export interface BackupRef {
  dir: string;
  manifest: BackupManifest;
}

export interface RawBackup {
  dir: string;
  /** Directory basename = the immutable, timestamp-derived ordering key. */
  name: string;
  /** null when the manifest is missing or unparseable — surfaced, never skipped. */
  manifest: BackupManifest | null;
}

/**
 * Every backup dir for a client, OLDEST FIRST by DIRECTORY NAME. Ordering must
 * key off the immutable, timestamp-derived directory name — never a mutable
 * manifest field — so editing a manifest can't reorder or hide a backup. A
 * corrupt/missing manifest is returned as null (not silently dropped) so eject
 * can refuse rather than advance to a different backup (a silent wrong-restore).
 */
export function rawBackups(clientId: ClientId): RawBackup[] {
  const clientDir = path.dirname(backupDirFor(clientId, "x"));
  if (!fs.existsSync(clientDir)) return [];
  const out: RawBackup[] = [];
  for (const name of fs.readdirSync(clientDir).sort()) {
    if (name.includes(".staging-")) continue; // an interrupted, not-yet-published backup
    const dir = path.join(clientDir, name);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    let manifest: BackupManifest | null = null;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as BackupManifest;
    } catch {
      manifest = null; // missing or corrupt — kept as a null slot, not skipped
    }
    out.push({ dir, name, manifest });
  }
  return out;
}

/** Backups with a valid manifest, oldest first — used for the modified-since guard. */
export function listBackups(clientId: ClientId): BackupRef[] {
  return rawBackups(clientId)
    .filter((b): b is RawBackup & { manifest: BackupManifest } => b.manifest !== null)
    .map((b) => ({ dir: b.dir, manifest: b.manifest }));
}

/** The pristine pre-Roster snapshot: the OLDEST backup dir (manifest maybe null). */
export function pristineRawBackup(clientId: ClientId): RawBackup | null {
  const all = rawBackups(clientId);
  return all.length > 0 ? all[0]! : null;
}

/** Back-compat: the oldest backup only when its manifest is intact. */
export function oldestBackup(clientId: ClientId): BackupRef | null {
  const p = pristineRawBackup(clientId);
  return p?.manifest ? { dir: p.dir, manifest: p.manifest } : null;
}
