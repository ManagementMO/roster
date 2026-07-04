import fs from "node:fs";
import path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { sha256Hex } from "@rosterhq/coach";
import { CLIENTS, type ClientId } from "./clients.js";
import { parseJsonc } from "./jsonc.js";
import { backupDirFor, loadConfig, mergeServers, saveConfig } from "./rosterfile.js";

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

  // Step 1 — import before we overwrite anything.
  let imported = 0;
  try {
    const servers = spec.parse(originalBytes.toString("utf8"), configPath);
    if (servers.length > 0) {
      const config = loadConfig();
      const { added } = mergeServers(config, servers);
      if (added.length > 0) saveConfig(config);
      imported = added.length;
    }
  } catch {
    // Unparseable config: nothing to import; the backup still protects the bytes.
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

  // Step 3 — atomic-ish config replacement.
  const tmpPath = `${configPath}.roster-tmp`;
  fs.writeFileSync(tmpPath, rewritten);
  fs.renameSync(tmpPath, configPath);

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

export function listBackups(clientId: ClientId): BackupRef[] {
  const clientDir = path.dirname(backupDirFor(clientId, "x"));
  if (!fs.existsSync(clientDir)) return [];
  const refs: BackupRef[] = [];
  for (const entry of fs.readdirSync(clientDir)) {
    const manifestPath = path.join(clientDir, entry, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      refs.push({
        dir: path.join(clientDir, entry),
        manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BackupManifest,
      });
    } catch {
      // corrupt manifest: skip; eject reports if nothing usable remains
    }
  }
  return refs.sort((a, b) => a.manifest.timestamp.localeCompare(b.manifest.timestamp));
}

/** The pristine pre-Roster snapshot: the OLDEST backup — what eject restores. */
export function oldestBackup(clientId: ClientId): BackupRef | null {
  const refs = listBackups(clientId);
  return refs.length > 0 ? refs[0]! : null;
}
