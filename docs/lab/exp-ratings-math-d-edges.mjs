#!/usr/bin/env node
/**
 * ratings-math (d): percentile + latencyBucket edge behavior on the built dist.
 * percentile: empty, single element, all-ties, exact-boundary p values,
 * out-of-contract p, unsorted-input contract trust; cross-checked against an
 * independent nearest-rank reference. latencyBucket: every boundary value,
 * negatives, NaN, +/-Infinity.
 *
 * Run: node docs/lab/exp-ratings-math-d-edges.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { percentile, latencyBucket } = await import(req.resolve("@rosterhq/shared"));

// Independent nearest-rank reference (Wikipedia nearest-rank method):
// rank = ceil(p/100 * N), 1-based; clamped into [1, N].
function refNearestRank(sortedAsc, p) {
  const N = sortedAsc.length;
  if (N === 0) return null;
  const rank = Math.min(N, Math.max(1, Math.ceil((p / 100) * N)));
  return sortedAsc[rank - 1];
}

const results = { startedAt: new Date().toISOString() };
const t0 = Date.now();

// ── percentile: charter edges ────────────────────────────────────────────────
const ps = [0, 1, 25, 50, 75, 90, 95, 99, 100];
results.percentileEmpty = Object.fromEntries(ps.map((p) => [p, percentile([], p)]));
results.percentileSingle = Object.fromEntries(ps.map((p) => [p, percentile([7], p)]));
results.percentileAllTies = Object.fromEntries(ps.map((p) => [p, percentile([5, 5, 5, 5], p)]));

// Cross-check vs independent nearest-rank over lengths 1..12 x the p grid,
// arrays [1..N] so value === 1-based rank (any mismatch is directly readable).
let crossChecks = 0, crossMismatches = [], maxLen = 12;
for (let N = 1; N <= maxLen; N++) {
  const arr = Array.from({ length: N }, (_, i) => i + 1);
  for (const p of ps) {
    const got = percentile(arr, p);
    const want = refNearestRank(arr, p);
    crossChecks++;
    if (got !== want) crossMismatches.push({ N, p, got, want });
  }
}
results.percentileCrossCheck = { checks: crossChecks, mismatches: crossMismatches };

// Exact-boundary p values: p/100*N lands exactly on an integer rank.
// N=4: p=25 -> rank 1, p=50 -> rank 2, p=75 -> rank 3, p=100 -> rank 4.
const arr4 = [10, 20, 30, 40];
results.percentileExactBoundariesN4 = {
  p25: percentile(arr4, 25),
  p50: percentile(arr4, 50),
  p75: percentile(arr4, 75),
  p100: percentile(arr4, 100),
  expected: { p25: 10, p50: 20, p75: 30, p100: 40 },
};
// N=2 median convention: nearest-rank gives the LOWER element (not 1.5-style interpolation).
results.percentileMedianOfTwo = { input: [1, 2], p50: percentile([1, 2], 50) };
// N=20 p95 -> rank 19 exactly (0.95*20=19).
results.percentileP95N20 = {
  got: percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95),
  expected: 19,
};

// Out-of-contract probes (observed behavior, not judged):
results.percentileOutOfContract = {
  pNegative: percentile([1, 2, 3], -10),
  pOver100: percentile([1, 2, 3], 150),
  pNaN: percentile([1, 2, 3], NaN),
  unsortedInput: percentile([3, 1, 2], 50), // contract says sortedAscending; shows trust
};

// ── latencyBucket: every boundary and hostile input ─────────────────────────
const probes = [-5, 0, 1, 249, 249.999, 250, 250.0001, 999, 999.999, 1000, 1000.5,
  3999, 3999.999, 4000, 4000.0001, 1e9, Infinity, -Infinity, NaN];
results.latencyBucket = probes.map((ms) => ({ ms: String(ms), bucket: latencyBucket(ms) }));
// Left-closed/right-open expectation table for the finite probes:
const expectBucket = (ms) => (ms < 250 ? "<250" : ms < 1000 ? "250-1000" : ms < 4000 ? "1000-4000" : ">4000");
results.latencyBucketFiniteMismatches = probes
  .filter((ms) => Number.isFinite(ms))
  .map((ms) => ({ ms, got: latencyBucket(ms), want: expectBucket(ms) }))
  .filter((r) => r.got !== r.want);
results.latencyBucketLabelNote = {
  exactly4000: latencyBucket(4000),
  labelSaysStrictlyGreater: true,
  exactly250: latencyBucket(250),
  exactly1000: latencyBucket(1000),
};
results.latencyBucketNaN = latencyBucket(NaN);

results.elapsedMs = Date.now() - t0;
const out = path.join(repo, "docs/lab/tmp-ratings-math/part-d-edges.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
