import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reclaimStaleLock, withFileLockSync } from "./lock.js";

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

  it("fails closed on corrupt/missing owner metadata (waits out the timeout, never steals)", () => {
    const dir = lockDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir, "owner.json"), "{ not json", { mode: 0o600 });
    // Unreadable ownership ⇒ acquire cannot prove the holder dead ⇒ it must time
    // out rather than reclaim. (5s lock timeout; generous outer bound.)
    const started = Date.now();
    expect(() => withFileLockSync("k", () => 0)).toThrow(/timed out waiting for Roster lock/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4_500);
  }, 15_000);

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
      const require_ = createRequire(${JSON.stringify(req)});
      const { withFileLockSync } = await import(require_.resolve("./dist/lock.js"));
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
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    const outs = kids.map(() => "");
    kids.forEach((k, i) => {
      k.stdout.on("data", (d: Buffer) => {
        outs[i] += d.toString();
      });
    });
    fs.writeFileSync(go, "go"); // release the barrier
    const codes = kids.map(
      (k) =>
        new Promise<number>((resolve) => k.on("exit", (c: number | null) => resolve(c ?? -1))),
    );
    return Promise.all(codes).then((exitCodes) => {
      expect(exitCodes.every((c) => c === 0)).toBe(true);
      // Each worker reports the max concurrent occupancy it ever observed. With a
      // correct mutex that is exactly 1; the pre-fix double-entry made it >= 2.
      for (const out of outs) expect(Number(out)).toBe(1);
    });
  }, 30_000);
});
