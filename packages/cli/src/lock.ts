import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensurePrivateDir, ensureRosterHome, PRIVATE_DIR, PRIVATE_FILE, rosterHome } from "./paths.js";

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

/**
 * Ownership has THREE states, and collapsing them to `null` wedged the lock
 * permanently (round-6 review R6-08):
 *
 *  - `owned`   — a valid owner record; liveness decides whether it is stale.
 *  - `invalid` — owner.json EXISTS but is corrupt/nonsensical. Ambiguous: a real
 *                holder may be running, so we keep failing closed.
 *  - `absent`  — owner.json is MISSING. This one is decidable: a holder writes
 *                owner.json immediately after `mkdir` and removes it only by
 *                removing the whole directory, so a directory that stays
 *                ownerless is debris, not a lock. Treating it as "unreadable"
 *                meant nobody could ever acquire that lock again.
 */
type OwnerState =
  | { kind: "owned"; owner: LockOwner }
  | { kind: "invalid" }
  | { kind: "absent" };

function readOwnerState(dir: string): OwnerState {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dir, "owner.json"), "utf8");
  } catch (error) {
    // Only a genuinely missing record is decidable; EACCES and friends stay
    // ambiguous and therefore fail closed.
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "absent" }
      : { kind: "invalid" };
  }
  try {
    const parsed = JSON.parse(raw) as { pid?: unknown; token?: unknown };
    if (
      typeof parsed.pid !== "number" ||
      !Number.isSafeInteger(parsed.pid) ||
      parsed.pid <= 0 ||
      typeof parsed.token !== "string" ||
      parsed.token === ""
    ) {
      return { kind: "invalid" };
    }
    return { kind: "owned", owner: { pid: parsed.pid, token: parsed.token } };
  } catch {
    return { kind: "invalid" };
  }
}

function readOwner(dir: string): LockOwner | null {
  const state = readOwnerState(dir);
  return state.kind === "owned" ? state.owner : null;
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
  // Re-read immediately before moving anything. The caller decided this lock
  // was stale from an earlier poll; if a competitor has already reclaimed the
  // slot since then, the live lock now sitting there must not be dragged
  // through a rename at all — the round trip is safe for the LOCK, but it can
  // make that owner's release land on a missing directory.
  const current = readOwner(dir);
  if (!current || current.pid !== observed.pid || current.token !== observed.token) {
    return "occupied";
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

/**
 * Reclaim a lock directory that carries NO owner record — the debris state
 * `reclaimStaleLock` can itself produce: it rename-claims a directory that a
 * competitor had just `mkdir`'d but not yet written owner.json into, finds no
 * owner, and renames the now-empty directory back. Nobody owns it, nobody ever
 * will, and every future contender used to wait the full timeout and fail —
 * permanently, until the user deleted `~/.roster/locks` by hand (R6-08).
 *
 * Uses the same serialization as the stale path: rename first, then decide. If
 * the moved directory turns out to have an owner after all (a competitor won
 * the race between our check and our rename), it goes straight back untouched.
 * Callers must only reach here after the grace period below, so a live holder
 * mid-`mkdir` is never mistaken for debris.
 */
export function reclaimOwnerlessLock(
  dir: string,
  graceMs: number = OWNERLESS_GRACE_MS,
): "reclaimed" | "occupied" {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(dir);
  } catch {
    return "reclaimed"; // vanished underneath us → free to retry
  }
  if (stat.isSymbolicLink()) return "occupied";
  /**
   * Debris is OLD; a directory created moments ago is a competitor between its
   * `mkdir` and its owner write. Age the DIRECTORY, don't just time how long
   * this process has been watching: under real contention a contender can
   * observe "no owner" again and again while catching a succession of
   * *different* processes each in that window, accumulate past the grace
   * period, and move a perfectly live lock aside. The owner then failed its
   * release with "ownership changed before release" — a crash after its work
   * had already succeeded. Tying the decision to the inode's own change time
   * removes that entirely, and a rename-back refreshes ctime so a lock we
   * decline is not aged toward eviction by our own inspection.
   */
  // Clamped at zero: filesystem timestamps can read marginally AHEAD of
  // Date.now() (APFS granularity, or a clock adjustment), and a negative age
  // would compare as "younger than the grace period" forever — quietly
  // restoring the permanent wedge this whole path exists to prevent.
  if (Math.max(0, Date.now() - stat.ctimeMs) < graceMs) return "occupied";
  const claim = `${dir}.orphan-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  try {
    fs.renameSync(dir, claim);
  } catch {
    return "occupied"; // lost the claim; the mkdir mutex still arbitrates
  }
  if (readOwnerState(claim).kind === "absent") {
    fs.rmSync(claim, RM_OPTS);
    return "reclaimed";
  }
  try {
    fs.renameSync(claim, dir);
  } catch {
    /* slot reoccupied — never delete a lock we do not own */
  }
  return "occupied";
}

/**
 * How long a lock directory must stay ownerless before we call it debris. The
 * real window between `mkdir` and the owner.json write is sub-millisecond, so
 * this is ~1000x margin while still leaving most of the 5s budget for retries.
 */
const OWNERLESS_GRACE_MS = 1_000;

/**
 * Our own lock directory was rename-claimed out from under us mid-acquire.
 *
 * ENOENT is the obvious form. macOS/APFS also reports **EINVAL** for a create
 * inside a directory a competitor is concurrently renaming, and ENOTDIR if
 * something that is not a directory lands at the path. All three mean the same
 * thing: the slot we just made is no longer ours to write into.
 *
 * This is not theoretical — four processes racing one stale lock crashed a
 * contender with a raw `EINVAL ... open '…/owner.json'` stack, because the
 * first version of this guard only recognised ENOENT. Retrying stays bounded by
 * the acquire deadline, so a genuinely persistent failure still ends in the
 * clear "timed out waiting for Roster lock" error rather than an errno dump.
 * Lock paths are sha256 hex, so EINVAL here can never mean a malformed name.
 */
export function dirVanished(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "EINVAL" || code === "ENOTDIR";
}

function acquire(key: string): { dir: string; token: string } {
  // Harden the home too, not just the locks root: `mkdirSync` would otherwise
  // create (or silently inherit) a world-traversable `~/.roster` around it.
  ensureRosterHome();
  ensurePrivateDir(path.join(rosterHome(), "locks"));
  const dir = lockPath(key);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let ownerlessSince: number | null = null;

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
      // A vanished directory means a competitor rename-claimed the slot between
      // our mkdir and our owner write. That is contention, not a fault: retry
      // under the same deadline instead of crashing the caller with a raw
      // ENOENT, which is what a contender used to do (R6-08).
      if (!mkdirWasContended(error, dir) && !dirVanished(error)) throw error;
    }

    const state = readOwnerState(dir);
    if (state.kind === "owned") {
      ownerlessSince = null;
      // Atomic, token-verified reclaim (see reclaimStaleLock). Only skip the
      // backoff when we actually freed the slot; if a live lock now holds it,
      // fall through to the deadline + poll so we cannot spin.
      if (!processIsAlive(state.owner.pid) && reclaimStaleLock(dir, state.owner) === "reclaimed") {
        continue;
      }
    } else if (state.kind === "absent") {
      // Debris, or a competitor a few microseconds into its own acquire. Wait
      // out the grace period before deciding, then clear it so the lock is not
      // wedged for every future process.
      ownerlessSince ??= Date.now();
      if (
        Date.now() - ownerlessSince >= OWNERLESS_GRACE_MS &&
        reclaimOwnerlessLock(dir) === "reclaimed"
      ) {
        ownerlessSince = null;
        continue;
      }
    } else {
      ownerlessSince = null; // corrupt record: ambiguous, keep failing closed
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `timed out waiting for Roster lock "${key}"${
          state.kind === "owned" ? ` held by pid ${state.owner.pid}` : " with unreadable ownership"
        }`,
      );
    }
    sleepSync(LOCK_POLL_MS);
  }
}

/**
 * How long release re-checks before believing the lock was really stolen.
 *
 * Both reclaim paths inspect a lock by renaming it aside, reading it, and
 * renaming it back. That window is microseconds — but a holder that tries to
 * release inside it sees no owner record and used to throw
 * "ownership changed before release" *after its critical section had already
 * succeeded*, turning another process's harmless inspection into this
 * process's crash. Re-checking costs nothing when uncontended and rides out
 * the window when contended; a genuinely stolen lock still throws, just later.
 */
const RELEASE_RECHECK_MS = 250;

/**
 * Find our own lock after a contender moved it aside.
 *
 * Reclamation claims a lock by renaming it — that rename is load-bearing, it is
 * what stops two processes from both evicting the same stale lock (NEW-2). The
 * cost is that a live lock can be moved for a moment while a contender decides
 * it is not the dead one it was looking for, and if the slot is retaken before
 * it can be renamed back, our directory is left behind under a claim name.
 *
 * Identity is the token, not the path. If a claim directory carries OUR pid and
 * token, that IS our lock: removing it completes the release and clears debris
 * that would otherwise accumulate in the locks root forever.
 */
function releaseMovedLock(dir: string, token: string): boolean {
  const root = path.dirname(dir);
  const prefix = `${path.basename(dir)}.`;
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const candidate = path.join(root, entry);
    const owner = readOwner(candidate);
    if (owner?.pid === process.pid && owner.token === token) {
      fs.rmSync(candidate, RM_OPTS);
      return true;
    }
  }
  return false;
}

function release(dir: string, token: string): void {
  const deadline = Date.now() + RELEASE_RECHECK_MS;
  for (;;) {
    const owner = readOwner(dir);
    if (owner && owner.pid === process.pid && owner.token === token) {
      fs.rmSync(dir, RM_OPTS); // only ever remove a directory we still own
      return;
    }
    // Our lock may have been renamed aside mid-inspection; it is still ours.
    if (releaseMovedLock(dir, token)) return;
    if (Date.now() >= deadline) {
      throw new Error("Roster lock ownership changed before release");
    }
    sleepSync(LOCK_POLL_MS);
  }
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
