import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { sha256Hex } from "@rosterhq/coach";
import { CLIENTS, type ClientId, type ImportedServer } from "./clients.js";
import {
  isOwnedRosterEntry,
  normalizeSpawnEntry,
  rosterEntry,
  type SpawnEntry,
} from "./entry.js";
import { hasEjectJournal } from "./ejectJournal.js";
import { parseJsonc } from "./jsonc.js";
import { withFileLockSync } from "./lock.js";
import {
  atomicWriteFileSync,
  backupDirFor,
  mergeServers,
  PRIVATE_DIR,
  PRIVATE_FILE,
  resolveWriteTopology,
  updateConfig,
  validateWriteTopology,
} from "./rosterfile.js";
import { readRegularFileNoFollow } from "./safeFile.js";

/** The four write clients (handoff §6.3). Read-import covers everything; writes stay narrow. */
export const WRITE_CLIENTS: ClientId[] = ["claude-code", "cursor", "codex", "openclaw"];

export interface BackupManifest {
  client: ClientId;
  sourcePath: string;
  originalSha256: string;
  writtenSha256: string;
  timestamp: string;
  /**
   * The EXACT entry this sync installed. Eject removes only this — never
   * "whatever is called roster" — so a server the user adds under that name
   * after syncing is theirs and survives (R5-01). Absent on pre-R5 backups.
   */
  injectedEntry?: SpawnEntry;
  /** Resolved regular file atomically replaced while preserving sourcePath. */
  writePath?: string;
  /** Raw readlink value when sourcePath was a symlink. */
  symlinkTarget?: string;
}

export interface SyncResult {
  client: ClientId;
  configPath: string;
  action: "synced" | "already-synced" | "not-found";
  backupDir?: string;
  imported?: number;
}

export { hasGlobalRoster } from "./entry.js";

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
  return withFileLockSync(`client:${clientId}`, () => syncClientUnlocked(clientId, now));
}

function syncClientUnlocked(clientId: ClientId, now: Date): SyncResult {
  const spec = CLIENTS.find((c) => c.id === clientId);
  if (!spec) throw new Error(`unknown client: ${clientId}`);
  if (hasEjectJournal(clientId)) {
    throw new Error(
      `a previous ${clientId} eject is pending recovery; run \`roster eject --client ${clientId}\` before syncing again`,
    );
  }
  const configPath = spec.configPaths().find((p) => fs.existsSync(p));
  if (!configPath) return { client: clientId, configPath: "", action: "not-found" };

  const topology = resolveWriteTopology(configPath);
  const originalBytes = readRegularFileNoFollow(topology.writePath, {
    attempts: 4,
  });

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
  if (servers.some((server) => server.url && !server.command)) {
    throw new Error(
      "URL-only MCP servers cannot be synced yet: Roster routing is stdio-only; the client was left untouched",
    );
  }
  const injectedEntry = rosterEntry();
  const ownedEntries = ownedRosterEntries(clientId, injectedEntry);
  if (servers.length > 0) {
    const { added } = updateConfig((config) => mergeServers(config, servers, ownedEntries));
    imported = added.length;
  }

  const rewritten = rewriteConfig(
    clientId,
    originalBytes.toString("utf8"),
    injectedEntry,
    ownedEntries,
  );
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
  // A backup is a verbatim copy of the client's config — including whatever API
  // keys sat in its `env` blocks. Owner-only, dirs included: a 0755 backups tree
  // also leaks WHICH clients the user runs (R5-06).
  fs.mkdirSync(stagingDir, { recursive: true, mode: PRIVATE_DIR });
  fs.writeFileSync(path.join(stagingDir, "original"), originalBytes, { mode: PRIVATE_FILE });
  const manifest: BackupManifest = {
    client: clientId,
    sourcePath: configPath,
    originalSha256: sha256Hex(originalBytes),
    writtenSha256: sha256Hex(rewritten),
    timestamp,
    injectedEntry, // exact identity for eject — never the key name (R5-01)
    writePath: topology.writePath,
    ...(topology.symlinkTarget !== undefined
      ? { symlinkTarget: topology.symlinkTarget }
      : {}),
  };
  fs.writeFileSync(path.join(stagingDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: PRIVATE_FILE,
  });
  fs.renameSync(stagingDir, backupDir); // atomic publish: complete backup or none
  fs.writeFileSync(path.join(path.dirname(backupDir), "latest"), timestamp, { mode: PRIVATE_FILE });

  // Step 3 — atomic config replacement (private tmp + rename).
  const writePath = validateWriteTopology(
    configPath,
    manifest.writePath,
    manifest.symlinkTarget,
  );
  atomicWriteFileSync(writePath, rewritten);

  return { client: clientId, configPath, action: "synced", backupDir, imported };
}

/** Returns the new file content, or null when the config already points solely at Roster. */
function rewriteConfig(
  clientId: ClientId,
  content: string,
  entry: SpawnEntry,
  ownedEntries: readonly SpawnEntry[],
): string | null {
  if (clientId === "codex") {
    const data = parseToml(content) as Record<string, unknown>;
    if (isAlreadySynced(data.mcp_servers, ownedEntries)) return null;
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
  if (isAlreadySynced(obj.mcpServers, ownedEntries)) return null;
  obj.mcpServers = { roster: entry };
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/**
 * A healthy Roster-only install has one entry whose full shape exactly matches
 * either this install or an intact active manifest. Basenames, key names,
 * executable existence, and a trailing "serve" are insufficient proof.
 */
function isAlreadySynced(servers: unknown, ownedEntries: readonly SpawnEntry[]): boolean {
  if (servers === null || typeof servers !== "object" || Array.isArray(servers)) return false;
  const entries = Object.entries(servers as Record<string, unknown>);
  return entries.length === 1 && isOwnedRosterEntry(entries[0]![1], ownedEntries);
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

/** Exact current and historical entries Roster can prove it installed. */
export function ownedRosterEntries(
  clientId?: ClientId,
  current: SpawnEntry = rosterEntry(),
): SpawnEntry[] {
  const entries: SpawnEntry[] = [current];
  const clients = clientId ? [clientId] : WRITE_CLIENTS;
  for (const id of clients) {
    for (const backup of rawBackups(id)) {
      const injected = normalizeSpawnEntry(backup.manifest?.injectedEntry);
      if (!injected || !backup.manifest) continue;
      try {
        const original = readRegularFileNoFollow(
          path.join(backup.dir, "original"),
        );
        if (sha256Hex(original) !== backup.manifest.originalSha256) continue;
      } catch {
        continue;
      }
      if (!entries.some((entry) => isOwnedRosterEntry(injected, [entry]))) {
        entries.push(injected);
      }
    }
  }
  return entries;
}

/** Client backup root, e.g. ~/.roster/backups/cursor. */
function clientBackupDir(clientId: ClientId): string {
  return path.dirname(backupDirFor(clientId, "x"));
}

/**
 * The era boundary, recorded DURABLY: the newest backup timestamp that has
 * already been ejected. Backups at or before it belong to a closed era and are
 * no longer candidates for restore.
 *
 * Era closure used to be implied by `archiveEra`'s directory rename — a
 * BEST-EFFORT operation that swallowed its own failures. When that rename failed
 * (read-only backups root, locked dir, permissions), the ejected era stayed
 * "active", the next sync appended a second backup beside it, and the following
 * eject picked the OLDEST dir — restoring the previous era's config OVER the
 * user's current one and reporting "restored". A silent wrong restore: the one
 * outcome eject exists to make impossible (R5-02).
 *
 * A marker rather than an inferred boundary, because the boundary CANNOT be
 * inferred: "ejected, then re-synced" and "user broke the entry by hand, then
 * re-synced" leave byte-identical manifests but require different pristines. Only
 * an explicit record of the eject can tell them apart.
 */
function closedThroughPath(clientId: ClientId): string {
  return path.join(clientBackupDir(clientId), ".closed-through");
}

export function readClosedThrough(clientId: ClientId): string | null {
  try {
    const value = readRegularFileNoFollow(closedThroughPath(clientId))
      .toString("utf8")
      .trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(value)) {
      throw new Error(`backup era marker for ${clientId} is corrupt`);
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Close the current era durably. Called by eject AFTER the config is restored.
 * Returns false when the closure could not be persisted — the caller must then
 * refuse to report a clean success, because a future eject could otherwise reach
 * back into this era.
 */
export function closeEraThrough(clientId: ClientId, backupName: string): boolean {
  const current = readClosedThrough(clientId);
  if (current !== null && current >= backupName) return true;
  try {
    atomicWriteFileSync(closedThroughPath(clientId), `${backupName}\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every ACTIVE backup dir for a client, OLDEST FIRST by DIRECTORY NAME. Ordering
 * must key off the immutable, timestamp-derived directory name — never a mutable
 * manifest field — so editing a manifest can't reorder or hide a backup. A
 * corrupt/missing manifest is returned as null (not silently dropped) so eject
 * can refuse rather than advance to a different backup (a silent wrong-restore).
 *
 * Backups belonging to a CLOSED era are excluded: they have already been ejected
 * and must never be restored again (R5-02).
 */
export function rawBackups(clientId: ClientId): RawBackup[] {
  const clientDir = clientBackupDir(clientId);
  if (!fs.existsSync(clientDir)) return [];
  const closedThrough = readClosedThrough(clientId);
  const out: RawBackup[] = [];
  for (const name of fs.readdirSync(clientDir).sort()) {
    if (name.includes(".staging-")) continue; // an interrupted, not-yet-published backup
    // Timestamped names sort chronologically, so <= is "at or before the boundary".
    if (closedThrough !== null && name <= closedThrough) continue; // already ejected
    const dir = path.join(clientDir, name);
    try {
      const stat = fs.lstatSync(dir);
      if (stat.isSymbolicLink()) {
        out.push({ dir, name, manifest: null });
        continue;
      }
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    let manifest: BackupManifest | null = null;
    try {
      manifest = JSON.parse(
        readRegularFileNoFollow(path.join(dir, "manifest.json")).toString(
          "utf8",
        ),
      ) as BackupManifest;
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
