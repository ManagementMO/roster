import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { rosterHome } from "./paths.js";

const PRIVATE_FILE = 0o600;
const PRIVATE_DIR = 0o700;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 20;

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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "occupied"; // lost the race
    throw error;
  }
  const moved = readOwner(claim);
  const isExactlyTheDeadLock =
    moved !== null && moved.pid === observed.pid && moved.token === observed.token;
  if (isExactlyTheDeadLock && !processIsAlive(moved.pid)) {
    fs.rmSync(claim, { recursive: true, force: true });
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
        fs.rmSync(dir, { recursive: true, force: true });
        throw error;
      }
      return { dir, token };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
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
  fs.rmSync(dir, { recursive: true });
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
