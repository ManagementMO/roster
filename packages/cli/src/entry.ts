import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** A spawnable MCP server entry: the shape every client config stores. */
export interface SpawnEntry {
  command: string;
  args: string[];
}

/**
 * Is there a global `roster` on PATH that is actually OURS? (audit M5 + DEF-5).
 * `existsSync` alone was a smaller replay of the squatter hazard round 4b closed:
 * a third-party `roster` on PATH — or a mere directory named `roster` — would
 * have been written into every client as a spawn target. So we require an
 * executable regular FILE resolving to this install's exact entrypoint.
 * Only the first executable match counts; a later trusted PATH entry cannot
 * vouch for an earlier foreign one. Diagnostic override: ROSTER_ASSUME_GLOBAL.
 */
export function hasGlobalRoster(binPath: string = ourBinPath()): boolean {
  if (process.env.ROSTER_ASSUME_GLOBAL === "1") return true;
  if (process.env.ROSTER_ASSUME_GLOBAL === "0") return false;
  return firstPathEntryMatches(binPath);
}

function firstPathEntryMatches(binPath: string): boolean {
  const names = process.platform === "win32" ? ["roster.cmd", "roster.exe", "roster"] : ["roster"];
  let expected: string;
  try {
    expected = fs.realpathSync(binPath);
  } catch {
    return false;
  }
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir === "") continue;
    for (const n of names) {
      const p = path.join(dir, n);
      try {
        if (!fs.statSync(p).isFile()) continue; // not a spawnable file (dir/socket/…)
        fs.accessSync(p, fs.constants.X_OK); // executable
        return fs.realpathSync(p) === expected; // provably ours
      } catch {
        /* not a file / not accessible → keep looking */
      }
    }
  }
  return false;
}

/** The `bin.js` THIS install would spawn. */
export function ourBinPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "bin.js");
}

export function verifiedRosterAliases(): SpawnEntry[] {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const binaries = [ourBinPath(), path.resolve(dir, "../bundle/bin.js"), path.resolve(dir, "../dist/bin.js")];
  return binaries.some(firstPathEntryMatches) ? [{ command: "roster", args: ["serve"] }] : [];
}

/** The published package name; the only name safe to hand to `npx`. */
export const PACKAGE_NAME = "@npmmo/roster";

/**
 * Are we running out of an `npx` cache rather than a real installation?
 *
 * This matters because `npx` is the documented first command, and it makes BOTH
 * other entry forms wrong:
 *
 *  - it puts `roster` on PATH for the duration of that one invocation, which
 *    fooled `hasGlobalRoster()` into writing `{command: "roster"}`. The moment
 *    npx exits there is no `roster`, so the client's launcher dies with ENOENT
 *    — a dead MCP server, produced by the happy path.
 *  - the cache directory itself is disposable (`npm cache clean`, npx's own
 *    pruning), so writing this absolute path would break later instead.
 *
 * Verified end to end against a local registry: `npx -y @roster/cli sync` wrote
 * `{command:"roster"}`, and spawning it afterwards failed `ENOENT`.
 */
export function runningFromNpxCache(binPath: string = ourBinPath()): boolean {
  return binPath.split(path.sep).includes("_npx");
}

/**
 * The entry sync writes pins Node and this install's absolute entrypoint.
 * Bare PATH commands are not stored: another binary could shadow them later.
 * Repo checkouts, pnpm links, and global installs use the same code; npx caches
 * use the scoped package form below. Deliberately NOT `npx -y roster` — the npm
 * name `roster` is a THIRD-PARTY package (verified 2026-07-07, roster@0.0.3), so
 * that entry would fetch and run a stranger's code on every client boot. The npx
 * form is used ONLY for the scoped, published name and ONLY when we are already
 * running from an npx cache — which proves that exact package is fetchable.
 */
export function rosterEntry(binPath: string = ourBinPath()): SpawnEntry {
  // Reaching this code from an npx cache proves the package is fetchable by
  // name, so the npx form is both correct and self-healing: it re-fetches if
  // the cache is pruned. It must be checked FIRST — npx's temporary PATH entry
  // would otherwise satisfy `hasGlobalRoster()` and write a launcher that stops
  // existing the moment npx exits.
  if (runningFromNpxCache(binPath)) {
    const args = ["-y", PACKAGE_NAME, "serve"];
    return process.platform === "win32"
      ? { command: path.win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe"), args: ["/d", "/s", "/c", "npx", ...args] }
      : { command: "npx", args };
  }
  return { command: process.execPath, args: [path.resolve(binPath), "serve"] };
}

/**
 * Keys a CLIENT adds to its OWN serialization of a stdio entry that carry no
 * "what runs" intent, each pinned to the only inert value consistent with the
 * command+args stdio entry Roster writes. Claude Code stamps `type: "stdio"`
 * onto every MCP entry in ~/.claude.json, which made the annotated proxy stop
 * matching and survive eject (NEW-1). This allowlist is deliberately tiny:
 * anything NOT here (env, cwd, url, headers, disabled, …) is treated as a
 * meaningful field whose presence means the entry is NOT one Roster wrote.
 */
const INERT_CLIENT_KEYS: Record<string, (value: unknown) => boolean> = {
  type: (value) => value === "stdio", // a non-stdio transport is a CONFLICTING entry, not ours
};

/**
 * Canonicalize a config entry to the {command, args} identity Roster writes, or
 * null if it is not an entry Roster could have written.
 *
 * Ownership is EXACT on command and args. Client-added transport annotations
 * (see INERT_CLIENT_KEYS) are tolerated so a re-serialized proxy is still
 * recognized on eject; ANY other extra key — env with a token, cwd, a url, an
 * unknown or conflicting `type` — makes this null, so a user's lookalike is
 * never mistaken for ours and deleted.
 */
export const normalizeSpawnEntry = (v: unknown): SpawnEntry | null => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const e = v as Record<string, unknown>;
  if (typeof e.command !== "string") return null;
  if (e.args !== undefined && (!Array.isArray(e.args) || e.args.some((arg) => typeof arg !== "string"))) {
    return null;
  }
  for (const key of Object.keys(e)) {
    if (key === "command" || key === "args") continue;
    const inert = INERT_CLIENT_KEYS[key];
    // An unknown key, or a known key with a non-inert value (e.g. type:"http"),
    // means this is not the entry Roster wrote — refuse to claim ownership.
    if (!inert?.(e[key])) return null;
  }
  return { command: e.command, args: e.args === undefined ? [] : ([...e.args] as string[]) };
};

/** Exact identity: is `candidate` byte-for-byte the entry we recorded writing? */
export function sameEntry(candidate: unknown, injected: SpawnEntry | undefined): boolean {
  const e = normalizeSpawnEntry(candidate);
  if (!e || !injected) return false;
  return (
    e.command === injected.command &&
    e.args.length === injected.args.length &&
    e.args.every((a, i) => a === injected.args[i])
  );
}

/**
 * Ownership is a set of exact entries Roster can prove it wrote: the current
 * install and intact active manifests. Command basenames and a trailing
 * "serve" are not identities; treating them as such discards unrelated tools.
 */
export function isOwnedRosterEntry(
  candidate: unknown,
  ownedEntries: readonly SpawnEntry[],
): boolean {
  return ownedEntries.some((owned) => sameEntry(candidate, owned));
}
