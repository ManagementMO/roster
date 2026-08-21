import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dirVanished, reclaimOwnerlessLock, reclaimStaleLock, withFileLockSync } from "./lock.js";

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

function wait(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
    expect(fs.existsSync(dir)).toBe(true); // persistent slot: never disappears during inspection
    expect(fs.existsSync(path.join(dir, "owner.json"))).toBe(false); // owner removed; next wx arbitrates
  });

  it("never renames the canonical lock directory while deciding whether an owner is stale", () => {
    const dir = lockDir();
    const owner = { pid: deadPid(), token: "T1" };
    writeLock(dir, owner);
    const realRename = fs.renameSync;
    let canonicalMoved = false;
    fs.renameSync = ((source: fs.PathLike, destination: fs.PathLike) => {
      if (path.resolve(String(source)) === path.resolve(dir)) canonicalMoved = true;
      return realRename(source, destination);
    }) as typeof fs.renameSync;
    try {
      expect(reclaimStaleLock(dir, owner)).toBe("reclaimed");
    } finally {
      fs.renameSync = realRename;
    }
    expect(canonicalMoved).toBe(false);
  });

  it("release clears only ownership and leaves the canonical slot in place", () => {
    const dir = lockDir();
    expect(withFileLockSync("k", () => "done")).toBe("done");
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, "owner.json"))).toBe(false);
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
    // The owner is gone; a second reclaimer must report the persistent slot
    // free. The following owner.json `wx` — not mkdir — arbitrates.
    expect(reclaimStaleLock(dir, owner)).toBe("reclaimed");
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, "owner.json"))).toBe(false);
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
    expect(elapsed).toBeLessThan(1_000); // free owner-file slot: no grace delay needed
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, "owner.json"))).toBe(false);

    // Still recoverable on a later attempt — the persistent slot does not wedge.
    expect(withFileLockSync("k", () => "again")).toBe("again");
  }, 20_000);

  it("never treats a directory with an owner as a free slot", () => {
    // A valid owner always wins over the reusable persistent directory: only
    // owner.json absence is free, and an existing owner is never removed here.
    const dir = lockDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const live = { pid: process.pid, token: "T-live" };
    fs.writeFileSync(path.join(dir, "owner.json"), `${JSON.stringify(live)}\n`, { mode: 0o600 });
    expect(reclaimOwnerlessLock(dir)).toBe("occupied");
    expect(JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8"))).toEqual(live);
  });

  /**
   * A contender crashed with a raw `EINVAL … open '…/owner.json'` during the
   * four-process race below: macOS/APFS reports EINVAL (not ENOENT) when you
   * create a file inside a directory a competitor is concurrently renaming.
   * The first version of this guard only recognised ENOENT, so the contender
   * threw an errno stack at the user instead of retrying. All three codes mean
   * "the slot we just made is no longer ours"; everything else must still
   * surface, or a real fault would be retried into a timeout.
   */
  it("classifies a directory taken mid-acquire as contention, not as a fault", () => {
    for (const code of ["ENOENT", "EINVAL", "ENOTDIR"]) {
      expect(dirVanished(Object.assign(new Error(code), { code }))).toBe(true);
    }
    for (const code of ["EACCES", "EPERM", "EMFILE", "ENOSPC", "EROFS"]) {
      expect(dirVanished(Object.assign(new Error(code), { code }))).toBe(false);
    }
    expect(dirVanished(new Error("no code at all"))).toBe(false);
  });

  it("recognizes an ownerless persistent slot as free without deleting it", () => {
    const dir = lockDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    expect(reclaimOwnerlessLock(dir, 0)).toBe("reclaimed");
    expect(fs.existsSync(dir)).toBe(true);
    expect(reclaimOwnerlessLock(dir, 0)).toBe("reclaimed");
  });

  /**
   * A permanently missing canonical directory is a legacy/malicious topology
   * change, not a normal release. Re-check before declaring ownership lost so
   * an older process that briefly moved the slot can put it back.
   */
  it("re-checks before declaring the lock stolen, instead of failing on a momentary move", () => {
    const started = Date.now();
    expect(() =>
      withFileLockSync("k", () => {
        // Simulate the worst case: the directory is gone and never comes back.
        fs.rmSync(lockDir(), { recursive: true, force: true });
      }),
    ).toThrow(/ownership changed before release/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200); // it waited, not gave up
  });

  /**
   * Compatibility with the pre-upgrade protocol: an older process may still
   * rename the canonical directory aside. Identity is the token, not the path,
   * so this process can finish releasing its legacy moved lock without debris.
   */
  it("completes the release when a contender left our lock under a claim name", () => {
    const dir = lockDir();
    expect(() =>
      withFileLockSync("k", () => {
        // Exactly what a contender's rename-then-fail-to-restore leaves behind.
        fs.renameSync(dir, `${dir}.reclaim-999999-deadbeef`);
      }),
    ).not.toThrow();
    // …and nothing is left behind: no wedged slot, no growing debris.
    const leftovers = fs
      .readdirSync(path.dirname(dir))
      .filter((entry) => entry.startsWith(path.basename(dir)));
    expect(leftovers).toEqual([]);
  });

  it("lets contenders atomically reuse a just-created ownerless slot", () => {
    const dir = lockDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    expect(reclaimOwnerlessLock(dir)).toBe("reclaimed");
    expect(withFileLockSync("k", () => "owned")).toBe("owned");
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("recovers a fixed claim whose process died after mkdir but before metadata", () => {
    const dir = lockDir();
    fs.mkdirSync(path.join(dir, ".reclaim"), { recursive: true, mode: 0o700 });
    wait(1_050); // abandoned empty claims are ambiguous only during this grace
    expect(withFileLockSync("k", () => "recovered")).toBe("recovered");
    expect(fs.existsSync(path.join(dir, ".reclaim"))).toBe(false);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("retires a fixed claim whose recorded claimant is provably dead", () => {
    const dir = lockDir();
    writeLock(dir, { pid: deadPid(), token: "stale-owner" });
    writeLock(path.join(dir, ".reclaim"), { pid: deadPid(), token: "dead-claim" });
    expect(withFileLockSync("k", () => "recovered")).toBe("recovered");
    expect(fs.existsSync(path.join(dir, ".reclaim"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "owner.json"))).toBe(false);
  });

  it("recovers when a reclaimer dies after clearing the stale owner", () => {
    const dir = lockDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeLock(path.join(dir, ".reclaim"), { pid: deadPid(), token: "dead-claim" });
    expect(withFileLockSync("k", () => "recovered")).toBe("recovered");
    expect(fs.existsSync(path.join(dir, ".reclaim"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "owner.json"))).toBe(false);
  });

  it("retires corrupt transient claim metadata after the grace period", () => {
    const dir = lockDir();
    fs.mkdirSync(path.join(dir, ".reclaim"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir, ".reclaim", "owner.json"), "{not json", { mode: 0o600 });
    wait(1_050);
    expect(withFileLockSync("k", () => "recovered")).toBe("recovered");
    expect(fs.existsSync(path.join(dir, ".reclaim"))).toBe(false);
  });

  it("never steals the one fixed claim from a live claimant", () => {
    const dir = lockDir();
    const owner = { pid: deadPid(), token: "stale-owner" };
    writeLock(dir, owner);
    const liveClaim = { pid: process.pid, token: "live-claim" };
    writeLock(path.join(dir, ".reclaim"), liveClaim);
    expect(reclaimStaleLock(dir, owner)).toBe("occupied");
    expect(JSON.parse(fs.readFileSync(path.join(dir, ".reclaim", "owner.json"), "utf8"))).toEqual(liveClaim);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8"))).toEqual(owner);
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

  it("treats a stale-claim retirement failure (e.g. Windows EPERM) as occupied", () => {
    // A crashed reclaimer leaves the fixed `.reclaim` marker. Retiring that
    // marker uses an atomic rename inside the canonical slot; Windows can report
    // EPERM/EACCES/EBUSY, which must degrade to contention, never a crash.
    const dir = lockDir();
    const owner = { pid: deadPid(), token: "T1" };
    writeLock(dir, owner);
    writeLock(path.join(dir, ".reclaim"), { pid: deadPid(), token: "claim" });
    const realRename = fs.renameSync;
    fs.renameSync = (() => {
      throw Object.assign(new Error("simulated Windows claim-dir busy"), { code: "EPERM" });
    }) as typeof fs.renameSync;
    try {
      expect(reclaimStaleLock(dir, owner)).toBe("occupied");
    } finally {
      fs.renameSync = realRename;
    }
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, ".reclaim"))).toBe(true);
  });
});
