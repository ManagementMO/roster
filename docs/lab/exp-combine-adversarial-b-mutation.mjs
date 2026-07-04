// (b) MUTATION-TEST the 8 tasks' verifiers through the REAL runner + REAL npx
// filesystem server. Strategy: keep each task's REAL verify[] (real verifier +
// real expected values, same run_id), but sabotage the INVOKE/SETUP so the
// produced end-state is wrong. Every sabotage MUST fail. Any pass = false-pass.
//
// This exercises the real checkVerifier (not a re-implementation) because
// runSuite -> runTask -> checkVerifier is the only path, and it runs the real
// server to produce the (sabotaged) end state.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseSuite, runSuite, SUITE_YAML, REAL_FS_SERVER, TMP, ensureTmp, nowTag,
} from "./exp-combine-adversarial-lib.mjs";

ensureTmp();
const suite = parseSuite(SUITE_YAML);
const byId = Object.fromEntries(suite.tasks.map((t) => [t.id, t]));
const clone = (t) => JSON.parse(JSON.stringify(t));
const mutantSuite = (task) => ({ suite: suite.suite, version: suite.version, category: suite.category, tasks: [task] });

// A fixed decoy allowed-dir OUTSIDE any task sandbox, for the list-allowed mutation.
const decoyRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "roster-decoy-allowed-")));

// Each mutant: keep verify[] intact; mutate invoke/setup (and optionally server).
// expectFail is ALWAYS true — these are sabotages.
const mutants = [];
const add = (baseId, label, note, mutate, server) => mutants.push({ baseId, label, note, mutate, server });

// ---- fs.write-file.v1 : fileEquals(combine-{run}.txt, "roster combine {run}")
add("fs.write-file.v1", "wrong-content", "server writes different bytes", (t) => {
  t.invoke.args.content = "WRONG {{run_id}}"; return t;
});
add("fs.write-file.v1", "missing-file", "server writes to a decoy name; expected file never created", (t) => {
  t.invoke.args.path = "{{sandbox}}/decoy-{{run_id}}.txt"; return t;
});
add("fs.write-file.v1", "right-content-wrong-path", "correct bytes, wrong filename", (t) => {
  t.invoke.args.path = "{{sandbox}}/moved-{{run_id}}.txt"; return t;
});
add("fs.write-file.v1", "case-flipped-filename", "correct bytes at case-variant name (combine->COMBINE, .txt->.TXT)", (t) => {
  t.invoke.args.path = "{{sandbox}}/COMBINE-{{run_id}}.TXT"; return t;
});
add("fs.write-file.v1", "trailing-newline-delta", "correct bytes + one trailing \\n", (t) => {
  t.invoke.args.content = "roster combine {{run_id}}\n"; return t;
});
add("fs.write-file.v1", "unicode-nfd-filename", "correct bytes at NFD-normalized name", (t) => {
  // combine -> combiné (NFC e-acute in invoke); verifier uses same base but we
  // flip normalization to test path-equivalence false-pass. Use a name that
  // differs only by unicode normalization form of an accented char.
  t.invoke.args.path = "{{sandbox}}/café-{{run_id}}.txt"; // NFD
  t.verify = [{ kind: "fileEquals", path: "café-{{run_id}}.txt", equals: "roster combine {{run_id}}" }]; // NFC
  t.invoke.args.content = "roster combine {{run_id}}";
  return t;
});

// ---- fs.read-text-file.v1 : resultContains("needle-{run}")
add("fs.read-text-file.v1", "wrong-content", "seeded file has different content", (t) => {
  t.setup.files = { "seeded-{{run_id}}.txt": "HAYSTACK-{{run_id}}" }; return t;
});
add("fs.read-text-file.v1", "missing-file", "no seed; read errors (tool isError must not pass)", (t) => {
  delete t.setup; return t;
});

// ---- fs.create-directory.v1 : fileExists(newdir-{run})
add("fs.create-directory.v1", "missing", "creates a different dir; expected dir absent", (t) => {
  t.invoke.args.path = "{{sandbox}}/otherdir-{{run_id}}"; return t;
});
add("fs.create-directory.v1", "case-flipped", "creates case-variant dir name (NEWDIR)", (t) => {
  t.invoke.args.path = "{{sandbox}}/NEWDIR-{{run_id}}"; return t;
});
add("fs.create-directory.v1", "wrong-type-file", "creates a FILE named newdir instead of a directory", (t) => {
  t.invoke = { tool: "write_file", args: { path: "{{sandbox}}/newdir-{{run_id}}", content: "not a dir" } }; return t;
});

// ---- fs.list-directory.v1 : resultContains("alpha-{run}.md")
add("fs.list-directory.v1", "wrong-content", "seeds a differently-named file; listing lacks alpha", (t) => {
  t.setup.files = { "listing/beta-{{run_id}}.md": "x" }; return t;
});
add("fs.list-directory.v1", "missing-dir", "no listing dir; list errors", (t) => {
  delete t.setup; return t;
});

// ---- fs.move-file.v1 : fileAbsent(src) + fileEquals(dst,"move me")
add("fs.move-file.v1", "src-not-removed", "copy-like: read src (leaves it); dst never made -> fileAbsent(src) must fail", (t) => {
  t.invoke = { tool: "read_text_file", args: { path: "{{sandbox}}/src-{{run_id}}.txt" } }; return t;
});
add("fs.move-file.v1", "dst-wrong-path", "moves src to a different dst -> fileEquals(dst) must fail", (t) => {
  t.invoke.args.destination = "{{sandbox}}/elsewhere-{{run_id}}.txt"; return t;
});

// ---- fs.get-file-info.v1 : resultContains("size")
add("fs.get-file-info.v1", "missing-file", "no seed; get_file_info errors", (t) => {
  delete t.setup; return t;
});

// ---- fs.search-files.v1 : resultContains("unique-{run}.log")
add("fs.search-files.v1", "wrong-content", "seed a differently-named file; search finds nothing", (t) => {
  t.setup.files = { "deep/haystack/common-{{run_id}}.log": "z" }; return t;
});

// ---- fs.list-allowed.v1 : resultContains("{{sandbox}}")
add("fs.list-allowed.v1", "wrong-allowed-root", "server rooted at a DECOY dir; result won't contain {{sandbox}}",
  (t) => t,
  { name: "filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", decoyRoot] });

// ---- Also assert every ORIGINAL task PASSES (baseline), so a mutant's FAIL is
// attributable to the sabotage, not a broken task.
const out = { experiment: "b-mutation", startedAt: nowTag(), fsCaseInsensitive: true, baseline: [], mutants: [], summary: {} };

console.log("== baseline (each original task must PASS) ==");
for (const t of suite.tasks) {
  const run = await runSuite(mutantSuite(clone(t)), REAL_FS_SERVER);
  const r = run.results[0];
  out.baseline.push({ taskId: t.id, pass: r.pass, stage: r.stage, detail: r.detail });
  console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${t.id}${r.detail ? ` (${r.stage}: ${r.detail})` : ""}`);
}

console.log("\n== mutants (each MUST FAIL; a PASS = false-pass) ==");
let falsePasses = 0;
for (const m of mutants) {
  const base = byId[m.baseId];
  if (!base) { console.log(`  ?? unknown base ${m.baseId}`); continue; }
  const task = m.mutate(clone(base));
  const run = await runSuite(mutantSuite(task), m.server ?? REAL_FS_SERVER);
  const r = run.results[0];
  const falsePass = r.pass === true;
  if (falsePass) falsePasses++;
  out.mutants.push({
    baseId: m.baseId, label: m.label, note: m.note,
    expectedFail: true, actualPass: r.pass, stage: r.stage, detail: r.detail,
    falsePass,
  });
  console.log(`  ${falsePass ? "❌FALSE-PASS" : "ok-fails  "}  ${m.baseId} :: ${m.label}${r.detail ? ` (${r.stage}: ${r.detail})` : r.pass ? " (PASSED!)" : ""}`);
}

fs.rmSync(decoyRoot, { recursive: true, force: true });

const baselineAllPass = out.baseline.every((b) => b.pass);
out.summary = {
  baselineAllPass,
  mutantsTotal: mutants.length,
  falsePasses,
  falsePassLabels: out.mutants.filter((m) => m.falsePass).map((m) => `${m.baseId}::${m.label}`),
  verdict: falsePasses === 0
    ? "ALL SABOTAGES CAUGHT — no false-pass"
    : `${falsePasses} FALSE-PASS(es) — verifier accepted a sabotaged end-state`,
};
out.finishedAt = nowTag();
const outPath = path.join(TMP, "b-mutation.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\nbaseline all pass: ${baselineAllPass}`);
console.log(`false-passes: ${falsePasses} / ${mutants.length}`);
if (falsePasses) console.log(`  ${out.summary.falsePassLabels.join("\n  ")}`);
console.log(`→ ${outPath}`);
