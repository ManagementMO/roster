import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Everything Roster writes is owner-only. `~/.roster` holds imported `env`
 * blocks (API keys), verbatim copies of client configs, and the Coach database
 * — which indexes every tool description and whole SKILL.md bodies. The mode
 * bits live HERE, not in rosterfile.ts, so `lock.ts` can harden the home
 * without importing the module that imports it.
 */
export const PRIVATE_FILE = 0o600;
export const PRIVATE_DIR = 0o700;

/** Test hook: ROSTER_TEST_HOME lets the whole CLI run against a fixture home. */
export function homeDir(): string {
  return process.env.ROSTER_TEST_HOME ?? os.homedir();
}

export function rosterHome(): string {
  return process.env.ROSTER_HOME ?? path.join(homeDir(), ".roster");
}

/**
 * Create a directory owner-only AND re-assert that mode when it already exists.
 *
 * `mkdirSync(dir, { mode })` applies the mode ONLY when it actually creates the
 * directory — and it is masked by the process umask even then. So a `~/.roster`
 * that predates this build, was restored from an archive, or was created by
 * hand at 0755 stayed world-traversable forever, leaving the files inside it
 * reachable by any other local user (round-6 review R6-01). Re-asserting on
 * every write is cheap and idempotent, and it is what `lock.ts` already did for
 * the locks root alone.
 */
export function ensurePrivateDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR });
  try {
    const current = fs.statSync(dir).mode & 0o777;
    if ((current & 0o077) !== 0) fs.chmodSync(dir, current & 0o700);
  } catch {
    // Best effort: Windows has no POSIX mode bits, and an unreadable stat here
    // must never block the operation the caller actually asked for.
  }
  return dir;
}

/** The Roster home, created (or re-hardened) owner-only. */
export function ensureRosterHome(): string {
  return ensurePrivateDir(rosterHome());
}

export function rosterConfigPath(): string {
  return path.join(rosterHome(), "roster.json");
}

export function receiptPath(): string {
  return path.join(rosterHome(), "receipt.json");
}

export function coachDbPath(): string {
  return path.join(rosterHome(), "coach.db");
}
