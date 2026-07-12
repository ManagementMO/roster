import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "@rosterhq/coach";
import type { ImportedServer } from "./clients.js";
import { isRosterProxyEntry } from "./entry.js";
import { rosterConfigPath, rosterHome } from "./paths.js";

/**
 * Files Roster creates can hold imported credentials (a server's `env` block), so
 * they are owner-only. Directories likewise: a 0755 backups dir lists every
 * client whose config we hold.
 */
export const PRIVATE_FILE = 0o600;
export const PRIVATE_DIR = 0o700;

/** The target's current permissions, or undefined if it doesn't exist yet. */
function existingMode(target: string): number | undefined {
  try {
    return fs.statSync(target).mode & 0o777;
  } catch {
    return undefined;
  }
}

/**
 * Atomic write via a PRIVATE tmp + rename. The tmp name must be unique per
 * writer: a shared "<target>.tmp" let two concurrent writers truncate each
 * other's file (torn/corrupt output) and race the rename to ENOENT — measured
 * at 56.8% crash / occasional permanent corruption. pid + random makes the tmp
 * this write's alone; the rename is the only publish. Cross-process
 * last-writer-wins on the target is expected; a half-written target is not.
 *
 * Permissions are part of the contract, not an afterthought (R5-06). The tmp is
 * created owner-only so the content never exists — not even for the microseconds
 * before the rename — at a mode the final file wouldn't have. Then:
 *   - an EXISTING target keeps its mode: replacing a user's 0600 client config
 *     with a fresh 0644 one silently downgraded their own hardening;
 *   - a file we create fresh (roster.json, backups) defaults to 0600, because it
 *     may carry credentials imported from a client config.
 * (On Windows these modes are largely inert; the rename semantics still hold.)
 */
export function atomicWriteFileSync(target: string, data: string | Buffer, mode?: number): void {
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(tmp, data, { mode: PRIVATE_FILE });
    const finalMode = mode ?? existingMode(target) ?? PRIVATE_FILE;
    fs.chmodSync(tmp, finalMode); // writeFileSync's mode is masked by umask; set it exactly
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort: the failing write is what matters */
    }
    throw err;
  }
}

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
  fs.mkdirSync(rosterHome(), { recursive: true, mode: PRIVATE_DIR });
  // roster.json holds every imported server's `env` — i.e. the user's API keys.
  // It is the "one place" the README promises they live, so it is owner-only.
  atomicWriteFileSync(rosterConfigPath(), `${JSON.stringify(config, null, 2)}\n`, PRIVATE_FILE);
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
    // Roster never imports ITSELF — but "itself" is an ENTRY, not a NAME. Keying
    // this off `name === "roster"` silently dropped a user's own server that
    // happened to be called that: it was skipped here AND overwritten in the
    // client config by the sync, so it vanished from both (R5-01). A name is a
    // label the user chose; only the entry says what a thing actually is.
    if (isRosterProxyEntry({ command: server.command, args: server.args })) continue;
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
