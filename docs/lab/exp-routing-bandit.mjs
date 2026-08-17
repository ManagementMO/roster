/**
 * E2 — Should the LOCAL ROUTING signal use Thompson sampling instead of the
 * Wilson lower bound?
 *
 * Models the REAL decision shape in ROSTER, not a textbook bandit:
 *   retrieval (0.15*lex + 0.85*cos) proposes a candidate SET of 5 out of 40 tools,
 *   the rating signal re-ranks WITHIN that set, the top one is called,
 *   outcome ~ Bernoulli(p_true(t)).
 *
 * The Wilson policy calls the REAL production `wilsonLowerBound` from the built
 * @roster/shared package (parity is asserted against a local mirror on a grid).
 *
 * Common random numbers: for each seed we pre-generate (a) the candidate sets for
 * every step and (b) a u[tool][t] uniform matrix, then run EVERY policy against
 * the identical environment. So all cross-policy comparisons are exactly paired
 * per seed, which is what the paired bootstrap / McNemar below require.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Repo-relative, like every other experiment here. Override with ROSTER_REPO
// when running out of tree.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.ROSTER_REPO ?? path.resolve(HERE, "..", "..");
const OUT_JSON = path.join(HERE, "results-routing-bandit.json");

const req = createRequire(path.join(REPO, "packages/cli/package.json"));
const { wilsonLowerBound: REAL_WILSON } = await import(req.resolve("@roster/shared"));

// ── parity check: local mirror vs the real production function ───────────────
function mirrorWilson(successes, n, z = 1.96) {
  if (n <= 0) return 0;
  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = phat + z2 / (2 * n);
  const spread = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - spread) / denom);
}
function parityCheck() {
  let maxAbsDiff = 0;
  let cases = 0;
  for (let n = 0; n <= 400; n++) {
    for (let s = 0; s <= n; s++) {
      const d = Math.abs(REAL_WILSON(s, n) - mirrorWilson(s, n));
      if (d > maxAbsDiff) maxAbsDiff = d;
      cases++;
    }
  }
  return { cases, maxAbsDiff, identical: maxAbsDiff === 0 };
}
const PARITY = parityCheck();

// ── RNG ──────────────────────────────────────────────────────────────────────
function mulberry32(a) {
  let s = a | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNormal(rng) {
  let cached = null;
  return function normal() {
    if (cached !== null) {
      const v = cached;
      cached = null;
      return v;
    }
    let u = 0, v = 0, s = 0;
    do {
      u = rng() * 2 - 1;
      v = rng() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    cached = v * m;
    return u * m;
  };
}
/** Marsaglia-Tsang gamma(shape>=1, scale=1). */
function makeGamma(rng, normal) {
  return function gamma(a) {
    const d = a - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do {
        x = normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = rng();
      const x2 = x * x;
      if (u < 1 - 0.0331 * x2 * x2) return d * v;
      if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) return d * v;
    }
  };
}
function makeBeta(rng) {
  const gamma = makeGamma(rng, makeNormal(rng));
  return function beta(a, b) {
    const x = gamma(a);
    const y = gamma(b);
    return x / (x + y);
  };
}
/** Sanity: Beta sampler mean/var against closed form. */
function betaSamplerCheck() {
  const rng = mulberry32(999);
  const beta = makeBeta(rng);
  const out = [];
  for (const [a, b] of [[1, 1], [2, 5], [10, 3], [50, 50], [201, 51]]) {
    const N = 200000;
    let sum = 0, sum2 = 0;
    for (let i = 0; i < N; i++) {
      const v = beta(a, b);
      sum += v;
      sum2 += v * v;
    }
    const m = sum / N;
    const varEmp = sum2 / N - m * m;
    const mT = a / (a + b);
    const vT = (a * b) / ((a + b) * (a + b) * (a + b + 1));
    out.push({
      a, b, N,
      meanEmpirical: +m.toFixed(6), meanTheory: +mT.toFixed(6),
      varEmpirical: +varEmp.toExponential(4), varTheory: +vT.toExponential(4),
      meanRelErr: +(Math.abs(m - mT) / mT).toExponential(2),
      varRelErr: +(Math.abs(varEmp - vT) / vT).toExponential(2),
    });
  }
  return out;
}
const BETA_CHECK = betaSamplerCheck();

// ── environment ──────────────────────────────────────────────────────────────
const N_TOOLS = 40;
const SET_SIZE = 5;
const WORST_TOOL = 39;
const BAD_P_THRESHOLD = 0.35;

/**
 * A scenario supplies p_i(t) via `pAt(t, pBase)` and which tools EXIST at t.
 * Tool 0 = incumbent, tool 1 = challenger, 2..38 = filler, 39 = designated worst.
 */
const SCENARIOS = {
  S1: {
    label: "S1 stationary, well separated (best 0.90 vs 0.60)",
    horizon: 2000, seeds: 1000, runLen: 20, metricStartT: 0,
    p0: 0.6, p1: 0.9, warmStart0: 0, challengerAppearsAt: 0, degradeAt: null,
  },
  S2: {
    label: "S2 stationary, CLOSE (0.72 vs 0.70)",
    horizon: 2000, seeds: 1000, runLen: 20, metricStartT: 0,
    p0: 0.70, p1: 0.72, warmStart0: 0, challengerAppearsAt: 0, degradeAt: null,
  },
  S3: {
    label: "S3 COLD START: established incumbent 0.75 (warm 30 obs); better new tool 0.90 appears at t=500",
    horizon: 2000, seeds: 1000, runLen: 20, metricStartT: 500,
    p0: 0.75, p1: 0.90, warmStart0: 30, challengerAppearsAt: 500, degradeAt: null,
  },
  S4: {
    label: "S4 NON-STATIONARY: incumbent 0.90 -> 0.40 at t=1000; alternative 0.70 throughout",
    horizon: 2000, seeds: 1000, runLen: 20, metricStartT: 1000,
    p0: 0.90, p1: 0.70, warmStart0: 0, challengerAppearsAt: 0, degradeAt: 1000, degradedP0: 0.40,
  },
  S5: {
    label: "S5 SPARSE (50 calls total), well separated (0.90 vs 0.60)",
    horizon: 50, seeds: 4000, runLen: 5, metricStartT: 0,
    p0: 0.6, p1: 0.9, warmStart0: 0, challengerAppearsAt: 0, degradeAt: null,
  },
  S5close: {
    label: "S5b SPARSE (50 calls), CLOSE p (0.72 vs 0.70)",
    horizon: 50, seeds: 4000, runLen: 5, metricStartT: 0,
    p0: 0.70, p1: 0.72, warmStart0: 0, challengerAppearsAt: 0, degradeAt: null,
  },
  S5cold: {
    label: "S5c SPARSE COLD START (50 calls): incumbent 0.75 (warm 10 obs); new 0.90 appears at t=15",
    horizon: 50, seeds: 4000, runLen: 5, metricStartT: 15,
    p0: 0.75, p1: 0.90, warmStart0: 10, challengerAppearsAt: 15, degradeAt: null,
  },
};

const POLICIES = [
  "WILSON_LCB", "WILSON_LCB_FIXEDTIE", "THOMPSON", "UCB1",
  "EGREEDY_0.1", "GREEDY_BAYES", "ORACLE", "RANDOM",
];

/** Build the per-seed environment: p values, existence, candidate sets, CRN. */
function buildEnv(sc, seed, pBestInSet) {
  const rng = mulberry32(seed * 2654435761 + 17);
  const p = new Float64Array(N_TOOLS);
  p[0] = sc.p0;
  p[1] = sc.p1;
  p[WORST_TOOL] = 0.05;
  for (let i = 2; i < WORST_TOOL; i++) p[i] = 0.30 + rng() * 0.35; // U[0.30, 0.65]

  // Stable tie-break order for the DETERMINISTIC Wilson variant. Production is
  // `ORDER BY COALESCE(wilson_lb,0) DESC, last_seen DESC`, and every present
  // capability gets last_seen=now on each boot, so full ties fall through to an
  // arbitrary-but-stable storage order. That order must be modelled as
  // UNCORRELATED with tool quality — using the raw tool index made the best tool
  // (index 1) win almost every zero-tie and produced a fake near-oracle result in
  // the first run of this harness.
  const tiePriority = new Int32Array(N_TOOLS);
  {
    const perm = [];
    for (let i = 0; i < N_TOOLS; i++) perm.push(i);
    for (let i = N_TOOLS - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    for (let r = 0; r < N_TOOLS; r++) tiePriority[perm[r]] = r;
  }

  const H = sc.horizon;
  // CRN outcome matrix u[tool*H + t]
  const u = new Float64Array(N_TOOLS * H);
  for (let i = 0; i < u.length; i++) u[i] = rng();

  // p at time t (only tool 0 is non-stationary, in S4)
  const pAt = (t, i) => (i === 0 && sc.degradeAt !== null && t >= sc.degradeAt ? sc.degradedP0 : p[i]);

  // candidate sets
  const sets = new Int32Array(H * SET_SIZE);
  const bestAt = new Int32Array(H);
  const setBestP = new Float64Array(H);
  const globalBestP = new Float64Array(H);
  const pool = [];
  for (let t = 0; t < H; t++) {
    const challengerExists = t >= sc.challengerAppearsAt;
    // global best among EXISTING tools
    let best = 0, bestP = -1;
    for (let i = 0; i < N_TOOLS; i++) {
      if (i === 1 && !challengerExists) continue;
      const pi = pAt(t, i);
      if (pi > bestP) { bestP = pi; best = i; }
    }
    bestAt[t] = best;
    globalBestP[t] = bestP;

    pool.length = 0;
    for (let i = 0; i < N_TOOLS; i++) {
      if (i === 1 && !challengerExists) continue;
      if (i === best) continue;
      pool.push(i);
    }
    const forceBest = rng() < pBestInSet;
    const chosen = [];
    if (forceBest) chosen.push(best);
    // partial Fisher-Yates over pool (nDraw fixed BEFORE the loop — a mutating
    // bound here silently produced short sets in the first run)
    const nDraw = SET_SIZE - chosen.length;
    for (let k = 0; k < nDraw; k++) {
      const j = k + Math.floor(rng() * (pool.length - k));
      const tmp = pool[k]; pool[k] = pool[j]; pool[j] = tmp;
      chosen.push(pool[k]);
    }
    if (chosen.length !== SET_SIZE || new Set(chosen).size !== SET_SIZE) {
      throw new Error(`bad candidate set at t=${t}: ${JSON.stringify(chosen)}`);
    }
    let sbp = -1;
    for (let k = 0; k < SET_SIZE; k++) {
      sets[t * SET_SIZE + k] = chosen[k];
      const pi = pAt(t, chosen[k]);
      if (pi > sbp) sbp = pi;
    }
    setBestP[t] = sbp;
  }
  return { p, pAt, u, sets, bestAt, setBestP, globalBestP, H, tiePriority };
}

/** Warm-start counts for the incumbent, drawn from its own p (deterministic per seed). */
function warmStart(sc, seed) {
  const s = new Int32Array(N_TOOLS);
  const f = new Int32Array(N_TOOLS);
  if (sc.warmStart0 > 0) {
    const rng = mulberry32(seed * 40503 + 7919);
    for (let i = 0; i < sc.warmStart0; i++) {
      if (rng() < sc.p0) s[0]++; else f[0]++;
    }
  }
  return { s, f };
}

function runPolicy(policy, sc, env, seed) {
  const { pAt, u, sets, bestAt, setBestP, globalBestP, H, tiePriority } = env;
  const { s, f } = warmStart(sc, seed);
  // policy-private RNG (independent of the environment stream => pairing intact)
  let h = 0;
  for (let i = 0; i < policy.length; i++) h = (Math.imul(h, 31) + policy.charCodeAt(i)) | 0;
  const prng = mulberry32((seed * 1000003 + h) | 0);
  const beta = policy === "THOMPSON" ? makeBeta(prng) : null;

  let regretSet = 0, regretGlobal = 0;
  let regretSetPost = 0, regretGlobalPost = 0;
  let callsBest = 0, callsSetBest = 0, successes = 0;
  let worstCalls = 0, badCalls = 0;
  let opps = 0, oppsPost = 0, callsBestWhenPresentPost = 0;
  let run = 0, oppsUntilStable = null;
  const tailWindow = Math.min(20, Math.max(5, Math.floor(H / 10)));
  const tailPicks = [];

  for (let t = 0; t < H; t++) {
    const base = t * SET_SIZE;
    let pick = -1;
    if (policy === "EGREEDY_0.1" && prng() < 0.1) {
      pick = sets[base + Math.floor(prng() * SET_SIZE)];
    } else {
      let bestScore = -Infinity, nTies = 0;
      for (let k = 0; k < SET_SIZE; k++) {
        const i = sets[base + k];
        const si = s[i], fi = f[i], ni = si + fi;
        let score;
        switch (policy) {
          case "WILSON_LCB":
          case "WILSON_LCB_FIXEDTIE":
            score = REAL_WILSON(si, ni);
            break;
          case "THOMPSON":
            score = beta(si + 1, fi + 1);
            break;
          case "UCB1":
            score = ni === 0 ? Infinity : si / ni + Math.sqrt((2 * Math.log(Math.max(t + 1, 2))) / ni);
            break;
          case "EGREEDY_0.1":
          case "GREEDY_BAYES":
            score = (si + 1) / (ni + 2);
            break;
          case "ORACLE":
            score = pAt(t, i);
            break;
          case "RANDOM":
            score = 0;
            break;
          default:
            throw new Error(`unknown policy ${policy}`);
        }
        if (score > bestScore) {
          bestScore = score; pick = i; nTies = 1;
        } else if (score === bestScore) {
          nTies++;
          if (policy === "WILSON_LCB_FIXEDTIE") {
            // stable storage order, UNCORRELATED with quality (per-seed random
            // permutation): models `ORDER BY wilson_lb DESC, last_seen DESC`
            // when every last_seen is equal.
            if (tiePriority[i] < tiePriority[pick]) pick = i;
          } else if (prng() < 1 / nTies) {
            pick = i; // uniform random among ties (reservoir)
          }
        }
      }
    }

    const pPick = pAt(t, pick);
    regretSet += setBestP[t] - pPick;
    regretGlobal += globalBestP[t] - pPick;
    if (t >= sc.metricStartT) {
      regretSetPost += setBestP[t] - pPick;
      regretGlobalPost += globalBestP[t] - pPick;
    }
    const gBest = bestAt[t];
    if (pick === gBest) callsBest++;
    if (pPick === setBestP[t]) callsSetBest++;
    if (pick === WORST_TOOL) worstCalls++;
    if (pPick < BAD_P_THRESHOLD) badCalls++;
    const success = u[pick * H + t] < pPick;
    if (success) { s[pick]++; successes++; } else { f[pick]++; }

    // best-tool "preference" tracking, over OPPORTUNITIES (best is in the set)
    let bestInSet = false;
    for (let k = 0; k < SET_SIZE; k++) if (sets[base + k] === gBest) { bestInSet = true; break; }
    if (bestInSet) {
      opps++;
      if (t >= sc.metricStartT) {
        oppsPost++;
        if (pick === gBest) callsBestWhenPresentPost++;
        run = pick === gBest ? run + 1 : 0;
        if (oppsUntilStable === null && run >= sc.runLen) oppsUntilStable = oppsPost;
        tailPicks.push(pick === gBest ? 1 : 0);
        if (tailPicks.length > tailWindow) tailPicks.shift();
      }
    }
  }
  const tailFrac = tailPicks.length > 0 ? tailPicks.reduce((a, b) => a + b, 0) / tailPicks.length : null;
  return {
    regretSet, regretGlobal, regretSetPost, regretGlobalPost,
    fracCallsOnBest: callsBest / H,
    fracCallsOnSetBest: callsSetBest / H,
    fracBestWhenPresentPost: oppsPost > 0 ? callsBestWhenPresentPost / oppsPost : null,
    successes, worstCalls, badCalls,
    oppsUntilStable,
    preferredAtEnd: tailFrac === null ? null : (tailFrac >= 0.5 ? 1 : 0),
  };
}

// ── stats ────────────────────────────────────────────────────────────────────
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function meanCI95(a) {
  const m = mean(a);
  const n = a.length;
  const v = a.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (n - 1);
  const se = Math.sqrt(v / n);
  return { mean: m, sd: Math.sqrt(v), se, lo: m - 1.96 * se, hi: m + 1.96 * se, n };
}
function pairedBootstrap(a, b, resamples = 10000, seed = 424242) {
  // returns CI for mean(a) - mean(b), resampling SEED INDICES with replacement
  const n = a.length;
  const rng = mulberry32(seed);
  const diffs = new Float64Array(n);
  for (let i = 0; i < n; i++) diffs[i] = a[i] - b[i];
  const point = mean(Array.from(diffs));
  const boots = new Float64Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let acc = 0;
    for (let i = 0; i < n; i++) acc += diffs[(rng() * n) | 0];
    boots[r] = acc / n;
  }
  const sorted = Array.from(boots).sort((x, y) => x - y);
  const q = (pp) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(pp * (sorted.length - 1))))];
  return {
    meanDiff: point, ci95: [q(0.025), q(0.975)], resamples,
    excludesZero: q(0.025) > 0 || q(0.975) < 0,
  };
}
function logChoose(n, k) {
  let r = 0;
  for (let i = 1; i <= k; i++) r += Math.log(n - k + i) - Math.log(i);
  return r;
}
function mcnemar(aBin, bBin) {
  // b = a==0 && b==1 ; c = a==1 && b==0
  let b = 0, c = 0, both = 0, neither = 0;
  for (let i = 0; i < aBin.length; i++) {
    if (aBin[i] === null || bBin[i] === null) continue;
    if (aBin[i] === 0 && bBin[i] === 1) b++;
    else if (aBin[i] === 1 && bBin[i] === 0) c++;
    else if (aBin[i] === 1) both++;
    else neither++;
  }
  const n = b + c;
  let p = 1;
  if (n > 0) {
    const m = Math.min(b, c);
    let tail = 0;
    for (let k = 0; k <= m; k++) tail += Math.exp(logChoose(n, k) - n * Math.LN2);
    p = Math.min(1, 2 * tail);
  }
  return { discordantAonly_c: c, discordantBonly_b: b, both, neither, exactBinomialP: p };
}
function tail(a) {
  const s = [...a].sort((x, y) => x - y);
  const q = (pp) => s[Math.min(s.length - 1, Math.max(0, Math.round(pp * (s.length - 1))))];
  return { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1] };
}
const median = (a) => {
  if (a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── run ──────────────────────────────────────────────────────────────────────
function runScenario(key, pBestInSet) {
  const sc = SCENARIOS[key];
  const per = {};
  for (const pol of POLICIES) per[pol] = [];
  for (let seed = 1; seed <= sc.seeds; seed++) {
    const env = buildEnv(sc, seed, pBestInSet);
    for (const pol of POLICIES) per[pol].push(runPolicy(pol, sc, env, seed));
  }
  const summary = {};
  for (const pol of POLICIES) {
    const rows = per[pol];
    const stable = rows.map((r) => r.oppsUntilStable).filter((x) => x !== null);
    summary[pol] = {
      cumRegretSet: fmtCI(meanCI95(rows.map((r) => r.regretSet))),
      cumRegretGlobal: fmtCI(meanCI95(rows.map((r) => r.regretGlobal))),
      cumRegretSetPostChange: fmtCI(meanCI95(rows.map((r) => r.regretSetPost))),
      fracCallsOnBest: fmtCI(meanCI95(rows.map((r) => r.fracCallsOnBest))),
      fracBestChosenWhenPresentPostChange: fmtCI(
        meanCI95(rows.map((r) => r.fracBestWhenPresentPost ?? 0)),
      ),
      successes: fmtCI(meanCI95(rows.map((r) => r.successes))),
      worstToolCalls: { ...fmtCI(meanCI95(rows.map((r) => r.worstCalls))),
        ...tail(rows.map((r) => r.worstCalls)) },
      badToolCalls_p_lt_0_35: { ...fmtCI(meanCI95(rows.map((r) => r.badCalls))),
        ...tail(rows.map((r) => r.badCalls)) },
      oppsUntilBestStablyPreferred: {
        medianAmongAchieved: median(stable),
        meanAmongAchieved: stable.length ? +mean(stable).toFixed(2) : null,
        achievedFrac: +(stable.length / rows.length).toFixed(4),
        censoredFrac: +(1 - stable.length / rows.length).toFixed(4),
        runLenRequired: sc.runLen,
      },
      preferredBestAtEndFrac: +mean(rows.map((r) => r.preferredAtEnd ?? 0)).toFixed(4),
    };
  }
  // paired comparisons vs the status quo
  const cmp = {};
  const wq = per.WILSON_LCB;
  for (const pol of POLICIES) {
    if (pol === "WILSON_LCB") continue;
    cmp[`${pol} - WILSON_LCB`] = {
      cumRegretSet: fmtBoot(pairedBootstrap(per[pol].map((r) => r.regretSet), wq.map((r) => r.regretSet))),
      cumRegretSetPostChange: fmtBoot(
        pairedBootstrap(per[pol].map((r) => r.regretSetPost), wq.map((r) => r.regretSetPost)),
      ),
      successes: fmtBoot(pairedBootstrap(per[pol].map((r) => r.successes), wq.map((r) => r.successes))),
      worstToolCalls: fmtBoot(
        pairedBootstrap(per[pol].map((r) => r.worstCalls), wq.map((r) => r.worstCalls)),
      ),
      badToolCalls: fmtBoot(pairedBootstrap(per[pol].map((r) => r.badCalls), wq.map((r) => r.badCalls))),
      mcnemar_preferredBestAtEnd: mcnemar(
        wq.map((r) => r.preferredAtEnd),
        per[pol].map((r) => r.preferredAtEnd),
      ),
    };
  }
  // Second baseline: the DETERMINISTIC Wilson variant, which is the more faithful
  // model of the production `ORDER BY wilson_lb DESC, last_seen DESC` (all ties
  // fall through to a stable storage order, not a coin flip). This is the
  // load-bearing comparison for "is Thompson better than what actually ships".
  const cmp2 = {};
  const wf = per.WILSON_LCB_FIXEDTIE;
  for (const pol of ["THOMPSON", "GREEDY_BAYES", "EGREEDY_0.1", "WILSON_LCB"]) {
    cmp2[`${pol} - WILSON_LCB_FIXEDTIE`] = {
      cumRegretSet: fmtBoot(pairedBootstrap(per[pol].map((r) => r.regretSet), wf.map((r) => r.regretSet))),
      cumRegretSetPostChange: fmtBoot(
        pairedBootstrap(per[pol].map((r) => r.regretSetPost), wf.map((r) => r.regretSetPost)),
      ),
      successes: fmtBoot(pairedBootstrap(per[pol].map((r) => r.successes), wf.map((r) => r.successes))),
      worstToolCalls: fmtBoot(
        pairedBootstrap(per[pol].map((r) => r.worstCalls), wf.map((r) => r.worstCalls)),
      ),
      mcnemar_preferredBestAtEnd: mcnemar(
        wf.map((r) => r.preferredAtEnd),
        per[pol].map((r) => r.preferredAtEnd),
      ),
    };
  }
  return { label: sc.label, config: { ...sc, pBestInSet, nTools: N_TOOLS, setSize: SET_SIZE }, summary, comparisonsVsWilson: cmp, comparisonsVsWilsonFixedTie: cmp2 };
}
const r4 = (x) => (x === null || x === undefined ? null : +x.toFixed(4));
const fmtCI = (c) => ({ mean: r4(c.mean), ci95: [r4(c.lo), r4(c.hi)], sd: r4(c.sd), n: c.n });
const fmtBoot = (b) => ({
  meanDiff: r4(b.meanDiff), ci95: [r4(b.ci95[0]), r4(b.ci95[1])],
  excludesZero: b.excludesZero, resamples: b.resamples,
});

// ── harness self-checks (these would have caught the short-candidate-set bug) ─
function selfChecks() {
  const checks = [];
  for (const key of Object.keys(SCENARIOS)) {
    const sc = SCENARIOS[key];
    let maxOracleRegret = 0;
    let minRandomRegret = Infinity;
    for (let seed = 1; seed <= 25; seed++) {
      const env = buildEnv(sc, seed, 0.6);
      const o = runPolicy("ORACLE", sc, env, seed);
      maxOracleRegret = Math.max(maxOracleRegret, Math.abs(o.regretSet));
      const r = runPolicy("RANDOM", sc, env, seed);
      minRandomRegret = Math.min(minRandomRegret, r.regretSet);
    }
    checks.push({
      scenario: key,
      oracleRegretSetMaxAbs: +maxOracleRegret.toExponential(3),
      oracleRegretIsZero: maxOracleRegret < 1e-9,
      randomRegretSetMin: +minRandomRegret.toFixed(4),
      randomRegretNonNegative: minRandomRegret >= 0,
    });
  }
  return checks;
}
const SELF_CHECKS = selfChecks();
for (const c of SELF_CHECKS) {
  if (!c.oracleRegretIsZero || !c.randomRegretNonNegative) {
    throw new Error(`harness self-check FAILED: ${JSON.stringify(c)}`);
  }
}

const t0 = Date.now();
const results = {
  generatedAt: new Date().toISOString(),
  repo: REPO,
  statusQuoAsRead: {
    file: "packages/coach/src/store.ts",
    draftCandidatesScore: "0.15*lexNorm + 0.85*cosNorm — contains NO rating term",
    wilsonUseInRouting:
      "ONLY ratedFallback(): `ORDER BY COALESCE(r.wilson_lb,0) DESC, c.last_seen DESC`, used to BACKFILL a draft that produced fewer than k candidates with score>0",
    wilsonUseInPublicScore: "packages/combine/src/results.ts -> apps/league (must stay Wilson)",
    exploredFlag:
      "outcome.explored is set true ONLY for skill__ invocations (rosterServer.ts:291) so they never mint a perfect rating. recomputeRatings filters `explored = 0`. There is NO exploration policy in the router — nothing ever deliberately calls a lower-ranked tool.",
    existingExplorationMechanism:
      "OATS (nightly) moves a tool's EMBEDDING toward needs it succeeded on / away from needs it failed. That is the outcome->routing feedback path, and it is a re-ranking of the retrieval channel, not a bandit.",
  },
  wilsonParityCheck: PARITY,
  harnessSelfChecks: SELF_CHECKS,
  betaSamplerValidation: BETA_CHECK,
  wilsonDegeneracy: {
    "wilson(0,0)": REAL_WILSON(0, 0),
    "wilson(0,5)": REAL_WILSON(0, 5),
    "wilson(0,50)": REAL_WILSON(0, 50),
    "wilson(1,1)": REAL_WILSON(1, 1),
    "wilson(1,2)": REAL_WILSON(1, 2),
    note: "wilson==0 for every zero-success tool regardless of n: an untried tool and a 0/50 proven-broken tool are indistinguishable to the status-quo routing key. Beta posterior mean would give 0.5 vs 0.0192.",
  },
  scenarios: {},
  retrievalDominanceSweep: {},
};

for (const key of Object.keys(SCENARIOS)) {
  process.stderr.write(`running ${key} ...`);
  results.scenarios[key] = runScenario(key, 0.6);
  process.stderr.write(` ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}
for (const key of ["S1", "S3", "S5", "S5cold"]) {
  for (const pb of [0.2, 1.0]) {
    process.stderr.write(`sweep ${key} pBestInSet=${pb} ...`);
    const r = runScenario(key, pb);
    results.retrievalDominanceSweep[`${key}@pBestInSet=${pb}`] = {
      label: r.label,
      WILSON_LCB: r.summary.WILSON_LCB.cumRegretSet,
      THOMPSON: r.summary.THOMPSON.cumRegretSet,
      GREEDY_BAYES: r.summary.GREEDY_BAYES.cumRegretSet,
      ORACLE: r.summary.ORACLE.cumRegretSet,
      RANDOM: r.summary.RANDOM.cumRegretSet,
      "THOMPSON - WILSON_LCB (regretSet)": r.comparisonsVsWilson["THOMPSON - WILSON_LCB"].cumRegretSet,
      "THOMPSON - WILSON_LCB (successes)": r.comparisonsVsWilson["THOMPSON - WILSON_LCB"].successes,
      "THOMPSON - WILSON_LCB (worstToolCalls)":
        r.comparisonsVsWilson["THOMPSON - WILSON_LCB"].worstToolCalls,
    };
    process.stderr.write(` ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }
}
results.runtimeSeconds = +((Date.now() - t0) / 1000).toFixed(1);
writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
process.stderr.write(`\nwrote ${OUT_JSON} (${results.runtimeSeconds}s)\n`);

// compact console table
for (const [k, sc] of Object.entries(results.scenarios)) {
  console.log(`\n=== ${k}: ${sc.label}  [H=${sc.config.horizon}, seeds=${sc.config.seeds}, pBestInSet=0.6]`);
  console.log(
    ["policy", "regretSet(95%CI)", "fracBest", "succ", "worstCalls", "prefEnd"].join("\t"),
  );
  for (const pol of POLICIES) {
    const s = sc.summary[pol];
    console.log(
      [
        pol.padEnd(20),
        `${s.cumRegretSet.mean} [${s.cumRegretSet.ci95[0]}, ${s.cumRegretSet.ci95[1]}]`,
        s.fracCallsOnBest.mean,
        s.successes.mean,
        s.worstToolCalls.mean,
        s.preferredBestAtEndFrac,
      ].join("\t"),
    );
  }
  const tv = sc.comparisonsVsWilson["THOMPSON - WILSON_LCB"];
  console.log(
    `  TS-Wilson regretSet diff ${tv.cumRegretSet.meanDiff} CI ${JSON.stringify(tv.cumRegretSet.ci95)} excl0=${tv.cumRegretSet.excludesZero}`,
  );
  console.log(
    `  TS-Wilson successes diff ${tv.successes.meanDiff} CI ${JSON.stringify(tv.successes.ci95)} excl0=${tv.successes.excludesZero}`,
  );
  console.log(
    `  TS-Wilson worstToolCalls diff ${tv.worstToolCalls.meanDiff} CI ${JSON.stringify(tv.worstToolCalls.ci95)} excl0=${tv.worstToolCalls.excludesZero}`,
  );
}
