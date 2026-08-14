import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { rosterHome } from "./paths.js";

const PRIVATE_FILE = 0o600;
const PRIVATE_DIR = 0o700;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 20;
// Windows throws EPERM/EBUSY on mkdirSync/rmSync when another process (or a virus
// scanner / indexer) holds a directory handle open for a moment; recursive rmSync
// with maxRetries retries exactly those transient errors (a no-op on POSIX, where
// the remove succeeds first try). The mkdir path is handled as contention only
// when the lock entry still exists, so a real permission error is not swallowed.
const RM_OPTS = { recursive: true, force: true, maxRetries: 10, retryDelay: 50 } as const;

interface LockOwner {
  pid: number;
  token: string;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function lockPath(key: string): string {
  const digest = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(rosterHome(), "locks", `${digest}.lock`);
}

function mkdirWasContended(error: unknown, dir: string): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EEXIST") return true;
  if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") return false;
  try {
    fs.lstatSync(dir);
    return true;
  } catch {
    return false;
  }
}

function readOwner(dir: string): LockOwner | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8")) as {
      pid?: unknown;
      token?: unknown;
    };
    if (
      typeof parsed.pid !== "number" ||
      !Number.isSafeInteger(parsed.pid) ||
      parsed.pid <= 0 ||
      typeof parsed.token !== "string" ||
      parsed.token === ""
    ) {
      return null;
    }
    return { pid: parsed.pid, token: parsed.token };
  } catch {
    return null;
  }
}

/**
 * PID reuse: a dead owner's pid can later belong to a LIVE, unrelated process.
 * That is the SAFE direction here — `processIsAlive` then reports "alive", so the
 * lock is treated as held and the contender waits rather than evicting it. The
 * per-acquisition random `token` closes the other direction: it, not the pid, is
 * identity, so a reused pid carrying a stale token is never mistaken for the
 * original owner (see `reclaimStaleLock`). A non-positive pid never reaches this
 * function — `readOwner` rejects it — so `process.kill` can never be handed a
 * negative pid (which targets a process GROUP).
 *
 * Platform reductions (cannot be forced in a local Linux run, so exercised on the
 * POSIX path and reduced to a documented dependency): the atomic reclaim rests on
 * `rename()` being atomic (POSIX; holds on local fs and NFSv3+), and liveness on
 * `process.kill(pid, 0)` (POSIX + Windows via libuv). The consuming LOGIC — token
 * disambiguation, live-owner refusal, invalid-owner rejection — is platform-
 * neutral and unit-tested directly.
 */
function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/**
 * Reclaim a lock whose recorded owner is provably dead — ATOMICALLY, so two
 * contenders can never both reclaim the same stale lock and enter the critical
 * section together (NEW-2). The reviewed base did `readOwner(dir)` then a blind
 * `rmSync(dir)`; between those steps another process could reclaim and acquire,
 * and the first process's `rmSync` then deleted that LIVE lock before its own
 * `mkdir` succeeded — two owners at once.
 *
 * The rename is the serialization point: `rename(dir, claim)` moves whatever
 * inode is at `dir` atomically, so exactly one racer can move a given lock; the
 * loser gets ENOENT. The winner then verifies the moved directory is the SAME
 * dead owner it decided to reclaim (pid AND token) and is still dead before
 * removing it. If a live lock had slipped in (different token, or the pid is now
 * alive), it is renamed back and never destroyed — the safe direction is always
 * to preserve a lock we are not certain is dead.
 *
 * Returns "reclaimed" when `dir` is now free to (re)create, or "occupied" when
 * another owner holds it (caller retries `mkdir`, which fails EEXIST and waits).
 */
export function reclaimStaleLock(dir: string, observed: LockOwner): "reclaimed" | "occupied" {
  // Never treat a symlink as our lock directory: a hostile or stray symlink at
  // the lock path must not let a rename/remove escape the locks root.
  try {
    if (fs.lstatSync(dir).isSymbolicLink()) return "occupied";
  } catch {
    return "reclaimed"; // vanished underneath us → free to retry
  }
  const claim = `${dir}.reclaim-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  try {
    fs.renameSync(dir, claim);
  } catch {
    // Failing to rename-claim means we did NOT win the claim, and declining is
    // always safe: the caller falls through to the mkdir mutex + deadline, so a
    // lost claim can only cost a bounded wait, never two owners. POSIX racers
    // lose with ENOENT (a competitor already moved the dir); Windows instead
    // throws EPERM/EACCES/EBUSY when another process holds the directory open.
    // Both mean the same thing here, so treat ANY rename failure as "occupied"
    // rather than crashing the contender.
    return "occupied";
  }
  const moved = readOwner(claim);
  const isExactlyTheDeadLock =
    moved !== null && moved.pid === observed.pid && moved.token === observed.token;
  if (isExactlyTheDeadLock && !processIsAlive(moved.pid)) {
    fs.rmSync(claim, RM_OPTS);
    return "reclaimed";
  }
  // We moved something we did not intend to reclaim (a live lock replaced the
  // dead one between our read and our rename). Put it back; if the slot was
  // re-taken meanwhile, leave the claim dir for later GC rather than destroy it.
  try {
    fs.renameSync(claim, dir);
  } catch {
    /* slot reoccupied — never delete a lock we do not own */
  }
  return "occupied";
}

function acquire(key: string): { dir: string; token: string } {
  const root = path.join(rosterHome(), "locks");
  fs.mkdirSync(root, { recursive: true, mode: PRIVATE_DIR });
  fs.chmodSync(root, PRIVATE_DIR);
  const dir = lockPath(key);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      fs.mkdirSync(dir, { mode: PRIVATE_DIR });
      const token = crypto.randomBytes(16).toString("hex");
      try {
        fs.writeFileSync(
          path.join(dir, "owner.json"),
          `${JSON.stringify({ pid: process.pid, token })}\n`,
          { mode: PRIVATE_FILE, flag: "wx" },
        );
      } catch (error) {
        fs.rmSync(dir, RM_OPTS);
        throw error;
      }
      return { dir, token };
    } catch (error) {
      if (!mkdirWasContended(error, dir)) throw error;
    }

    const owner = readOwner(dir);
    if (owner && !processIsAlive(owner.pid)) {
      // Atomic, token-verified reclaim (see reclaimStaleLock). Only skip the
      // backoff when we actually freed the slot; if a live lock now holds it,
      // fall through to the deadline + poll so we cannot spin.
      if (reclaimStaleLock(dir, owner) === "reclaimed") continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out waiting for Roster lock "${key}"${owner ? ` held by pid ${owner.pid}` : " with unreadable ownership"}`,
      );
    }
    sleepSync(LOCK_POLL_MS);
  }
}

function release(dir: string, token: string): void {
  const owner = readOwner(dir);
  if (!owner || owner.pid !== process.pid || owner.token !== token) {
    throw new Error("Roster lock ownership changed before release");
  }
  fs.rmSync(dir, RM_OPTS);
}

/**
 * Serialize a local mutation across processes using an atomic owner-only
 * directory. Only a lock whose recorded process is provably dead is reclaimed;
 * unreadable or ambiguous ownership fails closed after a bounded wait.
 */
export function withFileLockSync<T>(key: string, fn: () => T): T {
  const held = acquire(key);
  let result: T | undefined;
  let failure: unknown;
  let didThrow = false;
  try {
    result = fn();
  } catch (error) {
    didThrow = true;
    failure = error;
  }
  try {
    release(held.dir, held.token);
  } catch (releaseError) {
    if (!didThrow) throw releaseError;
  }
  if (didThrow) throw failure;
  return result as T;
}
