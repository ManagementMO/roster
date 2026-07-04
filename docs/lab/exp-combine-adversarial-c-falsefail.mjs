// (c) FALSE-FAIL HUNT: 3+ clean re-runs of the full suite with different tmp
// path lengths / nesting depths. The runner builds its per-task sandbox under
// os.tmpdir(), which honors TMPDIR at call-time on POSIX. We vary TMPDIR to
// stress path length (arg length, PATH_MAX) and nesting, and confirm NO task
// flakes to a false failure.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseSuite, runSuite, SUITE_YAML, REAL_FS_SERVER, TMP, ensureTmp, nowTag,
} from "./exp-combine-adversarial-lib.mjs";

ensureTmp();
const suite = parseSuite(SUITE_YAML);
const origTmp = os.tmpdir();
const out = { experiment: "c-falsefail", startedAt: nowTag(), origTmpdir: origTmp, scenarios: [], summary: {} };

// Build several TMPDIR roots of varying length/nesting under the OS tmp.
function mkRoot(label, builder) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(origTmp, "roster-ff-")));
  const root = builder(base);
  fs.mkdirSync(root, { recursive: true });
  return { label, root, len: root.length, cleanup: base };
}
const scenarios = [
  mkRoot("default", () => origTmp),                       // baseline: unchanged
  mkRoot("short", (b) => b),                              // shallow
  mkRoot("deep-nested", (b) => path.join(b, "a", "b", "c", "d", "e", "f", "g", "h")),
  mkRoot("very-long-segment", (b) => path.join(b, "x".repeat(120))),
  mkRoot("long-and-deep", (b) => path.join(b, "seg-".repeat(1) + "y".repeat(40), "z".repeat(40), "w".repeat(40))),
];

const cleanups = new Set();
for (const sc of scenarios) {
  if (sc.cleanup && sc.root !== origTmp) cleanups.add(sc.cleanup);
  process.env.TMPDIR = sc.root;                            // os.tmpdir() reads this per call on POSIX
  const observedTmp = os.tmpdir();
  const t0 = Date.now();
  let results, err = null;
  try {
    const run = await runSuite(suite, REAL_FS_SERVER);
    results = run.results;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
    results = [];
  }
  const elapsed = Date.now() - t0;
  const passes = results.filter((r) => r.pass).length;
  const fails = results.filter((r) => !r.pass);
  out.scenarios.push({
    label: sc.label, tmpdirRoot: sc.root, tmpdirLen: sc.len, observedTmp,
    elapsedMs: elapsed, n: results.length, passes,
    allPass: results.length === suite.tasks.length && passes === results.length,
    failures: fails.map((f) => ({ taskId: f.taskId, stage: f.stage, detail: f.detail })),
    error: err,
  });
  console.log(`  ${sc.label} (len ${sc.len}): ${passes}/${results.length} pass in ${elapsed}ms` +
    (fails.length ? `  FAILS: ${fails.map((f) => `${f.taskId}[${f.stage}:${f.detail}]`).join(", ")}` : "") +
    (err ? `  ERR: ${err}` : ""));
}
process.env.TMPDIR = origTmp; // restore

const anyFalseFail = out.scenarios.some((s) => !s.allPass);
out.summary = {
  scenarios: out.scenarios.length,
  allScenariosClean: !anyFalseFail,
  verdict: anyFalseFail
    ? "FALSE-FAIL(s) observed under some tmp path shape — see scenarios[].failures"
    : "NO FALSE-FAILS across path lengths/nesting; suite fully passes each shape",
};
out.finishedAt = nowTag();

// cleanup our scenario roots (not the OS tmp)
for (const c of cleanups) fs.rmSync(c, { recursive: true, force: true });

const outPath = path.join(TMP, "c-falsefail.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\nall scenarios clean: ${!anyFalseFail}`);
console.log(`→ ${outPath}`);
