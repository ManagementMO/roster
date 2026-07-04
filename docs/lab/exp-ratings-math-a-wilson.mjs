#!/usr/bin/env node
/**
 * ratings-math (a): wilsonLowerBound property-tested against an independent
 * reference implementation of the Evan Miller formula, on the BUILT dist.
 *
 * Reference is the algebraically equivalent closed form
 *   LB = (2s + z^2 - z*sqrt(z^2 + 4*s*(n-s)/n)) / (2*(n + z^2))
 * derived independently from
 *   https://www.evanmiller.org/how-not-to-sort-by-average-rating.html
 * (different floating-point evaluation path than the repo's centre/spread form).
 *
 * Run: node docs/lab/exp-ratings-math-a-wilson.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { wilsonLowerBound } = await import(req.resolve("@rosterhq/shared"));

// Independent reference (fresh from the cited formula, different algebra).
function refWilson(s, n, z = 1.96) {
  if (n <= 0) return 0;
  return (2 * s + z * z - z * Math.sqrt(z * z + (4 * s * (n - s)) / n)) / (2 * (n + z * z));
}

// Deterministic PRNG so the run is reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 1337;
const rnd = mulberry32(SEED);
const randInt = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const results = { seed: SEED, startedAt: new Date().toISOString() };
const t0 = Date.now();

// ── 1. Agreement vs reference: 5000 random pairs + forced edges ────────────
const edges = [
  [0, 0], [0, 1], [1, 1], [0, 2], [1, 2], [2, 2],
  [0, 10000], [1, 10000], [5000, 10000], [9999, 10000], [10000, 10000],
  [3, 3], [84, 100], [9, 10], [90, 100], [9, 11], [0, 10],
];
const pairs = [...edges];
for (let i = 0; i < 5000; i++) {
  const n = randInt(0, 10000);
  const s = randInt(0, n);
  pairs.push([s, n]);
}
let maxDiff = 0, argmax = null;
let outOfRange = 0, rangeMin = Infinity, rangeMax = -Infinity;
for (const [s, n] of pairs) {
  const got = wilsonLowerBound(s, n);
  const want = refWilson(s, n);
  const d = Math.abs(got - want);
  if (d > maxDiff) { maxDiff = d; argmax = { s, n, got, want }; }
  if (!(got >= 0 && got <= 1)) outOfRange++;
  if (got < rangeMin) rangeMin = got;
  if (got > rangeMax) rangeMax = got;
}
results.agreement = {
  pairsTested: pairs.length,
  maxAbsDiff: maxDiff,
  argmax,
  outputRange: { min: rangeMin, max: rangeMax, violationsOf01: outOfRange },
};

// ── 2. Monotonicity in s at fixed n (s+1 never lowers LB) ──────────────────
// Full sweep n=1..300 (all s), plus 2000 random large-n spot checks.
const EPS = 1e-12;
let monoSChecks = 0, monoSViolations = 0, monoSWorst = null;
const checkMonoS = (s, n) => {
  const a = wilsonLowerBound(s, n);
  const b = wilsonLowerBound(s + 1, n);
  monoSChecks++;
  if (b < a - EPS) {
    monoSViolations++;
    if (!monoSWorst || a - b > monoSWorst.drop) monoSWorst = { s, n, a, b, drop: a - b };
  }
};
for (let n = 1; n <= 300; n++) for (let s = 0; s < n; s++) checkMonoS(s, n);
for (let i = 0; i < 2000; i++) {
  const n = randInt(301, 10000);
  checkMonoS(randInt(0, n - 1), n);
}
results.monotonicityInS = { checks: monoSChecks, violations: monoSViolations, worst: monoSWorst };

// ── 3. Same p-hat at larger n raises LB (small-sample humility) ────────────
// wilson(k*s, k*n) >= wilson(s, n); strict whenever p-hat > 0.
let monoNChecks = 0, monoNViolations = 0, monoNNonStrictPosPhat = 0, monoNWorst = null;
for (const k of [2, 3, 5, 10]) {
  for (let i = 0; i < 500; i++) {
    const n = randInt(1, 1000);
    const s = randInt(0, n);
    const a = wilsonLowerBound(s, n);
    const b = wilsonLowerBound(k * s, k * n);
    monoNChecks++;
    if (b < a - EPS) {
      monoNViolations++;
      if (!monoNWorst || a - b > monoNWorst.drop) monoNWorst = { s, n, k, a, b, drop: a - b };
    } else if (s > 0 && b <= a + EPS) {
      monoNNonStrictPosPhat++; // should not happen for p-hat > 0
    }
  }
}
results.monotonicityInN = {
  checks: monoNChecks,
  violations: monoNViolations,
  nonStrictWithPositivePhat: monoNNonStrictPosPhat,
  worst: monoNWorst,
};

// ── 4. Edges & contract ─────────────────────────────────────────────────────
const throws = (fn) => { try { fn(); return false; } catch (e) { return e instanceof RangeError; } };
results.edges = {
  n0: wilsonLowerBound(0, 0),
  n1s0: wilsonLowerBound(0, 1),
  n1s1: wilsonLowerBound(1, 1),
  sEqualsNAt10000: wilsonLowerBound(10000, 10000),
  s0At10000: wilsonLowerBound(0, 10000),
  negativeSThrowsRangeError: throws(() => wilsonLowerBound(-1, 3)),
  sGreaterThanNThrowsRangeError: throws(() => wilsonLowerBound(5, 3)),
  negativeNReturns: wilsonLowerBound(0, -5), // n<=0 branch — measured, not judged
  docstringHumility_w3of3_lt_w84of100:
    wilsonLowerBound(3, 3) < wilsonLowerBound(84, 100),
  w3of3: wilsonLowerBound(3, 3),
  w84of100: wilsonLowerBound(84, 100),
};

// ── 5. z-collapse invariant: z=0 ⇒ LB = p-hat exactly ───────────────────────
let zCollapseMaxDiff = 0;
for (let i = 0; i < 200; i++) {
  const n = randInt(1, 10000);
  const s = randInt(0, n);
  const d = Math.abs(wilsonLowerBound(s, n, 0) - s / n);
  if (d > zCollapseMaxDiff) zCollapseMaxDiff = d;
}
results.zCollapse = { samples: 200, maxAbsDiffFromPhat: zCollapseMaxDiff };

// ── 6. NaN/non-finite probes (observed behavior, informational) ────────────
results.nonFiniteProbes = {
  nanS: wilsonLowerBound(NaN, 10),
  nanN: wilsonLowerBound(NaN, NaN),
  fractionalInputsHalfOf1: wilsonLowerBound(0.5, 1),
};

results.elapsedMs = Date.now() - t0;
const out = path.join(repo, "docs/lab/tmp-ratings-math/part-a-wilson.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
