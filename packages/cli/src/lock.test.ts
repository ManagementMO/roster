import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reclaimOwnerlessLock, reclaimStaleLock, withFileLockSync } from "./lock.js";

let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-lock-"));
  process.env.ROSTER_TEST_HOME = home;
  process.env.ROSTER_HOME = path.join(home, ".roster");
});
afterEach(() => {
  delete process.env.ROSTER_TEST_HOME;
  delete process.env.ROSTER_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

/** A pid that is definitely dead: spawn a no-op child and let it exit. */
function deadPid(): number {
  const c = spawnSync(process.execPath, ["-e", ""]);
  return c.pid!;
}

function writeLock(dir: string, owner: { pid: number; token: string }): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, "owner.json"), `${JSON.stringify(owner)}\n`, { mode: 0o600 });
}

/**
 * NEW-2: stale-lock reclamation used a read-owner-then-blind-remove sequence, so
 * two contenders could both reclaim the same stale lock and enter the critical
 * section together. Reclamation is now an atomic, token-verified rename-claim.
 */
describe("stale-lock reclamation is atomic (NEW-2)", () => {
  const lockDir = () =>
    path.join(
      home,
      ".roster",
      "locks",
      `${crypto.createHash("sha256").update("k").digest("hex")}.lock`,
    );

  it("reclaims a lock whose recorded owner is exactly the dead one it observed", () => {
    const dir = lockDir();
    const owner = { pid: deadPid(), token: "T1" };
    writeLock(dir, owner);
    expect(reclaimStaleLock(dir, owner)).toBe("reclaimed");
    expect(fs.existsSync(dir)).toBe(false); // freed for a fresh acquire
  });

  it("does NOT destroy a LIVE lock that replaced the dead one between read and reclaim", () => {
    // The exact TOCTOU: we OBSERVED a dead owner, but by the time we act the slot
    // holds a different, live lock (a competitor already reclaimed + acquired).
    const dir = lockDir();
    const observedDead = { pid: deadPid(), token: "T1" };
    const liveReplacement = { pid: process.pid, token: "T2" }; // process.pid is alive
    writeLock(dir, liveReplacement);
    expect(reclaimStaleLock(dir, observedDead)).toBe("occupied");
    // The live lock MUST still be intact — never destroyed.
    expect(fs.existsSync(dir)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8"))).toEqual(liveReplacement);
  });

  it("a second reclaim after the slot is already freed is a safe no-op", () => {
    const dir = lockDir();
    const owner = { pid: deadPid(), token: "T1" };
    writeLock(dir, owner);
    expect(reclaimStaleLock(dir, owner)).toBe("reclaimed"); // first frees it
    // The slot is gone; a second reclaimer must not throw and must report the
    // slot free (its following mkdir — the real mutex — then arbitrates).
    expect(reclaimStaleLock(dir, owner)).toBe("reclaimed");
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("fails closed on CORRUPT owner metadata (waits out the timeout, never steals)", () => {
    const dir = lockDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir, "owner.json"), "{ not json", { mode: 0o600 });
    // A corrupt record still means a real holder MIGHT be running, so acquire
    // cannot prove the holder dead ⇒ it must time out rather than reclaim.
    // (5s lock timeout; generous outer bound.)
    const started = Date.now();
    expect(() => withFileLockSync("k", () => 0)).toThrow(/timed out waiting for Roster lock/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4_500);
  }, 15_000);

  /**
   * R6-08. A lock directory with NO owner.json is debris that no process can
   * ever own — `reclaimStaleLock` produces it by rename-claiming a directory a
   * competitor had just mkdir'd, finding it empty, and putting it back. It was
   * lumped in with "unreadable ownership", so every future acquire waited the
   * full 5s and threw. Permanently: only deleting ~/.roster/locks by hand
   * recovered it. Found by chasing a 1-in-8 failure of the multi-process test.
   */
  it("recovers from an OWNERLESS lock directory instead of wedging forever", () => {
    const dir = lockDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); // no owner.json: debris

    const started = Date.now();
    expect(withFileLockSync("k", () => "work done")).toBe("work done");
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(4_500); // reclaimed after the grace, not timed out
    expect(fs.existsSync(dir)).toBe(false); // and released cleanly

    // Still recoverable on a later attempt — the state does not re-wedge.
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    expect(withFileLockSync("k", () => "again")).toBe("again");
  }, 20_000);

  it("never treats a directory as debris while its owner is writing the record", () => {
    // The grace period exists so a competitor a few microseconds into its own
    // acquire is not mistaken for debris: an owner that appears before the
    // reclaim must be preserved, not destroyed.
    const dir = lockDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const live = { pid: process.pid, token: "T-live" };
    fs.writeFileSync(path.join(dir, "owner.json"), `${JSON.stringify(live)}\n`, { mode: 0o600 });
    expect(reclaimOwnerlessLock(dir)).toBe("occupied");
    expect(JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8"))).toEqual(live);
  });

  it("reclaims an ownerless directory directly, and is a safe no-op once gone", () => {
    const dir = lockDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    expect(reclaimOwnerlessLock(dir)).toBe("reclaimed");
    expect(fs.existsSync(dir)).toBe(false);
    expect(reclaimOwnerlessLock(dir)).toBe("reclaimed"); // already free
  });

  it("refuses to treat a symlinked lock path as our lock", () => {
    const dir = lockDir();
    const target = path.join(home, "elsewhere");
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(path.dirname(dir), { recursive: true, mode: 0o700 });
    fs.symlinkSync(target, dir);
    expect(reclaimStaleLock(dir, { pid: deadPid(), token: "T1" })).toBe("occupied");
    expect(fs.lstatSync(dir).isSymbolicLink()).toBe(true); // untouched
  });

  it("MULTI-PROCESS: N contenders over a stale lock never enter the section together", () => {
    // Real child processes, a barrier so they start together, and a stale lock
    // seeded with a dead pid so every child must go through reclamation. The
    // critical section asserts exclusivity via a live on-disk counter.
    const dir = lockDir();
    writeLock(dir, { pid: deadPid(), token: "seed" });
    const counter = path.join(home, "counter");
    fs.writeFileSync(counter, "0");
    const go = path.join(home, "GO");
    const worker = path.join(home, "worker.mjs");
    const req = pathToFileURL(path.join(process.cwd(), "packages/cli/package.json")).href;
    fs.writeFileSync(
      worker,
      `
      import fs from "node:fs";
      import { createRequire } from "node:module";
      import { pathToFileURL } from "node:url";
      const require_ = createRequire(${JSON.stringify(req)});
      // require.resolve returns an absolute path; ESM import() needs a file://
      // URL on Windows (a bare "D:\\..." path throws ERR_UNSUPPORTED_ESM_URL_SCHEME).
      const { withFileLockSync } = await import(pathToFileURL(require_.resolve("./dist/lock.js")).href);
      const counter = ${JSON.stringify(counter)};
      while (!fs.existsSync(${JSON.stringify(go)})) {}
      let maxSeen = 0;
      for (let i = 0; i < 20; i++) {
        withFileLockSync("k", () => {
          const n = Number(fs.readFileSync(counter, "utf8")) + 1;
          fs.writeFileSync(counter, String(n));
          maxSeen = Math.max(maxSeen, n);
          // brief in-section dwell to widen any concurrency window
          const end = Date.now() + 3; while (Date.now() < end) {}
          fs.writeFileSync(counter, String(n - 1));
        });
      }
      process.stdout.write(String(maxSeen));
      `,
    );
    const kids = Array.from({ length: 4 }, () =>
      require("node:child_process").spawn(process.execPath, [worker], {
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    const outs = kids.map(() => "");
    const errs = kids.map(() => "");
    kids.forEach((k, i) => {
      k.stdout.on("data", (d: Buffer) => {
        outs[i] += d.toString();
      });
      k.stderr.on("data", (d: Buffer) => {
        errs[i] += d.toString();
      });
    });
    fs.writeFileSync(go, "go"); // release the barrier
    const codes = kids.map(
      (k) =>
        new Promise<number>((resolve) => k.on("exit", (c: number | null) => resolve(c ?? -1))),
    );
    return Promise.all(codes).then((exitCodes) => {
      // Surface a crashed worker's stderr so a CI failure is diagnosable.
      exitCodes.forEach((c, i) => {
        if (c !== 0) console.error(`lock worker ${i} exited ${c}; stderr:\n${errs[i]}`);
      });
      expect(exitCodes.every((c) => c === 0)).toBe(true);
      // Each worker reports the max concurrent occupancy it ever observed. With a
      // correct mutex that is exactly 1; the pre-fix double-entry made it >= 2.
      for (const out of outs) expect(Number(out)).toBe(1);
    });
  }, 30_000);
});

/**
 * L14 — the PID-reuse and platform-specific claims reduced to the parts that CAN
 * be exercised deterministically on any OS. Actual pid reuse and the OS specifics
 * of rename() atomicity (POSIX vs NFS) and process.kill(pid,0) (POSIX vs Windows)
 * cannot be forced in one local Linux run, but the LOGIC that consumes them — the
 * token that disambiguates a reused pid, the refusal to evict a live-appearing
 * owner, and the rejection of a crafted non-positive pid — is platform-neutral.
 */
describe("PID reuse and platform reductions (L14)", () => {
  const lockDir = () =>
    path.join(
      home,
      ".roster",
      "locks",
      `${crypto.createHash("sha256").update("k").digest("hex")}.lock`,
    );

  it("a token mismatch stops eviction even for the SAME (dead) pid — token is identity", () => {
    // We OBSERVED {pid: P, token: T1}, but the slot now holds {pid: P, token: T2}
    // — a different acquisition that also recorded pid P (e.g. P was reused,
    // acquired, and died). P is dead, so ONLY the token can tell us this is not
    // the lock we observed; without that check we would destroy a lock we never
    // actually saw. This isolates the token guard from the liveness guard.
    const dir = lockDir();
    const pid = deadPid();
    writeLock(dir, { pid, token: "T2" });
    expect(reclaimStaleLock(dir, { pid, token: "T1" })).toBe("occupied");
    expect(fs.existsSync(dir)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8"))).toEqual({
      pid,
      token: "T2",
    });
  });

  it("never evicts a lock whose owner is ALIVE, even on an exact pid+token match", () => {
    // The owner we believed dead is in fact alive at reclaim time (revived, or a
    // misjudgement). Exact identity is NOT sufficient — a live owner is kept.
    const dir = lockDir();
    const owner = { pid: process.pid, token: "T1" };
    writeLock(dir, owner);
    expect(reclaimStaleLock(dir, owner)).toBe("occupied");
    expect(fs.existsSync(dir)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8"))).toEqual(owner);
  });

  it("rejects a crafted non-positive owner pid — process.kill is never handed a group target", () => {
    // A negative pid passed to process.kill targets a process GROUP. readOwner
    // must reject pid <= 0 so it can never reach processIsAlive.
    const dir = lockDir();
    writeLock(dir, { pid: -1, token: "T1" });
    const realKill = process.kill.bind(process);
    const killPids: number[] = [];
    process.kill = ((pid: number) => {
      killPids.push(pid);
      return true;
    }) as typeof process.kill;
    try {
      expect(reclaimStaleLock(dir, { pid: -1, token: "T1" })).toBe("occupied");
    } finally {
      process.kill = realKill;
    }
    expect(killPids.every((p) => p > 0)).toBe(true); // -1 never reached process.kill
    expect(fs.existsSync(dir)).toBe(true); // fail-closed: unreclaimable, preserved
  });

  it("treats a claim-rename failure (e.g. Windows EPERM) as occupied, never a crash", () => {
    // On Windows a losing racer's directory rename throws EPERM/EACCES/EBUSY
    // instead of POSIX's ENOENT. reclaimStaleLock must decline (return
    // "occupied") — not throw — so the contender falls through to the mutex.
    const dir = lockDir();
    const owner = { pid: deadPid(), token: "T1" };
    writeLock(dir, owner);
    const realRename = fs.renameSync;
    fs.renameSync = (() => {
      throw Object.assign(new Error("simulated Windows lock-dir busy"), { code: "EPERM" });
    }) as typeof fs.renameSync;
    try {
      expect(reclaimStaleLock(dir, owner)).toBe("occupied");
    } finally {
      fs.renameSync = realRename;
    }
    expect(fs.existsSync(dir)).toBe(true); // never destroyed by a failed claim
  });
});
