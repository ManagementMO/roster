#!/usr/bin/env node
// Aggregates native-qa evidence from every matrix row into one inventory.
//   native-summary.mjs --matrix qa/consumer/native-matrix.json --artifacts <dir> --out <dir>
// <dir> holds one sub-directory per downloaded artifact (native-<row id>/results.json).
// A row without results.json is reported as NO EVIDENCE (never as a pass); the
// exit code is non-zero if any case FAILED or any row produced no evidence.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const matrix = JSON.parse(fs.readFileSync(opt("matrix"), "utf8")).include;
const artifacts = path.resolve(opt("artifacts"));
const out = path.resolve(opt("out", artifacts));
fs.mkdirSync(out, { recursive: true });

const rows = [];
const cases = [];
for (const m of matrix) {
  const dir = path.join(artifacts, `native-${m.id}`);
  const file = path.join(dir, "results.json");
  const launch = path.join(dir, "std-user-launch.json");
  const row = { ...m, evidence: fs.existsSync(file) ? "results.json" : "NO EVIDENCE", counts: {}, env: null, launch: fs.existsSync(launch) ? JSON.parse(fs.readFileSync(launch, "utf8")) : null };
  if (row.evidence === "results.json") {
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    row.env = { os: doc.env.os, arch: doc.env.arch, node: doc.env.node, libuv: doc.env.libuv, npm: doc.env.npm, user: doc.env.privileges?.user, integrity: doc.env.privileges?.integrityLevel ?? null, totalMemGiB: doc.env.totalMemGiB, harnessSha256: doc.env.harnessSha256, fixtureServerSha256: doc.env.fixtureServerSha256, tarballSha256: doc.env.artifact?.sha256 };
    for (const r of doc.results) {
      row.counts[r.status] = (row.counts[r.status] ?? 0) + 1;
      cases.push({ row: m.id, kind: m.kind, id: r.id, status: r.status, severity: r.severity, category: r.category ?? null, durationMs: r.durationMs, actual: r.actual, applicability: r.applicability });
    }
  }
  rows.push(row);
}

const status = (r) => (r.evidence !== "results.json" ? "NO EVIDENCE" : r.counts.FAIL ? "FAIL" : r.counts.BLOCKED ? "PASS+BLOCKED" : "PASS");
const supportedRows = rows.filter((r) => r.kind === "supported" || r.kind === "standard-user");
const summary = {
  generatedAt: new Date().toISOString(),
  rows: rows.map((r) => ({ id: r.id, kind: r.kind, role: r.role, os: r.os, node: r.node, dense: r.dense, verdict: status(r), counts: r.counts, env: r.env, launch: r.launch })),
  totals: cases.reduce((a, c) => { a[c.status] = (a[c.status] ?? 0) + 1; return a; }, {}),
  failures: cases.filter((c) => c.status === "FAIL"),
  blocked: cases.filter((c) => c.status === "BLOCKED"),
  noEvidence: rows.filter((r) => r.evidence !== "results.json").map((r) => r.id),
  supportedPlatformRows: supportedRows.map((r) => `${r.id}: ${status(r)}`),
  negativeControlRows: rows.filter((r) => r.kind === "negative-control").map((r) => `${r.id}: ${status(r)} (a PASS here is a refusal, not supported-platform coverage)`),
};
fs.writeFileSync(path.join(out, "native-summary.json"), JSON.stringify({ ...summary, cases }, null, 2));

const md = [];
md.push("# native-qa summary — public @npmmo/roster@0.0.2", "");
md.push(`Generated ${summary.generatedAt}. Totals: ${JSON.stringify(summary.totals)}. Rows without evidence: ${summary.noEvidence.length}.`, "");
md.push("| row | kind | runner | node (actual) | libuv | npm | user | RAM GiB | verdict | PASS | FAIL | BLOCKED | NOT RUN |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  const e = r.env ?? {};
  md.push(`| ${r.id} | ${r.kind} | ${r.os} | ${e.node ?? "—"} | ${e.libuv ?? "—"} | ${e.npm ?? "—"} | ${e.user ?? "—"}${e.integrity ? ` (${e.integrity.split(" ")[0]})` : ""} | ${e.totalMemGiB ?? "—"} | **${status(r)}** | ${r.counts.PASS ?? 0} | ${r.counts.FAIL ?? 0} | ${r.counts.BLOCKED ?? 0} | ${r.counts["NOT RUN"] ?? 0} |`);
}
md.push("", "## Failures", "");
if (!summary.failures.length) md.push("none");
for (const f of summary.failures) md.push(`- **${f.row}** \`${f.id}\` [${f.severity ?? "?"}]${f.category ? ` (${f.category})` : ""}: ${String(f.actual).split("\n")[0].slice(0, 400)}`);
md.push("", "## Blocked", "");
if (!summary.blocked.length) md.push("none");
for (const b of summary.blocked) md.push(`- **${b.row}** \`${b.id}\`: ${String(b.actual).split("\n")[0].slice(0, 300)}`);
md.push("", "## Rows without evidence (NOT passes)", "");
if (!summary.noEvidence.length) md.push("none");
for (const n of summary.noEvidence) md.push(`- ${n}`);
md.push("", "## Dense inference outcomes (model actually run)", "");
for (const c of cases.filter((c) => c.id === "N-DENSE-inference-auto-model" && c.status !== "NOT RUN")) md.push(`- ${c.row}: ${c.status}${c.category ? ` (${c.category})` : ""} — ${String(c.actual).split("\n")[0].slice(0, 300)}`);
md.push("", "## Per-case matrix", "", "| case | " + rows.map((r) => r.id).join(" | ") + " |", "|---|" + rows.map(() => "---").join("|") + "|");
const ids = [...new Set(cases.map((c) => c.id))];
const abbrev = { PASS: "P", FAIL: "**F**", BLOCKED: "B", "NOT RUN": "·" };
for (const id of ids) md.push(`| ${id} | ${rows.map((r) => { const c = cases.find((x) => x.row === r.id && x.id === id); return c ? abbrev[c.status] ?? c.status : "∅"; }).join(" | ")} |`);
md.push("", "Legend: P PASS · F FAIL · B BLOCKED · `·` NOT RUN (not applicable / not requested) · ∅ no evidence. Negative-control rows only ever PASS by refusing before mutation.");
fs.writeFileSync(path.join(out, "native-summary.md"), md.join("\n"));
process.stdout.write(md.join("\n") + "\n");
process.exit(summary.failures.length || summary.noEvidence.length ? 1 : 0);
