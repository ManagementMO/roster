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
 * executable regular FILE and, until our own package is published, that it
 * realpaths INTO this checkout (no global `roster` today is ours). Relax the
 * realpath check post-publish (STATUS §4F). Overridable via ROSTER_ASSUME_GLOBAL.
 */
export function hasGlobalRoster(): boolean {
  if (process.env.ROSTER_ASSUME_GLOBAL === "1") return true;
  if (process.env.ROSTER_ASSUME_GLOBAL === "0") return false;
  const names = process.platform === "win32" ? ["roster.cmd", "roster.exe", "roster"] : ["roster"];
  const ourRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir === "") continue;
    for (const n of names) {
      const p = path.join(dir, n);
      try {
        if (!fs.statSync(p).isFile()) continue; // not a spawnable file (dir/socket/…)
        fs.accessSync(p, fs.constants.X_OK); // executable
        if (fs.realpathSync(p).startsWith(ourRoot + path.sep)) return true; // provably ours
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

/**
 * The entry sync writes. A global `roster` that is provably ours → `roster serve`.
 * Otherwise THIS install's own entrypoint (node + absolute `dist/bin.js`):
 * spawnable today for repo checkouts, pnpm links, and npx-cache installs, running
 * only code that is provably ours. Deliberately NOT `npx -y roster` — the npm
 * name `roster` is a THIRD-PARTY package (verified 2026-07-07, roster@0.0.3), so
 * that entry would fetch and run a stranger's code on every client boot. The npx
 * form becomes the no-global default only at publish, under P1's cleared name
 * (one-line change; STATUS §4F).
 */
export function rosterEntry(): SpawnEntry {
  if (hasGlobalRoster()) return { command: "roster", args: ["serve"] };
  return { command: process.execPath, args: [ourBinPath(), "serve"] };
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
    if (!inert || !inert(e[key])) return null;
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
