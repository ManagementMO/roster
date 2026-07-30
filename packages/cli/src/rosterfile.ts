import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "@rosterhq/coach";
import type { ImportedServer } from "./clients.js";
import { isOwnedRosterEntry, rosterEntry, type SpawnEntry } from "./entry.js";
import { withFileLockSync } from "./lock.js";
import { rosterConfigPath, rosterHome } from "./paths.js";

/**
 * Files Roster creates can hold imported credentials (a server's `env` block), so
 * they are owner-only. Directories likewise: a 0755 backups dir lists every
 * client whose config we hold.
 */
export const PRIVATE_FILE = 0o600;
export const PRIVATE_DIR = 0o700;

export interface WriteTopology {
  sourcePath: string;
  writePath: string;
  symlinkTarget?: string;
}

/** Resolve a visible config path without replacing a symlink during atomic writes. */
export function resolveWriteTopology(sourcePath: string): WriteTopology {
  const source = path.resolve(sourcePath);
  const stat = fs.lstatSync(source);
  const writePath = fs.realpathSync(source);
  if (stat.isSymbolicLink()) {
    const symlinkTarget = fs.readlinkSync(source);
    if (!fs.lstatSync(writePath).isFile()) {
      throw new Error(`client config symlink target is not a regular file: ${sourcePath}`);
    }
    return { sourcePath: source, writePath, symlinkTarget };
  }
  if (!stat.isFile()) {
    throw new Error(`client config is not a regular file: ${sourcePath}`);
  }
  return { sourcePath: source, writePath };
}

/**
 * Resolve the deepest existing ancestor, then project any missing suffix below
 * it. This keeps platform aliases such as macOS `/var` → `/private/var` from
 * looking like a topology change while still detecting a removed/repointed
 * user-controlled symlink in the path.
 */
function projectedRealPath(target: string): string {
  const suffix: string[] = [];
  let cursor = target;
  for (;;) {
    try {
      return path.join(fs.realpathSync(cursor), ...suffix.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      suffix.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

/**
 * Revalidate the exact source/write topology recorded at sync. Legacy manifests
 * have neither optional field and retain their original direct-path behavior.
 */
export function validateWriteTopology(
  sourcePath: string,
  recordedWritePath?: string,
  recordedSymlinkTarget?: string,
): string {
  const source = path.resolve(sourcePath);
  if (recordedWritePath === undefined && recordedSymlinkTarget === undefined) return source;
  if (recordedWritePath === undefined) {
    throw new Error("recorded symlink topology is missing its write path");
  }
  const writePath = path.resolve(recordedWritePath);
  if (recordedSymlinkTarget !== undefined) {
    let sourceStat: fs.Stats;
    try {
      sourceStat = fs.lstatSync(source);
    } catch {
      throw new Error("recorded config symlink is missing");
    }
    if (!sourceStat.isSymbolicLink()) {
      throw new Error("recorded config symlink was replaced");
    }
    if (fs.readlinkSync(source) !== recordedSymlinkTarget) {
      throw new Error("recorded config symlink target changed");
    }
    if (fs.realpathSync(source) !== writePath) {
      throw new Error("recorded config symlink now resolves to a different target");
    }
    if (!fs.lstatSync(writePath).isFile()) {
      throw new Error("recorded config write target is not a regular file");
    }
    return writePath;
  }
  try {
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error("recorded regular config changed filesystem type");
    }
    if (fs.realpathSync(source) !== writePath) {
      throw new Error("recorded config parent symlink now resolves to a different target");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // A missing regular config remains eligible for the existing --force path.
    if (projectedRealPath(source) !== writePath) {
      throw new Error("recorded config parent symlink now resolves to a different target");
    }
  }
  return writePath;
}

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
  const finalMode = mode ?? existingMode(target) ?? PRIVATE_FILE;
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmp, "wx", PRIVATE_FILE);
    fs.writeFileSync(fd, data);
    fs.fchmodSync(fd, finalMode);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, target);
    try {
      const parent = fs.openSync(path.dirname(target), "r");
      try {
        fs.fsyncSync(parent);
      } finally {
        fs.closeSync(parent);
      }
    } catch {
      // Directory fsync is unavailable on some platforms/filesystems.
    }
  } catch (err) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* best effort */
      }
    }
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
    servers: Object.create(null) as Record<string, RosterServerEntry>,
    skillSources: [],
    telemetry: { enabled: false },
    embeddings: "auto",
  };
}

export function loadConfig(): RosterConfig {
  const p = rosterConfigPath();
  if (!fs.existsSync(p)) return defaultConfig();
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    throw new Error(`~/.roster/roster.json is malformed JSON: ${err instanceof Error ? err.message : err}`);
  }
  return normalizeConfig(parsed);
}

export function saveConfig(config: RosterConfig): void {
  fs.mkdirSync(rosterHome(), { recursive: true, mode: PRIVATE_DIR });
  // roster.json holds every imported server's `env` — i.e. the user's API keys.
  // It is the "one place" the README promises they live, so it is owner-only.
  const normalized = normalizeConfig(config);
  atomicWriteFileSync(
    rosterConfigPath(),
    `${JSON.stringify(normalized, null, 2)}\n`,
    PRIVATE_FILE,
  );
}

/** Reload, mutate, and publish roster.json while holding the global config lock. */
export function updateConfig<T>(mutator: (config: RosterConfig) => T): T {
  return withFileLockSync("config", () => {
    const config = loadConfig();
    const result = mutator(config);
    saveConfig(config);
    return result;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown, field: string, fallback: string[] = []): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`~/.roster/roster.json ${field} must be an array of strings`);
  }
  return [...value];
}

function normalizeServer(value: unknown, field: string): RosterServerEntry {
  if (!isRecord(value)) {
    throw new Error(`~/.roster/roster.json ${field} must be an object`);
  }
  const command = value.command;
  const url = value.url;
  if (command !== undefined && typeof command !== "string") {
    throw new Error(`~/.roster/roster.json ${field}.command must be a string`);
  }
  if (url !== undefined && typeof url !== "string") {
    throw new Error(`~/.roster/roster.json ${field}.url must be a string`);
  }
  if (command === undefined && url === undefined) {
    throw new Error(`~/.roster/roster.json ${field} must define command or url`);
  }
  let env: Record<string, string> | undefined;
  if (value.env !== undefined) {
    if (!isRecord(value.env) || Object.values(value.env).some((item) => typeof item !== "string")) {
      throw new Error(`~/.roster/roster.json ${field}.env must be an object of strings`);
    }
    env = Object.fromEntries(Object.entries(value.env)) as Record<string, string>;
  }
  return {
    ...(command !== undefined ? { command } : {}),
    ...(value.args !== undefined ? { args: stringArray(value.args, `${field}.args`) } : {}),
    ...(env !== undefined ? { env } : {}),
    ...(url !== undefined ? { url } : {}),
    importedFrom: stringArray(value.importedFrom, `${field}.importedFrom`),
  };
}

function normalizeConfig(value: unknown): RosterConfig {
  if (!isRecord(value)) {
    throw new Error("~/.roster/roster.json must be a JSON object");
  }
  if (value.version !== undefined && value.version !== 1) {
    throw new Error("~/.roster/roster.json version must be 1");
  }
  if (value.mode !== undefined && value.mode !== "transparent" && value.mode !== "five") {
    throw new Error('~/.roster/roster.json mode must be "transparent" or "five"');
  }
  if (value.embeddings !== undefined && value.embeddings !== "auto" && value.embeddings !== "off") {
    throw new Error('~/.roster/roster.json embeddings must be "auto" or "off"');
  }
  if (value.servers !== undefined && !isRecord(value.servers)) {
    throw new Error("~/.roster/roster.json servers must be an object");
  }
  const servers = Object.create(null) as Record<string, RosterServerEntry>;
  for (const [name, server] of Object.entries(value.servers ?? {})) {
    servers[name] = normalizeServer(server, `servers.${name}`);
  }
  let telemetryEnabled = false;
  if (value.telemetry !== undefined) {
    if (!isRecord(value.telemetry)) {
      throw new Error("~/.roster/roster.json telemetry must be an object");
    }
    if (value.telemetry.enabled !== undefined && typeof value.telemetry.enabled !== "boolean") {
      throw new Error("~/.roster/roster.json telemetry.enabled must be a boolean");
    }
    telemetryEnabled = value.telemetry.enabled === true;
  }
  return {
    version: 1,
    mode: value.mode === "five" ? "five" : "transparent",
    servers,
    skillSources: stringArray(value.skillSources, "skillSources"),
    telemetry: { enabled: telemetryEnabled },
    embeddings: value.embeddings === "off" ? "off" : "auto",
  };
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
  changed: boolean;
}

/** Merge imported servers into the roster, deduping identical definitions across clients. */
export function mergeServers(
  config: RosterConfig,
  imported: readonly ImportedServer[],
  ownedEntries: readonly SpawnEntry[] = [rosterEntry()],
): MergeResult {
  const byIdentity = new Map<string, string>(); // identity → roster name
  for (const [name, entry] of Object.entries(config.servers)) {
    byIdentity.set(serverIdentity(entry), name);
  }
  const added: string[] = [];
  const merged: string[] = [];
  let changed = false;
  for (const server of imported) {
    // Roster never imports ITSELF — but "itself" is an ENTRY, not a NAME. Keying
    // this off `name === "roster"` silently dropped a user's own server that
    // happened to be called that: it was skipped here AND overwritten in the
    // client config by the sync, so it vanished from both (R5-01). A name is a
    // label the user chose; only the entry says what a thing actually is.
    const candidate = {
      command: server.command,
      args: server.args ?? [],
      ...(server.env !== undefined ? { env: server.env } : {}),
      ...(server.url !== undefined ? { url: server.url } : {}),
    };
    if (isOwnedRosterEntry(candidate, ownedEntries)) continue;
    const identity = serverIdentity(server);
    const existingName = byIdentity.get(identity);
    if (existingName) {
      const entry = config.servers[existingName]!;
      if (!entry.importedFrom.includes(server.client)) {
        entry.importedFrom.push(server.client);
        changed = true;
      }
      merged.push(existingName);
      continue;
    }
    let name = server.name;
    let suffix = 2;
    while (Object.hasOwn(config.servers, name)) name = `${server.name}-${suffix++}`;
    config.servers[name] = {
      command: server.command,
      args: server.args,
      env: server.env,
      url: server.url,
      importedFrom: [server.client],
    };
    byIdentity.set(identity, name);
    added.push(name);
    changed = true;
  }
  return { config, added, merged, changed };
}

export function backupDirFor(clientId: string, timestamp: string): string {
  return path.join(rosterHome(), "backups", clientId, timestamp);
}
