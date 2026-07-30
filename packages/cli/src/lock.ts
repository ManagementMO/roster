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
      try {
        fs.rmSync(dir, { recursive: true });
        continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      }
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
