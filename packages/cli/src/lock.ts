import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensurePrivateDir, ensureRosterHome, PRIVATE_DIR, PRIVATE_FILE, rosterHome } from "./paths.js";

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 20;
const CLAIM_BASENAME = ".reclaim";
const CLAIM_GRACE_MS = 1_000;
const OWNER_REMOVE_RETRIES = 10;
const TRANSIENT_REMOVE_CODES = new Set(["EBUSY", "EACCES", "EPERM", "EMFILE", "ENFILE"]);
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

/**
 * Windows can transiently reject an owner-file unlink while Defender, an
 * indexer, or another reader still has a handle open. Retrying directory
 * cleanup via RM_OPTS but unlinking owner.json once left the release path as the
 * one unprotected operation — an error after the critical section had already
 * succeeded. Retry only the documented transient classes; a real permission or
 * filesystem error still surfaces after a bounded 500ms maximum.
 */
function removeOwnerFile(file: string, allowMissing: boolean): boolean {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.unlinkSync(file);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" && allowMissing) return false;
      if (!TRANSIENT_REMOVE_CODES.has(code ?? "") || attempt >= OWNER_REMOVE_RETRIES) {
        throw error;
      }
      sleepSync(50);
    }
  }
}

function lockPath(key: string): string {
  const digest = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(rosterHome(), "locks", `${digest}.lock`);
}

function ownerPath(dir: string): string {
  return path.join(dir, "owner.json");
}

function claimPath(dir: string): string {
  return path.join(dir, CLAIM_BASENAME);
}

function sameOwner(a: LockOwner | null, b: LockOwner): boolean {
  return a !== null && a.pid === b.pid && a.token === b.token;
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
 *  - `absent`  — owner.json is MISSING. In the persistent-slot protocol this is
 *                the normal unlocked state; contenders race on an atomic `wx`.
 */
type OwnerState =
  | { kind: "owned"; owner: LockOwner }
  | { kind: "invalid" }
  | { kind: "absent" };

function readOwnerState(dir: string): OwnerState {
  let raw: string;
  try {
    raw = fs.readFileSync(ownerPath(dir), "utf8");
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
 * identity. A non-positive pid never reaches this function — `readOwnerState`
 * rejects it — so `process.kill` can never be handed a negative group target.
 */
function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** The canonical directory is a persistent slot, never the mutex itself. */
function ensureLockSlot(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { mode: PRIVATE_DIR });
  } catch (error) {
    if (!mkdirWasContended(error, dir)) throw error;
  }
  try {
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
    try {
      fs.chmodSync(dir, PRIVATE_DIR);
    } catch {
      /* Windows/exotic filesystem: the owner-only parent remains the boundary. */
    }
    return true;
  } catch {
    return false;
  }
}

function claimOwned(dir: string, claim: LockOwner): boolean {
  return sameOwner(readOwner(claimPath(dir)), claim);
}

/** Move a stale transient claim aside without ever moving the canonical slot. */
function retireClaim(dir: string, observed: OwnerState, observedCtime: number): boolean {
  const claimDir = claimPath(dir);
  let currentStat: fs.Stats;
  try {
    currentStat = fs.lstatSync(claimDir);
    if (currentStat.isSymbolicLink() || !currentStat.isDirectory()) return false;
  } catch {
    return true;
  }
  const current = readOwnerState(claimDir);
  if (observed.kind === "owned") {
    if (current.kind !== "owned" || !sameOwner(current.owner, observed.owner)) return false;
    if (processIsAlive(current.owner.pid)) return false;
  } else {
    if (current.kind !== observed.kind || currentStat.ctimeMs !== observedCtime) return false;
    if (Math.max(0, Date.now() - currentStat.ctimeMs) < CLAIM_GRACE_MS) return false;
  }

  const retired = path.join(
    dir,
    `${CLAIM_BASENAME}.stale-${process.pid}-${crypto.randomBytes(8).toString("hex")}`,
  );
  try {
    fs.renameSync(claimDir, retired);
  } catch {
    return false;
  }

  const moved = readOwnerState(retired);
  const safeToRemove =
    observed.kind === "owned"
      ? moved.kind === "owned" && sameOwner(moved.owner, observed.owner) && !processIsAlive(moved.owner.pid)
      : moved.kind === observed.kind;
  if (!safeToRemove) {
    try {
      fs.renameSync(retired, claimDir);
    } catch {
      /* A new fixed claim exists. The moved claimant re-verifies and aborts. */
    }
    return false;
  }
  fs.rmSync(retired, RM_OPTS);
  return true;
}

/**
 * Return true while another process owns the one fixed in-directory reclaim
 * marker. Dead or abandoned markers are retired opportunistically.
 */
function claimBlocks(dir: string): boolean {
  const claimDir = claimPath(dir);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(claimDir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return true;
  } catch {
    return false;
  }
  const state = readOwnerState(claimDir);
  if (state.kind === "owned" && processIsAlive(state.owner.pid)) return true;
  retireClaim(dir, state, stat.ctimeMs);
  try {
    fs.lstatSync(claimDir);
    return true;
  } catch {
    return false;
  }
}

/** Acquire the single fixed claim marker. Different names would not serialize. */
function tryAcquireClaim(dir: string): LockOwner | null {
  const claimDir = claimPath(dir);
  try {
    fs.mkdirSync(claimDir, { mode: PRIVATE_DIR });
  } catch (error) {
    if (mkdirWasContended(error, claimDir)) {
      claimBlocks(dir);
      return null;
    }
    if (dirVanished(error)) return null;
    throw error;
  }

  const claim = { pid: process.pid, token: crypto.randomBytes(16).toString("hex") };
  try {
    fs.writeFileSync(ownerPath(claimDir), `${JSON.stringify(claim)}\n`, {
      mode: PRIVATE_FILE,
      flag: "wx",
    });
  } catch (error) {
    // We just created this fixed directory and no contender will retire an empty
    // claim before the grace period, so immediate cleanup cannot delete a live
    // replacement. Leaving it behind would add an avoidable one-second stall.
    try {
      fs.rmSync(claimDir, RM_OPTS);
    } catch {
      /* The next contender recovers it after CLAIM_GRACE_MS. */
    }
    if (dirVanished(error)) return null;
    throw error;
  }
  return claimOwned(dir, claim) ? claim : null;
}

function releaseClaim(dir: string, claim: LockOwner): void {
  if (!claimOwned(dir, claim)) return;
  try {
    fs.rmSync(claimPath(dir), RM_OPTS);
  } catch {
    /* A stale claim is recoverable and never represents lock ownership. */
  }
}

/**
 * Reclaim a lock whose recorded owner is provably dead. The old implementation
 * rename-claimed the ENTIRE canonical directory, making the lock path disappear
 * during inspection; a third process could then acquire while a live holder was
 * still in its critical section. The fixed `.reclaim` directory serializes
 * inspection while the canonical slot remains present for the entire protocol.
 */
export function reclaimStaleLock(dir: string, observed: LockOwner): "reclaimed" | "occupied" {
  if (!ensureLockSlot(dir) || claimBlocks(dir)) return "occupied";
  const stateBeforeClaim = readOwnerState(dir);
  if (stateBeforeClaim.kind === "absent") return "reclaimed";
  if (stateBeforeClaim.kind !== "owned" || !sameOwner(stateBeforeClaim.owner, observed)) {
    return "occupied";
  }

  const claim = tryAcquireClaim(dir);
  if (!claim) return "occupied";
  try {
    if (!claimOwned(dir, claim)) return "occupied";
    const current = readOwner(dir);
    if (!sameOwner(current, observed) || processIsAlive(observed.pid)) return "occupied";
    if (!claimOwned(dir, claim) || !sameOwner(readOwner(dir), observed)) return "occupied";
    try {
      removeOwnerFile(ownerPath(dir), true);
    } catch {
      return "occupied";
    }
    return "reclaimed";
  } finally {
    releaseClaim(dir, claim);
  }
}

/**
 * In the persistent-slot protocol an ownerless canonical directory is already
 * the normal free state. Nothing is renamed or removed; `owner.json` with `wx`
 * is the sole acquisition primitive.
 */
export function reclaimOwnerlessLock(
  dir: string,
  _graceMs: number = CLAIM_GRACE_MS,
): "reclaimed" | "occupied" {
  if (!ensureLockSlot(dir) || claimBlocks(dir)) return "occupied";
  return readOwnerState(dir).kind === "absent" ? "reclaimed" : "occupied";
}

/** Our slot disappeared because an older process is still using the legacy protocol. */
export function dirVanished(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "EINVAL" || code === "ENOTDIR";
}

function createOwner(dir: string): LockOwner | null {
  const owner = { pid: process.pid, token: crypto.randomBytes(16).toString("hex") };
  try {
    fs.writeFileSync(ownerPath(dir), `${JSON.stringify(owner)}\n`, {
      mode: PRIVATE_FILE,
      flag: "wx",
    });
    return owner;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST" || dirVanished(error)) return null;
    throw error;
  }
}

function acquire(key: string): { dir: string; token: string } {
  ensureRosterHome();
  ensurePrivateDir(path.join(rosterHome(), "locks"));
  const dir = lockPath(key);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    if (ensureLockSlot(dir) && !claimBlocks(dir)) {
      const owner = createOwner(dir);
      if (owner) return { dir, token: owner.token };

      const state = readOwnerState(dir);
      if (state.kind === "owned" && !processIsAlive(state.owner.pid)) {
        if (reclaimStaleLock(dir, state.owner) === "reclaimed") continue;
      } else if (state.kind === "absent") {
        // The owner disappeared between our exclusive create and state read.
        continue;
      }
    }

    if (Date.now() >= deadline) {
      const state = readOwnerState(dir);
      throw new Error(
        `timed out waiting for Roster lock "${key}"${
          state.kind === "owned" ? ` held by pid ${state.owner.pid}` : " with unreadable ownership"
        }`,
      );
    }
    sleepSync(LOCK_POLL_MS);
  }
}

/** Legacy compatibility for a pre-upgrade process that moved our live slot. */
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
  const deadline = Date.now() + 250;
  for (;;) {
    const owner = readOwner(dir);
    if (owner && owner.pid === process.pid && owner.token === token) {
      try {
        removeOwnerFile(ownerPath(dir), false);
        return; // The persistent canonical directory remains for the next wx.
      } catch (error) {
        if (!dirVanished(error)) throw error;
      }
    }
    if (releaseMovedLock(dir, token)) return;
    if (Date.now() >= deadline) {
      throw new Error("Roster lock ownership changed before release");
    }
    sleepSync(LOCK_POLL_MS);
  }
}

/**
 * Serialize a local mutation across processes using an owner-only persistent
 * directory and an atomic owner-file create. Only a lock whose recorded process
 * is provably dead is reclaimed; unreadable ownership fails closed.
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
