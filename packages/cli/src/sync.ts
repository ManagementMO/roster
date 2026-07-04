import fs from "node:fs";
import path from "node:path";
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

const ROSTER_ENTRY = { command: "roster", args: ["serve"] };

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

  // Step 2 — backup + manifest + pointer BEFORE touching the config.
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const backupDir = backupDirFor(clientId, timestamp);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, "original"), originalBytes);
  const manifest: BackupManifest = {
    client: clientId,
    sourcePath: configPath,
    originalSha256: sha256Hex(originalBytes),
    writtenSha256: sha256Hex(rewritten),
    timestamp,
  };
  fs.writeFileSync(path.join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(path.dirname(backupDir), "latest"), timestamp);

  // Step 3 — atomic config replacement (private tmp + rename).
  atomicWriteFileSync(configPath, rewritten);

  return { client: clientId, configPath, action: "synced", backupDir, imported };
}

/** Returns the new file content, or null when the config already points solely at Roster. */
function rewriteConfig(clientId: ClientId, content: string): string | null {
  if (clientId === "codex") {
    const data = parseToml(content) as Record<string, unknown>;
    if (isAlreadySynced(data.mcp_servers)) return null;
    data.mcp_servers = { roster: ROSTER_ENTRY };
    return `${stringifyToml(data)}\n`;
  }
  const data = parseJsonc(content) as Record<string, unknown>;
  if (isAlreadySynced(data.mcpServers)) return null;
  data.mcpServers = { roster: ROSTER_ENTRY };
  return `${JSON.stringify(data, null, 2)}\n`;
}

function isAlreadySynced(servers: unknown): boolean {
  if (servers === null || typeof servers !== "object") return false;
  const entries = Object.entries(servers as Record<string, unknown>);
  if (entries.length !== 1 || entries[0]![0] !== "roster") return false;
  const entry = entries[0]![1] as Record<string, unknown> | null;
  return entry !== null && typeof entry === "object" && entry.command === "roster";
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
  return p && p.manifest ? { dir: p.dir, manifest: p.manifest } : null;
}
