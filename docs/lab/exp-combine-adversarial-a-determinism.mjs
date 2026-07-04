// (a) DETERMINISM: run suites/filesystem 3x against the REAL npx filesystem
// server. Field-level diff of lab-results modulo timing. Also checks that the
// environmentDigest is stable (it is derived from env+suite versions, so it
// MUST be identical run-to-run on one machine) and that generatedAt is the only
// intentionally-volatile field besides latencyMs.
import fs from "node:fs";
import path from "node:path";
import {
  parseSuite, runSuite, buildLabResults, SUITE_YAML, REAL_FS_SERVER, TMP, ensureTmp, stripVolatile, nowTag,
} from "./exp-combine-adversarial-lib.mjs";

ensureTmp();
const N = 3;
const out = { experiment: "a-determinism", startedAt: nowTag(), server: REAL_FS_SERVER, N, runs: [], labMeta: [], analysis: {} };

const suite = parseSuite(SUITE_YAML);
console.log(`suite: ${suite.suite}@${suite.version} — ${suite.tasks.length} tasks, ${N} repetitions vs REAL filesystem server`);

const stableProjections = [];
for (let i = 0; i < N; i++) {
  const t0 = Date.now();
  const run = await runSuite(suite, REAL_FS_SERVER);
  const lab = buildLabResults([run]);
  const elapsed = Date.now() - t0;
  const stable = stripVolatile(run);
  stableProjections.push(stable);
  const passes = run.results.filter((r) => r.pass).length;
  out.runs.push({ rep: i, elapsedMs: elapsed, results: run.results, summary: lab.runs[0].summary });
  out.labMeta.push({ rep: i, environmentDigest: lab.environmentDigest, generatedAt: lab.generatedAt, environment: lab.environment });
  console.log(`  rep ${i}: ${passes}/${run.results.length} pass in ${elapsed}ms · digest ${lab.environmentDigest.slice(0, 12)}…`);
}

// Field-level diff across reps (ignoring latencyMs which stripVolatile removed).
const ref = JSON.stringify(stableProjections[0]);
const identical = stableProjections.every((p) => JSON.stringify(p) === ref);
const digests = out.labMeta.map((m) => m.environmentDigest);
const digestStable = digests.every((d) => d === digests[0]);
const generatedAts = out.labMeta.map((m) => m.generatedAt);
const generatedAtVaries = new Set(generatedAts).size > 1;

// Per-field diff report: for each task, which non-timing fields ever differed.
const perTaskFieldDiffs = [];
const taskIds = stableProjections[0].map((r) => r.taskId);
for (let ti = 0; ti < taskIds.length; ti++) {
  const across = stableProjections.map((p) => p[ti]);
  const fields = ["taskId", "signed", "pass", "stage", "detail"];
  const diffs = {};
  for (const f of fields) {
    const vals = across.map((r) => JSON.stringify(r[f]));
    if (new Set(vals).size > 1) diffs[f] = vals;
  }
  if (Object.keys(diffs).length) perTaskFieldDiffs.push({ taskId: taskIds[ti], diffs });
}

// Latency spread (informational only — allowed to vary).
const latencyByTask = {};
for (const t of taskIds) {
  const ls = out.runs.map((r) => r.results.find((x) => x.taskId === t).latencyMs);
  latencyByTask[t] = { min: Math.min(...ls), max: Math.max(...ls), values: ls };
}

out.analysis = {
  identicalModuloTiming: identical,
  digestStableAcrossReps: digestStable,
  digest: digests[0],
  generatedAtVaries,
  generatedAts,
  perTaskFieldDiffs,
  latencyByTask,
  verdict: identical && digestStable
    ? "DETERMINISTIC: pass/stage/detail/signed identical across reps; digest stable; only latencyMs+generatedAt vary"
    : "NON-DETERMINISTIC: see perTaskFieldDiffs / digest",
};
out.finishedAt = nowTag();

const outPath = path.join(TMP, "a-determinism.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\nidentical modulo timing: ${identical}`);
console.log(`digest stable: ${digestStable} (${digests[0].slice(0, 16)}…)`);
console.log(`generatedAt varies: ${generatedAtVaries}`);
console.log(`per-task field diffs: ${perTaskFieldDiffs.length === 0 ? "NONE" : JSON.stringify(perTaskFieldDiffs)}`);
console.log(`→ ${outPath}`);
