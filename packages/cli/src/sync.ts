import fs from "node:fs";
import path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { sha256Hex } from "@rosterhq/coach";
import { CLIENTS, type ClientId } from "./clients.js";
import { parseJsonc } from "./jsonc.js";
import { backupDirFor } from "./rosterfile.js";

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
}

const ROSTER_ENTRY = { command: "roster", args: ["serve"] };

export function syncClient(clientId: ClientId, now = new Date()): SyncResult {
  const spec = CLIENTS.find((c) => c.id === clientId);
  if (!spec) throw new Error(`unknown client: ${clientId}`);
  const configPath = spec.configPaths().find((p) => fs.existsSync(p));
  if (!configPath) return { client: clientId, configPath: "", action: "not-found" };

  const originalBytes = fs.readFileSync(configPath);
  const rewritten = rewriteConfig(clientId, originalBytes.toString("utf8"));
  if (rewritten === null) {
    return { client: clientId, configPath, action: "already-synced" };
  }

  // Backup FIRST — the eject promise depends on these bytes.
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const backupDir = backupDirFor(clientId, timestamp);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, "original"), originalBytes);

  fs.writeFileSync(configPath, rewritten);
  const manifest: BackupManifest = {
    client: clientId,
    sourcePath: configPath,
    originalSha256: sha256Hex(originalBytes.toString("utf8")),
    writtenSha256: sha256Hex(rewritten),
    timestamp,
  };
  fs.writeFileSync(path.join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(path.dirname(backupDir), "latest"), timestamp);

  return { client: clientId, configPath, action: "synced", backupDir };
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
  const keys = Object.keys(servers as Record<string, unknown>);
  return keys.length === 1 && keys[0] === "roster";
}

export function latestBackup(clientId: ClientId): { dir: string; manifest: BackupManifest } | null {
  const clientDir = path.dirname(backupDirFor(clientId, "x"));
  const latestPath = path.join(clientDir, "latest");
  if (!fs.existsSync(latestPath)) return null;
  const timestamp = fs.readFileSync(latestPath, "utf8").trim();
  const dir = backupDirFor(clientId, timestamp);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  return { dir, manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BackupManifest };
}
