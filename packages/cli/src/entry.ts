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

const asEntry = (v: unknown): { command: string; args: string[] } | null => {
  if (v === null || typeof v !== "object") return null;
  const e = v as { command?: unknown; args?: unknown };
  if (typeof e.command !== "string") return null;
  return { command: e.command, args: Array.isArray(e.args) ? e.args.map(String) : [] };
};

/** Exact identity: is `candidate` byte-for-byte the entry we recorded writing? */
export function sameEntry(candidate: unknown, injected: SpawnEntry | undefined): boolean {
  const e = asEntry(candidate);
  if (!e || !injected) return false;
  return (
    e.command === injected.command &&
    e.args.length === injected.args.length &&
    e.args.every((a, i) => a === injected.args[i])
  );
}

/**
 * Is this entry ROSTER'S OWN proxy — something Roster wrote — as opposed to a
 * server the USER merely happens to have NAMED "roster"?
 *
 * Identity is the ENTRY, never the key. Round 5 (R5-01) found all three places
 * that confused the two: import skipped anything *named* `roster` (silently
 * dropping a user's own server), health accepted anything *commanded* `roster`,
 * and key-level eject did `delete servers.roster` (silently destroying a server
 * the user added after syncing). A name is a label the user chose; it says
 * nothing about what a thing IS.
 *
 * Every form we have ever written ends in `serve` and is one of: a bare global
 * `roster`, this install's `node <…>/bin.js`, or (post-publish) `npx`. A user's
 * own server called "roster" — `node /opt/my-roster-server.js` — matches none of
 * them and is imported and preserved like any other.
 *
 * For the DESTRUCTIVE path (eject) this structural test is not enough on its own:
 * see `sameEntry`, which matches against the exact entry recorded in the backup
 * manifest, so eject removes only what this install actually installed.
 */
export function isRosterProxyEntry(candidate: unknown): boolean {
  const e = asEntry(candidate);
  if (!e || !e.args.includes("serve")) return false;
  if (e.command === "roster") return true; // global form
  const base = path.basename(e.command);
  if (base.startsWith("node") && /(^|[\\/])bin\.js$/.test(e.args[0] ?? "")) return true; // this install
  if (base.startsWith("npx")) return true; // post-publish form
  return false;
}
