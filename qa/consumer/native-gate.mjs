#!/usr/bin/env node
// Fail-closed verdict for ONE native-qa row.
//   native-gate.mjs --results <results.json> --expected-sha256 <hex> --kind supported|standard-user|negative-control
//                   --node-label <v> [--dense] [--cases qa/consumer/native-cases.json] [--harness-exit <n>]
// Exit 0 only when: the harness finished (finishedAt + finished marker) and exited 0, the tested
// artifact is the exact expected digest, the actual Node equals the requested label, the row's
// privilege/mode facts match its kind, and EVERY case in native-cases.json is present exactly once
// with a justified status (see that file). Also usable as a module: import { gateRow }.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function gateRow(doc, row, casesDoc) {
  const problems = [];
  const env = doc.env ?? {};
  const results = Array.isArray(doc.results) ? doc.results : [];
  const platform = env.platform;
  if (env.finished !== true || !env.finishedAt) problems.push("harness did not reach its finished marker (crashed / killed / partial)");
  if (row.harnessExit !== undefined && row.harnessExit !== 0) problems.push(`harness process exit ${row.harnessExit}`);
  if ((env.artifact?.sha256 ?? "").toLowerCase() !== row.expectedSha256.toLowerCase()) problems.push(`tested artifact sha256 ${env.artifact?.sha256} != ${row.expectedSha256}`);
  if (env.artifact?.package !== "@npmmo/roster@0.0.2") problems.push(`unexpected package spec ${env.artifact?.package}`);
  if (row.nodeLabel && env.node !== `v${row.nodeLabel}`) problems.push(`actual node ${env.node} != requested ${row.nodeLabel}`);
  const expectMode = row.kind === "negative-control" ? "negative-control" : "supported";
  if (env.mode !== expectMode) problems.push(`harness mode ${env.mode} != ${expectMode}`);
  if (row.kind === "standard-user") {
    if (env.expectStandardUser !== true) problems.push("standard-user row was not run with --expect-standard-user");
    if (env.privileges?.standardUser !== true) problems.push(`process token is not a standard user: ${JSON.stringify(env.privileges)}`);
  }
  if (row.kind === "negative-control" && platform !== "win32") problems.push("negative controls are Windows-only by product contract");
  if (env.dense !== Boolean(row.dense)) problems.push(`harness dense=${env.dense} != row dense=${Boolean(row.dense)}`);

  const seen = new Map();
  for (const r of results) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  const known = new Set(casesDoc.cases.map((c) => c.id));
  for (const [id, n] of seen) { if (!known.has(id)) problems.push(`unexpected case ${id} (inventory drift)`); if (n > 1) problems.push(`case ${id} recorded ${n} times`); }
  const d = casesDoc.defaults;
  const perCase = [];
  for (const c of casesDoc.cases) {
    const r = results.find((x) => x.id === c.id);
    const applies = (c.platform ?? d.platform).includes(platform) && (c.kind ?? d.kind).includes(row.kind) && (c.dense ?? d.dense).includes(Boolean(row.dense));
    let verdict = "ok";
    if (!r) verdict = `MISSING (${applies ? "applicable" : "expected NOT RUN"})`;
    else if (r.status === "PASS") verdict = applies ? "ok" : "PASS recorded for an inapplicable case (rule drift)";
    else if (r.status === "NOT RUN") {
      if (!applies) verdict = "ok";
      else if (c.notRunIf === "root" && env.privileges?.root === true) verdict = "ok";
      else verdict = `NOT RUN but applicable: ${String(r.actual).split("\n")[0].slice(0, 200)}`;
    } else if (r.status === "BLOCKED") {
      if (applies && c.blockedIf && new RegExp(c.blockedIf).test(String(r.actual))) verdict = "ok";
      else verdict = `BLOCKED not covered by an enumerated upstream limit: ${String(r.actual).split("\n")[0].slice(0, 200)}`;
    } else verdict = `${r.status}: ${String(r.actual).split("\n")[0].slice(0, 300)}`;
    if (r && r.category === "observation" && !c.observationAllowed) verdict = `observation category not allowed for ${c.id}`;
    perCase.push({ id: c.id, applies, status: r?.status ?? "MISSING", category: r?.category ?? null, verdict });
    if (verdict !== "ok") problems.push(`${c.id}: ${verdict}`);
  }
  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  return { ok: problems.length === 0, problems, counts, perCase, supportedCoverage: row.kind !== "negative-control" && problems.length === 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : def; };
  const casesDoc = JSON.parse(fs.readFileSync(opt("cases", path.join(HERE, "native-cases.json")), "utf8"));
  const file = opt("results");
  if (!file || !fs.existsSync(file)) { console.error(`GATE FAIL: no results.json at ${file}`); process.exit(1); }
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const row = { kind: opt("kind", "supported"), dense: args.includes("--dense"), expectedSha256: opt("expected-sha256", ""), nodeLabel: opt("node-label"), harnessExit: opt("harness-exit") !== undefined ? Number(opt("harness-exit")) : undefined };
  const g = gateRow(doc, row, casesDoc);
  console.log(`cases: ${JSON.stringify(g.counts)}`);
  for (const p of g.perCase) console.log(`${p.status.padEnd(8)} ${p.applies ? "applicable  " : "n/a         "} ${p.id}${p.category ? ` [${p.category}]` : ""}${p.verdict === "ok" ? "" : `  <-- ${p.verdict}`}`);
  if (g.ok) { console.log(`GATE PASS (${row.kind}${row.kind === "negative-control" ? ": refusal only, not supported-platform coverage" : ""})`); process.exit(0); }
  console.error(`GATE FAIL (${g.problems.length} problem${g.problems.length === 1 ? "" : "s"}):`);
  for (const p of g.problems) console.error(`  - ${p}`);
  process.exit(1);
}
