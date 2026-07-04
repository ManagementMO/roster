#!/usr/bin/env node
/**
 * ratings-math (b): recomputeRatings on seeded synthetic outcome sets in a
 * REAL better-sqlite3 store (built dist). Verifies:
 *   - soft_fail (set by the real retry-with-different-args rule) and explored
 *     rows are excluded from ratings — checked by construction via direct SQL
 *   - per-class weighting: every failure class adds 1 to n and 0 to successes;
 *     failure latencies never enter p50/p95
 *   - wilson_lb / p50 / p95 match a hand-computed table for constructed cases
 *   - latency rounding/clamping at recordOutcome feeds ratings as stored
 *   - category parameter behavior (does it filter by intent_cat?)
 *   - stale-rating persistence when a capability's attributable set empties
 *
 * Run: node docs/lab/exp-ratings-math-b-recompute.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { CoachStore, openCoachDb } = await import(req.resolve("@rosterhq/coach"));

// Independent references (fresh from cited formulas).
function refWilson(s, n, z = 1.96) {
  if (n <= 0) return 0;
  return (2 * s + z * z - z * Math.sqrt(z * z + (4 * s * (n - s)) / n)) / (2 * (n + z * z));
}
// Nearest-rank percentile on ascending values: idx = clamp(ceil(p/100*N)-1, 0, N-1).
function refPercentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

const results = { startedAt: new Date().toISOString(), cases: [] };
const t0 = Date.now();

const db = openCoachDb(":memory:");
const store = new CoachStore(db);

const cap = (id) => ({
  id, kind: "tool", source: id.split("__")[0], name: id.split("__")[1],
  description: `synthetic capability ${id}`, inputSchema: { type: "object" },
});
store.upsertCapabilities(["t__A", "t__B", "t__C", "t__D", "t__E", "t__F", "t__G", "t__H"].map(cap));

let sess = 0;
const uniq = () => `s${++sess}`;
const rec = (capability, outcomeClass, latencyMs, extra = {}) =>
  store.recordOutcome({ session: uniq(), source: "t", capability, outcomeClass, latencyMs, ...extra });

// ── Case A: pure successes; percentile sanity ───────────────────────────────
// 10 successes, latencies 10..100. Hand: n=10 s=10 p50=50 p95=100.
for (let i = 1; i <= 10; i++) rec("t__A", "success", i * 10);

// ── Case B: successes + failures; failure latency must not touch p50/p95 ───
// 3 success (100,200,300) + 2 tool_fail:timeout at latency 5000.
// Hand: n=5 s=3 p50=200 p95=300 (5000 must appear nowhere).
rec("t__B", "success", 100);
rec("t__B", "success", 200);
rec("t__B", "success", 300);
rec("t__B", "tool_fail:timeout", 5000);
rec("t__B", "tool_fail:timeout", 5000);

// ── Case C: explored rows excluded by construction ──────────────────────────
// 4 real successes (10..40) + 6 explored successes + 3 explored fails.
// Hand: n=4 s=4 p50=20 p95=40.
for (let i = 1; i <= 4; i++) rec("t__C", "success", i * 10);
for (let i = 1; i <= 6; i++) rec("t__C", "success", 999, { explored: true });
for (let i = 1; i <= 3; i++) rec("t__C", "tool_fail:internal", 999, { explored: true });

// ── Case D: soft_fail via the REAL retry rule (same session, args change) ──
// o1 success args a1, then o2 success args a2 in same session -> o1 soft_fail.
// Hand: n=1 s=1 p50=p95=70.
const dSession = "sD";
const o1 = store.recordOutcome({ session: dSession, source: "t", capability: "t__D", outcomeClass: "success", latencyMs: 50, argsHash: "a1" });
const o2 = store.recordOutcome({ session: dSession, source: "t", capability: "t__D", outcomeClass: "success", latencyMs: 70, argsHash: "a2" });
const softFlags = db.prepare("SELECT id, soft_fail FROM outcome WHERE capability='t__D' ORDER BY id").all();

// ── Case E: one of every failure class + latency rounding/clamping ─────────
// success 12.6 -> stored 13; success -50 -> stored 0; four failure classes.
// Hand: n=6 s=2, success latencies stored [0,13] -> p50=0 p95=13.
rec("t__E", "success", 12.6);
rec("t__E", "success", -50);
rec("t__E", "hard_fail:transport", 100);
rec("t__E", "hard_fail:protocol", 100);
rec("t__E", "tool_fail:auth", 100);
rec("t__E", "schema_drift_suspect", 100);
const eStored = db.prepare("SELECT class, latency_ms FROM outcome WHERE capability='t__E' ORDER BY id").all();

// ── Non-attributable garbage class via direct SQL (legacy-writer guard) ────
// recordOutcome's types forbid it; a legacy/foreign writer could still insert.
// isAttributable must keep it out of n.
db.prepare(
  `INSERT INTO outcome(ts, session, source, capability, need_hash, args_hash, intent_cat,
     class, latency_ms, soft_fail, substituted, explored, spec_ver)
   VALUES(?, 'sX', 't', 't__A', NULL, NULL, NULL, 'weird_legacy_class', 42, 0, 0, 0, NULL)`,
).run(Date.now());

// ── Case H: category parameter probe ────────────────────────────────────────
// 2 success tagged intentCategory 'web', 8 tool_fail tagged 'files'.
// If category filtered by intent_cat, rating under 'web' would be n=2 s=2.
for (let i = 0; i < 2; i++) rec("t__H", "success", 10, { intentCategory: "web" });
for (let i = 0; i < 8; i++) rec("t__H", "tool_fail:other", 10, { intentCategory: "files" });

// ── Recompute #1 and compare to hand table ──────────────────────────────────
store.recomputeRatings("all");

const expected = {
  t__A: { n: 10, successes: 10, lat: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] },
  t__B: { n: 5, successes: 3, lat: [100, 200, 300] },
  t__C: { n: 4, successes: 4, lat: [10, 20, 30, 40] },
  t__D: { n: 1, successes: 1, lat: [70] },
  t__E: { n: 6, successes: 2, lat: [0, 13] },
};
for (const [id, exp] of Object.entries(expected)) {
  const got = store.getRating(id);
  const want = {
    n: exp.n,
    successes: exp.successes,
    wilsonLb: refWilson(exp.successes, exp.n),
    p50Ms: refPercentile(exp.lat, 50),
    p95Ms: refPercentile(exp.lat, 95),
  };
  results.cases.push({
    id, want, got,
    wilsonAbsDiff: got ? Math.abs(got.wilsonLb - want.wilsonLb) : null,
    pass:
      !!got &&
      got.n === want.n &&
      got.successes === want.successes &&
      Math.abs(got.wilsonLb - want.wilsonLb) < 1e-12 &&
      got.p50Ms === want.p50Ms &&
      got.p95Ms === want.p95Ms,
  });
}
results.capF_noOutcomes_ratingIsNull = store.getRating("t__F") === null;
results.softFailFlagsByConstruction = {
  rows: softFlags, o1, o2,
  o1Flipped: softFlags.find((r) => r.id === o1)?.soft_fail === 1,
  o2Clean: softFlags.find((r) => r.id === o2)?.soft_fail === 0,
};
results.latencyStorageE = eStored;
results.garbageClassExcluded = {
  ratingA_n: store.getRating("t__A")?.n,
  note: "raw SQL row class='weird_legacy_class' latency 42 targeted t__A; n must stay 10",
};

// ── Category probe: recompute under 'web' and read back ────────────────────
store.recomputeRatings("web");
const hWeb = store.getRating("t__H", "web");
const hAll = store.getRating("t__H", "all");
results.categoryProbe = {
  ratingUnderWeb: hWeb,
  ratingUnderAll: hAll,
  ifFilteredWouldBe: { n: 2, successes: 2 },
  globalAggregateIs: { n: 10, successes: 2 },
  categoryParamFilters: hWeb ? hWeb.n === 2 : null,
};
// Side effect check: did recompute('web') also write every OTHER capability's
// global stats under category 'web'?
const webRows = db.prepare("SELECT capability FROM rating WHERE category='web' ORDER BY capability").all();
results.categoryProbe.capabilitiesWrittenUnderWeb = webRows.map((r) => r.capability);

// ── Stale-rating persistence (t__G) ─────────────────────────────────────────
const gSession = "sG";
store.recordOutcome({ session: gSession, source: "t", capability: "t__G", outcomeClass: "success", latencyMs: 33, argsHash: "g1" });
store.recomputeRatings("all");
const gBefore = store.getRating("t__G");
// Explored retry with different args flips the prior row soft_fail; the new
// row is explored -> t__G's attributable set is now EMPTY.
store.recordOutcome({ session: gSession, source: "t", capability: "t__G", outcomeClass: "success", latencyMs: 44, argsHash: "g2", explored: true });
const gFlags = db.prepare("SELECT id, soft_fail, explored FROM outcome WHERE capability='t__G' ORDER BY id").all();
store.recomputeRatings("all");
const gAfter = store.getRating("t__G");
results.staleRating = {
  before: gBefore,
  outcomeFlagsAfterRetry: gFlags,
  attributableRowsNow: db
    .prepare("SELECT COUNT(*) AS c FROM outcome WHERE capability='t__G' AND soft_fail=0 AND explored=0")
    .get().c,
  after: gAfter,
  stalePersists: !!gAfter && gAfter.n === gBefore?.n,
};

results.allCasesPass = results.cases.every((c) => c.pass);
results.elapsedMs = Date.now() - t0;
db.close();

const out = path.join(repo, "docs/lab/tmp-ratings-math/part-b-recompute.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
