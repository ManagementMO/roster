import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "@rosterhq/coach";
import type { ImportedServer } from "./clients.js";
import { rosterConfigPath, rosterHome } from "./paths.js";

export interface RosterServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  /** Which clients this server was imported from. */
  importedFrom: string[];
}

export interface RosterConfig {
  version: 1;
  mode: "transparent" | "five";
  servers: Record<string, RosterServerEntry>;
  skillSources: string[];
  telemetry: { enabled: boolean };
  embeddings: "auto" | "off";
}

export function defaultConfig(): RosterConfig {
  return {
    version: 1,
    mode: "transparent",
    servers: {},
    skillSources: [],
    telemetry: { enabled: false },
    embeddings: "auto",
  };
}

export function loadConfig(): RosterConfig {
  const p = rosterConfigPath();
  if (!fs.existsSync(p)) return defaultConfig();
  let parsed: Partial<RosterConfig>;
  try {
    parsed = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<RosterConfig>;
  } catch (err) {
    throw new Error(`~/.roster/roster.json is malformed JSON: ${err instanceof Error ? err.message : err}`);
  }
  const base = defaultConfig();
  // Normalize each field so a hand-edited null/wrong-type can't crash serve.
  return {
    ...base,
    ...parsed,
    servers:
      parsed.servers && typeof parsed.servers === "object" ? parsed.servers : base.servers,
    skillSources: Array.isArray(parsed.skillSources) ? parsed.skillSources : base.skillSources,
    telemetry: { enabled: parsed.telemetry?.enabled === true },
    embeddings: parsed.embeddings === "off" ? "off" : "auto",
    mode: parsed.mode === "five" ? "five" : "transparent",
  };
}

export function saveConfig(config: RosterConfig): void {
  fs.mkdirSync(rosterHome(), { recursive: true });
  // tmp + rename: a serve booting mid-write must never read truncated JSON.
  const target = rosterConfigPath();
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(tmp, target);
}

/**
 * Identity of a server for dedupe: what it runs INCLUDING env — two servers
 * with different tokens are different servers; merging them would silently
 * discard a credential.
 */
export function serverIdentity(
  server: Pick<ImportedServer, "command" | "args" | "url" | "env">,
): string {
  return sha256Hex(
    JSON.stringify({
      command: server.command ?? null,
      args: server.args ?? [],
      url: server.url ?? null,
      env: server.env ?? {},
    }),
  );
}

export interface MergeResult {
  config: RosterConfig;
  added: string[];
  merged: string[];
}

/** Merge imported servers into the roster, deduping identical definitions across clients. */
export function mergeServers(config: RosterConfig, imported: readonly ImportedServer[]): MergeResult {
  const byIdentity = new Map<string, string>(); // identity → roster name
  for (const [name, entry] of Object.entries(config.servers)) {
    byIdentity.set(serverIdentity(entry), name);
  }
  const added: string[] = [];
  const merged: string[] = [];
  for (const server of imported) {
    // Roster never imports itself (post-sync configs point at us).
    if (server.command === "roster" || server.name === "roster") continue;
    const identity = serverIdentity(server);
    const existingName = byIdentity.get(identity);
    if (existingName) {
      const entry = config.servers[existingName]!;
      if (!entry.importedFrom.includes(server.client)) entry.importedFrom.push(server.client);
      merged.push(existingName);
      continue;
    }
    let name = server.name;
    let suffix = 2;
    while (config.servers[name]) name = `${server.name}-${suffix++}`;
    config.servers[name] = {
      command: server.command,
      args: server.args,
      env: server.env,
      url: server.url,
      importedFrom: [server.client],
    };
    byIdentity.set(identity, name);
    added.push(name);
  }
  return { config, added, merged };
}

export function backupDirFor(clientId: string, timestamp: string): string {
  return path.join(rosterHome(), "backups", clientId, timestamp);
}
