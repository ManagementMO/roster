// (e) TIMEOUT / MISBEHAVING SERVER: a server that hangs must not hang the suite.
//  (1) hang-on-connect  → runner CONNECT_TIMEOUT (15s) fires → classified
//      "transport"/"connect timeout"; runSuite still returns.
//  (2) hang-on-call     → per-task tool timeout (task.timeoutMs) fires →
//      classified "invoke"; runSuite still returns.
// Also: confirm the runner KILLS the spawned child on completion (no orphan).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSuite, TMP, ensureTmp, nowTag, repo } from "./exp-combine-adversarial-lib.mjs";

ensureTmp();
const here = path.dirname(fileURLToPath(import.meta.url));
const HANG_CONNECT = path.join(here, "exp-combine-adversarial-fixture-hang-connect.mjs");
const HANG_CALL = path.join(here, "exp-combine-adversarial-fixture-hang-call.mjs");
const combinePkg = path.join(repo, "packages/combine/package.json");

const out = { experiment: "e-timeout", startedAt: nowTag(), cases: [], summary: {} };

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function waitDead(pid, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !alive(pid);
}

// ---- case 1: hang on connect ----
{
  const pidFile = path.join(TMP, "hang-connect.pid");
  fs.rmSync(pidFile, { force: true });
  const suite = { suite: "adv-timeout", version: "0", category: "filesystem", tasks: [{
    id: "connect-hang", category: "filesystem", mode: "sandboxed", signed: false,
    invoke: { tool: "noop", args: {} }, verify: [{ kind: "resultContains", contains: "x" }], timeoutMs: 30000,
  }] };
  const t0 = Date.now();
  const run = await runSuite(suite, { name: "hang-connect", command: process.execPath, args: [HANG_CONNECT, pidFile] });
  const elapsed = Date.now() - t0;
  const r = run.results[0];
  const childPid = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, "utf8")) : null;
  const killed = childPid ? await waitDead(childPid) : null;
  out.cases.push({
    name: "hang-on-connect", elapsedMs: elapsed, suiteReturned: true,
    pass: r.pass, stage: r.stage, detail: r.detail, childPid, childKilled: killed,
    expected: { stage: "transport", detailContains: "connect timeout", elapsedNear: 15000 },
    classifiedAsDesigned: r.pass === false && r.stage === "transport" && /connect timeout/i.test(r.detail ?? ""),
  });
  console.log(`case1 hang-on-connect: ${elapsed}ms · stage=${r.stage} detail=${r.detail} · child ${childPid} killed=${killed}`);
}

// ---- case 2: hang on call (fast per-task timeout) ----
{
  const pidFile = path.join(TMP, "hang-call.pid");
  fs.rmSync(pidFile, { force: true });
  const suite = { suite: "adv-timeout", version: "0", category: "filesystem", tasks: [{
    id: "call-hang", category: "filesystem", mode: "sandboxed", signed: false,
    invoke: { tool: "slow_op", args: {} }, verify: [{ kind: "resultContains", contains: "x" }], timeoutMs: 2500,
  }] };
  const t0 = Date.now();
  const run = await runSuite(suite, {
    name: "hang-call", command: process.execPath, args: [HANG_CALL, combinePkg, pidFile],
  });
  const elapsed = Date.now() - t0;
  const r = run.results[0];
  const childPid = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, "utf8")) : null;
  const killed = childPid ? await waitDead(childPid) : null;
  out.cases.push({
    name: "hang-on-call", elapsedMs: elapsed, suiteReturned: true,
    pass: r.pass, stage: r.stage, detail: r.detail, childPid, childKilled: killed,
    expected: { stage: "invoke", elapsedNear: 2500 },
    classifiedAsDesigned: r.pass === false && r.stage === "invoke",
  });
  console.log(`case2 hang-on-call: ${elapsed}ms · stage=${r.stage} detail=${r.detail} · child ${childPid} killed=${killed}`);
}

out.summary = {
  bothSuitesReturned: out.cases.every((c) => c.suiteReturned),
  bothClassifiedAsDesigned: out.cases.every((c) => c.classifiedAsDesigned),
  bothChildrenKilled: out.cases.every((c) => c.childKilled === true),
  verdict: out.cases.every((c) => c.classifiedAsDesigned && c.childKilled)
    ? "TIMEOUTS HANDLED — hangs classified per design; suite completes; children reaped"
    : "TIMEOUT ISSUE — see cases",
};
out.finishedAt = nowTag();
const outPath = path.join(TMP, "e-timeout.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\nboth classified as designed: ${out.summary.bothClassifiedAsDesigned}`);
console.log(`both children killed: ${out.summary.bothChildrenKilled}`);
console.log(`→ ${outPath}`);
