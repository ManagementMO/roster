/**
 * Crash-injection child (used by exp-sync-eject-fuzz-d.mjs via subprocess).
 * CRASH_AFTER=k + CRASH_STYLE=exit  -> process.exit(9) INSTEAD of performing op k
 *   (true SIGKILL semantics: nothing can catch it; op k never happens).
 *   TORN=1: half of op k's bytes land first (kill mid-write).
 * CRASH_STYLE=throw -> throw an Error at op k (fs-error injection: measures how
 *   the CLI handles a failing fs call, e.g. ENOSPC — CAN be caught by the CLI).
 * Op log is written to $OPLOG via the real writeFileSync before exiting.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const K = Number(process.env.CRASH_AFTER ?? "999");
const TORN = process.env.TORN === "1";
const STYLE = process.env.CRASH_STYLE ?? "exit";
const MODE = process.env.MODE ?? "sync";
const repo = process.env.REPO;
const OPLOG = process.env.OPLOG;

let n = 0;
const opLog = [];
const real = { writeFileSync: fs.writeFileSync, renameSync: fs.renameSync, mkdirSync: fs.mkdirSync };
const flush = () => { if (OPLOG) real.writeFileSync(OPLOG, JSON.stringify(opLog)); };
function arm(name) {
  fs[name] = (...args) => {
    n++;
    const target = typeof args[0] === "string" ? path.basename(args[0]) : String(args[0]);
    opLog.push(`${name}(${target}${name === "renameSync" ? ` -> ${path.basename(String(args[1]))}` : ""})`);
    if (n === K) {
      if (TORN && name === "writeFileSync") {
        const data = args[1];
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
        real.writeFileSync(args[0], buf.subarray(0, Math.floor(buf.length / 2)));
      }
      if (STYLE === "exit") { flush(); process.exit(9); }
      throw new Error(`injected fs failure at op ${n}: ${opLog[opLog.length - 1]}`);
    }
    return real[name](...args);
  };
}
arm("writeFileSync"); arm("renameSync"); arm("mkdirSync");

const cli = await import(createRequire(path.join(repo, "packages/cli/package.json")).resolve("@rosterhq/cli"));

let outcome;
try {
  const res = MODE === "sync"
    ? cli.syncClient("claude-code", new Date(process.env.SYNC_TS ?? "2026-07-04T12:00:00.000Z"))
    : cli.ejectClient("claude-code", { force: process.env.FORCE === "1" });
  outcome = { completed: true, action: res.action, imported: res.imported, ops: n, opLog };
} catch (err) {
  outcome = { completed: false, err: String(err.message).slice(0, 140), ops: n, opLog };
}
flush();
process.stdout.write(`${JSON.stringify(outcome)}\n`);
process.exit(outcome.completed ? 0 : 8);
