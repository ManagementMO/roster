#!/usr/bin/env node
/**
 * E1 — Reciprocal Rank Fusion vs the shipped weighted min-max fusion.
 *
 * Question: does RRF (score(d) = sum_r 1/(k + rank_r(d))) beat the shipped
 * weighted min-max fusion in packages/coach/src/store.ts (HYBRID_LEX_WEIGHT
 * 0.15 / HYBRID_COS_WEIGHT 0.85 over min-max normalized bm25 + cosine, with
 * LEX_SCORE_FLOOR 0.05 and the MIN_INFORMATIVE_COS_SPAN 0.15 abstain gate)?
 * The retrieval literature says rank fusion usually wins because it never has
 * to reconcile incompatible score scales — and the floor + abstain constants
 * look exactly like patches for that normalization pathology.
 *
 * Method (modeled on docs/lab/exp-retrieval-minilm.mjs, same house style):
 *  - Real CoachStore over openCoachDb(":memory:"), real upsertCapabilities of
 *    the shared 133-tool corpus, REAL store.lexicalSearch() bm25 scores and
 *    REAL store.loadVecs() stored vectors. Nothing about retrieval is faked
 *    except (optionally) the embedding provider.
 *  - Tool cards embedded EXACTLY like packages/cli/src/serve.ts:116 —
 *    `${name}\n${description}\n${body ?? ""}`.slice(0,2000), kind "document",
 *    batches of 16. Needs embedded like serve.ts:141, kind "query".
 *  - Pluggable embedder:
 *      --embedder=real  TransformersEmbeddings(MINILM_MODEL). Needs network
 *                       access to huggingface.co. THIS IS THE ONLY MODE WHOSE
 *                       METRICS ARE EVIDENCE ABOUT RRF.
 *      --embedder=stub  deterministic hashed bag-of-tokens pseudo-vectors.
 *                       Exists ONLY to prove the harness runs end to end and
 *                       to verify fusion parity offline. NOT a retrieval result.
 *  - fuseMirror(): a line-faithful mirror of the CURRENT shipped fusion, with
 *    weights/minSpan as parameters instead of module constants. Its top-5 is
 *    ASSERTED equal to the real store.draftCandidates(need, 5, needVec) top-5
 *    for every need (wherever the mirror produced >= 5 scored candidates —
 *    below that the real path backfills by rating, which the mirror omits).
 *  - Challengers: RRF k in {0,1,10,20,60}; z-score normalized weighted fusion;
 *    rank-weighted Borda. Control = the shipped config.
 *  - Paired bootstrap 95% CIs on the DIFFERENCE vs control (seeded, >=10000
 *    resamples over the 66 needs) + exact McNemar on hit@1 wins/losses.
 *
 * hit@k is scored against `acceptable`, MRR against `primary`, per needs.mjs.
 *
 * Usage (from anywhere; paths are resolved against REPO below):
 *   node e1-exp-fusion-rrf.mjs --embedder=stub
 *   node e1-exp-fusion-rrf.mjs --embedder=real          # the real verdict
 *   node e1-exp-fusion-rrf.mjs --embedder=real --resamples=20000
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── paths ──────────────────────────────────────────────────────────────────
// This script lives in a scratchpad, not in docs/lab, so the repo root is
// explicit and overridable. When copied into docs/lab/ it still works: pass
// --repo=. or set ROSTER_REPO.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
// Living in docs/lab, the repo root is two levels up; --repo / ROSTER_REPO still win.
const REPO = path.resolve(
  flag("repo", process.env.ROSTER_REPO ?? path.resolve(HERE, "..", "..")),
);
const LAB = path.join(REPO, "docs", "lab");
const OUT = path.resolve(flag("out", path.join(HERE, "results-fusion-rrf.json")));
const EMBEDDER = flag("embedder", "stub");
const RESAMPLES = Number(flag("resamples", "10000"));
const SEED = Number(flag("seed", "20260731"));
// Every arm is scored at the SAME depth. 5 = what production returns from
// draftCandidates(need, 5), and what exp-retrieval-minilm.mjs used. MRR at this
// depth is therefore MRR@5; a full-depth MRR is reported separately below.
const SCORE_DEPTH = Number(flag("depth", "5"));

if (!["real", "stub"].includes(EMBEDDER)) {
  throw new Error(`--embedder must be "real" or "stub", got ${JSON.stringify(EMBEDDER)}`);
}
if (!Number.isFinite(RESAMPLES) || RESAMPLES < 10000) {
  throw new Error(`--resamples must be >= 10000 (statistical honesty rule), got ${RESAMPLES}`);
}

// ── shared lab inputs (unmodified, read from the repo) ──────────────────────
const { TOOLS } = await import(path.join(LAB, "corpus.mjs"));
const { NEEDS } = await import(path.join(LAB, "needs.mjs"));
const { rankedIds, hitAtK, reciprocalRank, mean, percentile, summarize } = await import(
  path.join(LAB, "metrics.mjs")
);

// ── real production code under measurement ─────────────────────────────────
const coach = await import(
  createRequire(path.join(REPO, "packages/cli/package.json")).resolve("@roster/coach")
);
const { CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL, cosine } = coach;

// The shipped constants are module-private in store.ts; they are mirrored here
// and CROSS-CHECKED against the source text below so this file cannot silently
// drift from production.
const SHIPPED = { lexWeight: 0.15, cosWeight: 0.85, minInformativeCosSpan: 0.15, lexScoreFloor: 0.05 };
const storeSrc = fs.readFileSync(path.join(REPO, "packages/coach/src/store.ts"), "utf8");
const constCheck = {
  HYBRID_LEX_WEIGHT: /const HYBRID_LEX_WEIGHT = ([\d.]+);/.exec(storeSrc)?.[1],
  HYBRID_COS_WEIGHT: /const HYBRID_COS_WEIGHT = ([\d.]+);/.exec(storeSrc)?.[1],
  MIN_INFORMATIVE_COS_SPAN: /const MIN_INFORMATIVE_COS_SPAN = ([\d.]+);/.exec(storeSrc)?.[1],
  LEX_SCORE_FLOOR: /const LEX_SCORE_FLOOR = ([\d.]+);/.exec(storeSrc)?.[1],
};
const constMatch =
  Number(constCheck.HYBRID_LEX_WEIGHT) === SHIPPED.lexWeight &&
  Number(constCheck.HYBRID_COS_WEIGHT) === SHIPPED.cosWeight &&
  Number(constCheck.MIN_INFORMATIVE_COS_SPAN) === SHIPPED.minInformativeCosSpan &&
  Number(constCheck.LEX_SCORE_FLOOR) === SHIPPED.lexScoreFloor;
if (!constMatch) {
  throw new Error(
    `store.ts fusion constants ${JSON.stringify(constCheck)} do not match this harness' ` +
      `control ${JSON.stringify(SHIPPED)} — update the control before trusting any arm.`,
  );
}

// ── deterministic stub embedder ────────────────────────────────────────────
// Hashed bag-of-tokens random projection: each token maps to a fixed
// pseudo-random dense direction (seeded by FNV-1a of the token), the token
// directions are summed and the result unit-normalized. Deterministic across
// runs and processes; no model, no network, NO SEMANTICS. `kind` is
// deliberately NOT folded into the hash — doing so would make every
// query/document pair near-orthogonal and collapse the cosine span, which
// would exercise only the abstain branch.
const fnv1a32 = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};
const mulberry32 = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const STUB_DIMS = 384; // same as MiniLM native so dims-mismatch paths behave alike
const dirCache = new Map();
const tokenDirection = (token) => {
  let v = dirCache.get(token);
  if (v) return v;
  const rnd = mulberry32(fnv1a32(token) | 1);
  v = new Float32Array(STUB_DIMS);
  for (let i = 0; i < STUB_DIMS; i++) {
    // Box-Muller-free cheap symmetric draw: sum of 3 uniforms centered.
    v[i] = rnd() + rnd() + rnd() - 1.5;
  }
  dirCache.set(token, v);
  return v;
};
const stubTokens = (text) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
const stubEmbedOne = (text) => {
  const toks = stubTokens(text);
  const acc = new Float64Array(STUB_DIMS);
  const seeds = toks.length > 0 ? toks : [`__whole__${fnv1a32(text)}`];
  for (const t of seeds) {
    const d = tokenDirection(t);
    for (let i = 0; i < STUB_DIMS; i++) acc[i] += d[i];
  }
  // A small text-identity component so two docs with identical token multisets
  // still differ, and so empty/punctuation-only text is never a zero vector.
  const idd = tokenDirection(`__id__${fnv1a32(text)}`);
  for (let i = 0; i < STUB_DIMS; i++) acc[i] += 0.35 * idd[i];
  let norm = 0;
  for (let i = 0; i < STUB_DIMS; i++) norm += acc[i] * acc[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(STUB_DIMS);
  for (let i = 0; i < STUB_DIMS; i++) out[i] = acc[i] / norm;
  return out;
};
class StubEmbeddings {
  constructor() {
    this.dims = STUB_DIMS;
    this.modelId = "stub/hashed-bag-of-tokens-384";
  }
  async embed(texts) {
    return texts.map((t) => stubEmbedOne(t));
  }
  async dispose() {}
}

// ── statistics ─────────────────────────────────────────────────────────────
/**
 * Paired bootstrap over ITEMS (needs). Resamples need indices with
 * replacement, recomputing mean(arm) - mean(control) on the same resampled
 * index set for both arms (that is what makes it paired). Percentile CI.
 */
const pairedBootstrapDiff = (armVals, ctlVals, resamples, seed) => {
  const n = armVals.length;
  if (n !== ctlVals.length) throw new Error("paired bootstrap needs equal-length vectors");
  const rnd = mulberry32(seed | 1);
  const diffs = new Float64Array(resamples);
  for (let b = 0; b < resamples; b++) {
    let sa = 0;
    let sc = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.min(n - 1, Math.floor(rnd() * n));
      sa += armVals[j];
      sc += ctlVals[j];
    }
    diffs[b] = (sa - sc) / n;
  }
  const sorted = Array.from(diffs).sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))];
  const observed = mean(armVals) - mean(ctlVals);
  const lo = at(2.5);
  const hi = at(97.5);
  return {
    observedDiff: +observed.toFixed(4),
    ci95: [+lo.toFixed(4), +hi.toFixed(4)],
    excludesZero: lo > 0 || hi < 0,
    resamples,
    // Fraction of resamples on the wrong side of 0 — a one-sided bootstrap p.
    pBootTwoSided: +Math.min(
      1,
      2 *
        Math.min(
          sorted.filter((d) => d <= 0).length / sorted.length,
          sorted.filter((d) => d >= 0).length / sorted.length,
        ),
    ).toFixed(4),
  };
};

/** Exact two-sided McNemar on paired binary outcomes (binomial sign test on discordants). */
const mcnemarExact = (armBits, ctlBits) => {
  let b = 0; // control hit, arm miss
  let c = 0; // control miss, arm hit
  for (let i = 0; i < armBits.length; i++) {
    if (ctlBits[i] === 1 && armBits[i] === 0) b++;
    else if (ctlBits[i] === 0 && armBits[i] === 1) c++;
  }
  const n = b + c;
  if (n === 0) return { armWins: c, controlWins: b, discordant: 0, pExact: 1 };
  // log-space binomial tail so n up to 66 is exact enough in doubles.
  const lgamma = (z) => {
    // Lanczos
    const g = [
      676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1;
    let x = 0.99999999999980993;
    for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1);
    const t = z + g.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  };
  const logC = (nn, kk) => lgamma(nn + 1) - lgamma(kk + 1) - lgamma(nn - kk + 1);
  const k = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(logC(n, i) + n * Math.log(0.5));
  return {
    armWins: c,
    controlWins: b,
    discordant: n,
    pExact: +Math.min(1, 2 * tail).toFixed(4),
  };
};

// ── setup: real store, real corpus, chosen embedder ────────────────────────
const results = {
  meta: {
    experiment: "E1 fusion: RRF vs shipped weighted min-max",
    startedAt: new Date().toISOString(),
    node: process.version,
    repo: REPO,
    embedderMode: EMBEDDER,
    corpusTools: TOOLS.length,
    needs: NEEDS.length,
    shipped: SHIPPED,
    shippedConstantsVerifiedAgainstSource: constCheck,
    resamples: RESAMPLES,
    bootstrapSeed: SEED,
    toolTextRule: "serve.ts:116 `${name}\\n${description}\\n${body ?? ''}`.slice(0,2000), kind=document",
    needTextRule: "serve.ts:141 raw need, kind=query",
    lexicalDepth: 30,
    lexicalDepthRationale:
      "draftCandidates(need, 5) calls lexicalSearch(need, Math.max(30, 5*6)) = 30, so every " +
      "arm sees exactly the lexical candidate depth production sees at k=5.",
    scoreDepth: SCORE_DEPTH,
    scoreDepthRationale:
      "EVERY arm's ranking is truncated to this depth before scoring, so hit@1/hit@5/MRR are " +
      "computed over identically-sized result lists. Without this the full-ranking arms would " +
      "get free MRR credit that the k=5 real-store reference cannot earn.",
    metricConvention: "hit@k vs acceptable, MRR vs primary (needs.mjs)",
  },
};

if (EMBEDDER === "stub") {
  results.meta.STUB_WARNING =
    "EMBEDDER=stub. The dense channel is a deterministic hashed bag-of-tokens projection " +
    "with NO SEMANTICS. Every metric, CI and McNemar result in this file is a HARNESS " +
    "SELF-TEST ONLY and is NOT evidence about RRF vs the shipped fusion. Re-run with " +
    "--embedder=real for a verdict.";
  const bar = "=".repeat(78);
  console.log(`\n${bar}\n!!  STUB EMBEDDER — NOT A RETRIEVAL VERDICT  !!`);
  console.log(`!!  Dense vectors are hashed bag-of-tokens projections with no semantics.`);
  console.log(`!!  Metrics below prove only that the harness runs and that fusion parity holds.`);
  console.log(`!!  Run with --embedder=real (needs huggingface.co) for a real answer.\n${bar}\n`);
}

const store = new CoachStore(openCoachDb(":memory:"));
store.upsertCapabilities(TOOLS);

const provider = EMBEDDER === "real" ? new TransformersEmbeddings(MINILM_MODEL) : new StubEmbeddings();
results.meta.model = provider.modelId;

// Provider health probe. For the real model, related words MUST beat unrelated
// or we abort rather than report noise (same rule as exp-retrieval-minilm.mjs).
{
  const [dog, puppy, qft] = await provider.embed(["dog", "puppy", "quantum field theory"]);
  results.meta.sanity = {
    cosDogPuppy: +cosine(dog, puppy).toFixed(4),
    cosDogQft: +cosine(dog, qft).toFixed(4),
    dims: dog.length,
    enforced: EMBEDDER === "real",
  };
  if (EMBEDDER === "real" && !(results.meta.sanity.cosDogPuppy > results.meta.sanity.cosDogQft)) {
    throw new Error("provider sanity probe failed — aborting rather than reporting noise");
  }
}

const toolTexts = TOOLS.map((e) => `${e.name}\n${e.description}\n${e.body ?? ""}`.slice(0, 2000));
let t0 = Date.now();
const toolVecs = [];
for (let i = 0; i < toolTexts.length; i += 16) {
  toolVecs.push(...(await provider.embed(toolTexts.slice(i, i + 16), "document")));
}
results.meta.toolEmbedMs = Date.now() - t0;
TOOLS.forEach((t, i) => {
  if (!store.storeBaseVec(t.id, toolVecs[i])) throw new Error(`storeBaseVec rejected ${t.id}`);
});

t0 = Date.now();
const needVecs = [];
for (let i = 0; i < NEEDS.length; i += 16) {
  needVecs.push(...(await provider.embed(NEEDS.slice(i, i + 16).map((n) => n.need), "query")));
}
results.meta.needEmbedMs = Date.now() - t0;

// The vectors drafts actually use (adj ?? base — here all base), read back out
// of real SQLite so every arm scores against the SAME bytes production would.
const storedVecs = store.loadVecs();
if (storedVecs.size !== TOOLS.length) {
  throw new Error(`expected ${TOOLS.length} stored vecs, got ${storedVecs.size}`);
}

// ── fusion mirror: line-faithful copy of store.ts draftCandidates pass 1+2 ──
// store.ts:754-810. Weights and minSpan are parameters instead of module
// constants; `activeCapability` is a no-op here (nothing is quarantined) and
// the ratedFallback backfill (out.length < k) is omitted — parity is therefore
// only asserted where the mirror produced >= 5 scored candidates.
// Candidate-set construction order is preserved exactly (lexical ids first, in
// lexicalSearch order, then loadVecs() key order) because the final
// `sort((a,b) => b.score - a.score)` is STABLE in V8, so insertion order is
// the tie-break and any reordering here would break parity on ties.
function fuseMirror(lexResults, needVec, wLex, wCos, minSpan) {
  const lexById = new Map(lexResults.map((l) => [l.id, l.lexScore]));
  const candidateIds = new Set(lexById.keys());
  for (const id of storedVecs.keys()) candidateIds.add(id);

  const gathered = [];
  for (const id of candidateIds) {
    const lexScore = lexById.get(id) ?? null;
    let cosScore = null;
    const v = storedVecs.get(id);
    if (v && v.length === needVec.length) cosScore = cosine(needVec, v);
    gathered.push({ id, lexScore, cosScore });
  }
  const cosVals = gathered.map((g) => g.cosScore).filter((c) => c !== null);
  const cosMin = cosVals.length > 0 ? Math.min(...cosVals) : 0;
  const cosSpan = cosVals.length > 0 ? Math.max(...cosVals) - cosMin : 0;
  const denseInformative = cosVals.length > 1 && cosSpan >= minSpan;
  const out = [];
  for (const g of gathered) {
    let score;
    if (denseInformative && g.cosScore !== null) {
      const cosNorm = (g.cosScore - cosMin) / cosSpan;
      score = wLex * (g.lexScore ?? 0) + wCos * cosNorm;
    } else {
      score = g.lexScore ?? 0;
    }
    if (score > 0) out.push({ id: g.id, score, lexScore: g.lexScore, cosScore: g.cosScore });
  }
  out.sort((a, b) => b.score - a.score);
  return { out, cosSpan, cosMin, denseInformative, gathered };
}

// ── challengers ────────────────────────────────────────────────────────────
// All challengers consume the SAME two base rankings the shipped fusion sees:
//  lexRanking  — store.lexicalSearch(need, 30) order (bm25 best-first, real).
//  denseRanking — every stored vec by real cosine desc, ties broken by
//                 loadVecs() key order (same stable-sort convention).
const buildRankings = (lexResults, needVec) => {
  const lexRanking = lexResults.map((l) => l.id); // already bm25-ordered
  const dense = [];
  for (const [id, v] of storedVecs) {
    dense.push({ id, cos: v.length === needVec.length ? cosine(needVec, v) : -Infinity });
  }
  dense.sort((a, b) => b.cos - a.cos);
  return {
    lexRanking,
    denseRanking: dense.map((d) => d.id),
    lexScoreById: new Map(lexResults.map((l) => [l.id, l.lexScore])),
    cosById: new Map(dense.map((d) => [d.id, d.cos])),
    insertionOrder: (() => {
      // Same union order the shipped fusion uses, reused as the deterministic
      // tie-break for every challenger.
      const s = new Set(lexRanking);
      for (const id of storedVecs.keys()) s.add(id);
      return [...s];
    })(),
  };
};

/** Stable sort by score desc using the shipped insertion-order tie-break. */
const rankByScore = (scoreById, insertionOrder) =>
  insertionOrder
    .filter((id) => (scoreById.get(id) ?? 0) > 0)
    .map((id, i) => ({ id, score: scoreById.get(id), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.id);

/** RRF: sum over rankers of 1/(k + rank). Absent from a ranker contributes 0. */
const rrf = (R, k) => {
  const s = new Map();
  for (const ranking of [R.lexRanking, R.denseRanking]) {
    ranking.forEach((id, idx) => s.set(id, (s.get(id) ?? 0) + 1 / (k + idx + 1)));
  }
  return rankByScore(s, R.insertionOrder);
};

/**
 * z-score normalized weighted fusion — the direct "fix the scales properly"
 * alternative to min-max. Both channels are z-normalized over the SAME
 * candidate universe the shipped fusion scores (lexical union dense), using
 * the shipped missing-value convention (`lexScore ?? 0`).
 */
const zFuse = (R, wLex, wCos) => {
  const ids = R.insertionOrder;
  const lex = ids.map((id) => R.lexScoreById.get(id) ?? 0);
  const cos = ids.map((id) => R.cosById.get(id) ?? 0);
  const z = (xs) => {
    const m = mean(xs);
    const sd = Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))));
    return sd === 0 ? xs.map(() => 0) : xs.map((x) => (x - m) / sd);
  };
  const zl = z(lex);
  const zc = z(cos);
  const s = new Map();
  // Shift into positive territory so the `> 0` filter in rankByScore does not
  // silently drop below-average documents (a z-score fusion has no natural 0).
  const fused = ids.map((_, i) => wLex * zl[i] + wCos * zc[i]);
  const lo = Math.min(...fused);
  ids.forEach((id, i) => s.set(id, fused[i] - lo + 1e-6));
  return rankByScore(s, R.insertionOrder);
};

/** Rank-weighted Borda: points = (N - rank + 1)/N per ranker, absent = 0. */
const borda = (R, wLex, wCos) => {
  const s = new Map();
  const add = (ranking, w) => {
    const N = ranking.length;
    if (N === 0) return;
    ranking.forEach((id, idx) => s.set(id, (s.get(id) ?? 0) + w * ((N - idx) / N)));
  };
  add(R.lexRanking, wLex);
  add(R.denseRanking, wCos);
  return rankByScore(s, R.insertionOrder);
};

// ── arm definitions ────────────────────────────────────────────────────────
const CONTROL = "control_shipped_minmax_lex0.15_cos0.85";
const ARMS = [
  // control + references
  { id: CONTROL, kind: "control", fn: (R, ctx) => ctx.mirrorTop.slice() },
  { id: "ref_realstore_draftCandidates", kind: "reference", fn: (R, ctx) => ctx.realHybTop.slice() },
  { id: "ref_lexical_only", kind: "reference", fn: (R) => R.lexRanking.slice() },
  { id: "ref_dense_only", kind: "reference", fn: (R) => R.denseRanking.slice() },
  // challengers — the hypothesis under test
  ...[0, 1, 10, 20, 60].map((k) => ({ id: `rrf_k${k}`, kind: "challenger", fn: (R) => rrf(R, k) })),
  // RRF is sensitive to how deep each ranker goes: a doc absent from the
  // lexical list contributes 0 from that channel, so capping lexical at
  // production depth 30 is itself a design choice. These two arms rerun RRF
  // over an UNCAPPED lexical ranking to separate "RRF wins/loses" from
  // "lexical depth 30 wins/loses".
  { id: "rrf_k10_lexdepth_full", kind: "challenger", fn: (R, ctx) => rrf(ctx.Rdeep, 10) },
  { id: "rrf_k60_lexdepth_full", kind: "challenger", fn: (R, ctx) => rrf(ctx.Rdeep, 60) },
  { id: "zscore_lex0.15_cos0.85", kind: "challenger", fn: (R) => zFuse(R, 0.15, 0.85) },
  { id: "zscore_lex0.5_cos0.5", kind: "challenger", fn: (R) => zFuse(R, 0.5, 0.5) },
  { id: "borda_lex0.15_cos0.85", kind: "challenger", fn: (R) => borda(R, 0.15, 0.85) },
  { id: "borda_lex0.5_cos0.5", kind: "challenger", fn: (R) => borda(R, 0.5, 0.5) },
];

// ── main loop ──────────────────────────────────────────────────────────────
const perArmRows = new Map(ARMS.map((a) => [a.id, []])); // scored at SCORE_DEPTH
const perArmRowsFull = new Map(ARMS.map((a) => [a.id, []])); // scored at full ranking depth
const perArmTop5 = new Map(ARMS.map((a) => [a.id, []]));
const perArmRankLen = new Map(ARMS.map((a) => [a.id, []]));
const perNeed = [];
const parityMismatches = [];
let parityEligible = 0;

const row = (n, ids) => ({
  style: n.style,
  hit1: hitAtK(ids, n.acceptable, 1),
  hit5: hitAtK(ids, n.acceptable, 5),
  rr: reciprocalRank(ids, n.primary),
});

for (let i = 0; i < NEEDS.length; i++) {
  const n = NEEDS[i];
  const nv = needVecs[i];

  // Real production draft (k=5) — the parity target.
  const realHyb5 = store.draftCandidates(n.need, 5, nv);
  const realHybTop5 = rankedIds(realHyb5);
  // Full-depth real draft, score>0 only, so the reference arm has a ranking
  // comparable to the mirror's at full depth (the score-0 tail is ratedFallback
  // backfill, which is not a retrieval signal and must not earn MRR credit).
  const realHybTop = rankedIds(store.draftCandidates(n.need, TOOLS.length, nv).filter((c) => c.score > 0));

  // Real lexical channel at production depth for k=5.
  const lex30 = store.lexicalSearch(n.need, 30);
  const mirror = fuseMirror(lex30, nv, SHIPPED.lexWeight, SHIPPED.cosWeight, SHIPPED.minInformativeCosSpan);
  const mirrorTop = mirror.out.map((c) => c.id);
  const mirrorTop5 = mirrorTop.slice(0, 5);

  // PARITY ASSERTION: mirror top-5 == real draftCandidates top-5 wherever the
  // mirror produced >= 5 scored candidates (below that the real path backfills
  // by rating, which the mirror deliberately omits).
  if (mirror.out.length >= 5) {
    parityEligible++;
    if (mirrorTop5.join(",") !== realHybTop5.join(",")) {
      parityMismatches.push({ need: n.need, style: n.style, mirrorTop5, realHybTop5 });
    }
  }

  const R = buildRankings(lex30, nv);
  // Uncapped lexical ranking for the depth-sensitivity RRF arms.
  const Rdeep = buildRankings(store.lexicalSearch(n.need, TOOLS.length * 6), nv);
  const ctx = { mirrorTop, realHybTop, realHybTop5, Rdeep };

  const top5ByArm = {};
  for (const arm of ARMS) {
    const ranked = arm.fn(R, ctx);
    const top5 = ranked.slice(0, 5);
    // Uniform scoring depth for the headline table.
    perArmRows.get(arm.id).push(row(n, ranked.slice(0, SCORE_DEPTH)));
    perArmRowsFull.get(arm.id).push(row(n, ranked));
    perArmRankLen.get(arm.id).push(ranked.length);
    perArmTop5.get(arm.id).push(top5);
    top5ByArm[arm.id] = top5;
  }

  perNeed.push({
    need: n.need,
    style: n.style,
    lexCandidates: lex30.length,
    cosSpan: +mirror.cosSpan.toFixed(4),
    abstainedAtShipped: !mirror.denseInformative,
    maxCos: +Math.max(...[...storedVecs.values()].map((v) => cosine(nv, v))).toFixed(4),
    bestAcceptableCos: +Math.max(
      ...n.acceptable.map((id) => {
        const v = storedVecs.get(id);
        return v ? cosine(nv, v) : -1;
      }),
    ).toFixed(4),
    mirrorScoredCandidates: mirror.out.length,
    top5ByArm,
  });
}

results.parity = {
  target: "store.draftCandidates(need, 5, needVec) top-5 (REAL production path)",
  eligibleNeeds: parityEligible,
  totalNeeds: NEEDS.length,
  mismatches: parityMismatches.length,
  detail: parityMismatches.slice(0, 5),
  asserted: parityMismatches.length === 0,
  note:
    "Needs where the mirror yielded < 5 scored candidates are excluded: there the real path " +
    "backfills from ratedFallback(), which the mirror omits by design.",
};
if (parityMismatches.length > 0) {
  console.error(
    `\nPARITY FAILED: ${parityMismatches.length}/${parityEligible} needs disagree. ` +
      `Every fusion arm is suspect; results written for debugging only.\n`,
  );
  console.error(JSON.stringify(parityMismatches.slice(0, 3), null, 2));
}

// A second, INDEPENDENT parity check at the metric level: the mirror control
// and the real-store reference must produce byte-identical top-5s on every
// need, hence identical hit@1/hit@5/MRR@5. This catches a mirror that agrees
// on ids but disagrees on order.
{
  const ctl = perArmTop5.get(CONTROL);
  const real = perArmTop5.get("ref_realstore_draftCandidates");
  const disagree = ctl.map((t, i) => [i, t, real[i]]).filter(([, a, b]) => a.join(",") !== b.join(","));
  results.parity.metricLevel = {
    top5Disagreements: disagree.length,
    detail: disagree.slice(0, 5).map(([i, a, b]) => ({ need: NEEDS[i].need, control: a, realStore: b })),
    note:
      "control (fuseMirror at shipped config, full ranking truncated to SCORE_DEPTH) vs " +
      "ref_realstore (real draftCandidates full-depth, score>0, truncated to SCORE_DEPTH). " +
      "Unlike the k=5 parity check above this one has no eligibility filter.",
  };
}

// ── metrics per arm ────────────────────────────────────────────────────────
results.arms = {};
for (const arm of ARMS) {
  const lens = perArmRankLen.get(arm.id);
  results.arms[arm.id] = {
    kind: arm.kind,
    ...summarize(perArmRows.get(arm.id)),
    fullDepth: summarize(perArmRowsFull.get(arm.id)).overall,
    rankingLength: { mean: +mean(lens).toFixed(1), min: Math.min(...lens), max: Math.max(...lens) },
  };
}

// ── paired comparisons vs the shipped control ──────────────────────────────
const ctlRows = perArmRows.get(CONTROL);
const ctlRowsFull = perArmRowsFull.get(CONTROL);
const vec = (rows, key) => rows.map((r) => r[key]);
results.pairedVsControl = {};
let seedTick = SEED;
for (const arm of ARMS) {
  if (arm.id === CONTROL) continue;
  const rows = perArmRows.get(arm.id);
  const rowsFull = perArmRowsFull.get(arm.id);
  results.pairedVsControl[arm.id] = {
    kind: arm.kind,
    hit1: {
      ...pairedBootstrapDiff(vec(rows, "hit1"), vec(ctlRows, "hit1"), RESAMPLES, seedTick++),
      mcnemar: mcnemarExact(vec(rows, "hit1"), vec(ctlRows, "hit1")),
    },
    hit5: {
      ...pairedBootstrapDiff(vec(rows, "hit5"), vec(ctlRows, "hit5"), RESAMPLES, seedTick++),
      mcnemar: mcnemarExact(vec(rows, "hit5"), vec(ctlRows, "hit5")),
    },
    mrr: pairedBootstrapDiff(vec(rows, "rr"), vec(ctlRows, "rr"), RESAMPLES, seedTick++),
    // Full-depth MRR is the higher-resolution view: MRR@5 is quantized to
    // {0, .2, .25, .333, .5, 1} and hides movement below rank 5 on only 66 needs.
    mrrFullDepth: pairedBootstrapDiff(vec(rowsFull, "rr"), vec(ctlRowsFull, "rr"), RESAMPLES, seedTick++),
    identicalTop5ToControl: perArmTop5
      .get(arm.id)
      .filter((t, i) => t.join(",") === perArmTop5.get(CONTROL)[i].join(",")).length,
  };
}

// ── structural diagnostics that govern how to READ the RRF arms ────────────
// RRF can only reorder documents relative to the dense list where the two
// rankers disagree, and the lexical ranker here is SHALLOW (an FTS5 OR-match
// over content tokens). If the lexical list averages ~8 of 133 docs, then
// beyond rank ~8 every RRF arm is dense-only order with a monotone rescale —
// RRF's whole leverage is confined to that head. Report it explicitly so
// nobody reads a flat RRF result as "rank fusion does not work".
{
  const lexCounts = perNeed.map((p) => p.lexCandidates);
  const capped = lexCounts.filter((c) => c >= results.meta.lexicalDepth).length;
  results.lexicalChannelDiagnostics = {
    lexCandidatesPerNeed: {
      min: Math.min(...lexCounts),
      max: Math.max(...lexCounts),
      mean: +mean(lexCounts).toFixed(2),
      deciles: Object.fromEntries(
        [0, 25, 50, 75, 90, 100].map((p) => [`p${p}`, percentile(lexCounts, p)]),
      ),
    },
    needsWithZeroLexCandidates: lexCounts.filter((c) => c === 0).length,
    needsHittingTheDepth30Cap: capped,
    depthSensitivityArmsAreInformative: capped > 0,
    depthSensitivityNote:
      capped === 0
        ? "The lexicalSearch(need, 30) LIMIT is NEVER reached on this corpus (the FTS5 OR-match " +
          "set is smaller than the cap for every need), so rrf_*_lexdepth_full is PROVABLY " +
          "IDENTICAL to rrf_* here. Those two arms are a null control, not evidence about depth."
        : `${capped} needs hit the depth-30 cap, so rrf_*_lexdepth_full is a meaningful contrast.`,
    rrfLeverageNote:
      "Docs absent from the lexical ranking get 0 from that channel, so their RRF score is " +
      "1/(k + denseRank) — strictly monotone in dense rank. RRF therefore differs from dense-only " +
      "ONLY in how it interleaves the ~" +
      +mean(lexCounts).toFixed(1) +
      " lexical docs into the dense order.",
  };
}

// ── decision rule, applied mechanically to the numbers above ───────────────
// Adopt a challenger ONLY if hit@1 and MRR both improve AND both paired 95%
// CIs exclude 0. A CI straddling 0 is a TIE and a tie does not justify churn.
const CHALLENGER_COUNT = ARMS.filter((a) => a.kind === "challenger").length;
results.decision = {
  rule:
    "adopt a challenger iff observedDiff(hit@1) > 0 AND observedDiff(MRR@" +
    SCORE_DEPTH +
    ") > 0 AND both paired 95% bootstrap CIs exclude 0; otherwise KEEP the shipped fusion " +
    "(a tie does not justify churn)",
  // Multiplicity: with this many arms tested against one control on 66 needs,
  // an unadjusted 95% CI will exclude 0 by chance for roughly one arm in a
  // family of 13 even under a true null. rrf_k60 is PRE-REGISTERED as the
  // primary arm (k=60 is the Cormack/Clarke/Buettcher 2009 default); every
  // other arm is EXPLORATORY and must not be adopted on its unadjusted CI
  // alone. bonferroniAlpha below is the corrected level if you insist on
  // scanning the family.
  primaryArm: "rrf_k60",
  challengerArms: CHALLENGER_COUNT,
  multiplicityWarning:
    `${CHALLENGER_COUNT} challenger arms share one control on ${NEEDS.length} needs. Only ` +
    "the pre-registered primary arm (rrf_k60) may be adopted on an unadjusted 95% CI. " +
    "Treat every other ADOPT below as a hypothesis for a fresh run, not a result.",
  bonferroniAlpha: +(0.05 / CHALLENGER_COUNT).toFixed(5),
  evidenceIsReal: EMBEDDER === "real",
  perArm: {},
};
for (const [id, cmp] of Object.entries(results.pairedVsControl)) {
  if (cmp.kind !== "challenger") continue;
  const adopt =
    cmp.hit1.observedDiff > 0 &&
    cmp.mrr.observedDiff > 0 &&
    cmp.hit1.excludesZero &&
    cmp.mrr.excludesZero;
  results.decision.perArm[id] = {
    hit1Diff: cmp.hit1.observedDiff,
    hit1Ci: cmp.hit1.ci95,
    mrrDiff: cmp.mrr.observedDiff,
    mrrCi: cmp.mrr.ci95,
    mrrFullDepthDiff: cmp.mrrFullDepth.observedDiff,
    mrrFullDepthCi: cmp.mrrFullDepth.ci95,
    mcnemarHit1: `${cmp.hit1.mcnemar.controlWins}/${cmp.hit1.mcnemar.armWins} p=${cmp.hit1.mcnemar.pExact}`,
    verdict: adopt ? "ADOPT" : "KEEP_SHIPPED",
  };
}
results.decision.anyAdopt = Object.values(results.decision.perArm).some((v) => v.verdict === "ADOPT");
results.decision.primaryArmVerdict = results.decision.perArm[results.decision.primaryArm]?.verdict ?? "MISSING";
results.decision.headline =
  results.decision.primaryArmVerdict === "ADOPT"
    ? "PRE-REGISTERED PRIMARY ARM rrf_k60 BEATS the shipped fusion on both hit@1 and MRR with CIs excluding 0."
    : "PRE-REGISTERED PRIMARY ARM rrf_k60 does NOT clear the bar — KEEP the shipped weighted min-max fusion.";
if (EMBEDDER !== "real") {
  results.decision.WARNING =
    "embedderMode != real — these verdicts are mechanical output over meaningless vectors and " +
    "MUST NOT be used to change the shipped fusion.";
}

// ── span/abstain diagnostics (context for interpreting the dense channel) ──
const spans = perNeed.map((p) => p.cosSpan);
results.spanDistribution = {
  deciles: Object.fromEntries(
    [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((p) => [`p${p}`, +percentile(spans, p).toFixed(4)]),
  ),
  mean: +mean(spans).toFixed(4),
  abstainRateAtShippedGate: +(
    spans.filter((s) => s < SHIPPED.minInformativeCosSpan).length / spans.length
  ).toFixed(4),
  abstainedNeeds: perNeed.filter((p) => p.abstainedAtShipped).map((p) => p.need),
};

results.perNeed = perNeed;
results.meta.finishedAt = new Date().toISOString();

await provider.dispose();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

// ── console digest ─────────────────────────────────────────────────────────
console.log(`embedder=${EMBEDDER}  model=${results.meta.model}  dims=${results.meta.sanity.dims}`);
console.log(
  `sanity dog~puppy=${results.meta.sanity.cosDogPuppy} dog~qft=${results.meta.sanity.cosDogQft}` +
    `${results.meta.sanity.enforced ? " (enforced)" : " (NOT enforced — stub)"}`,
);
console.log(`tool embed ${results.meta.toolEmbedMs}ms  need embed ${results.meta.needEmbedMs}ms`);
console.log(
  `PARITY mirror-vs-real (k=5 top-5): ${results.parity.mismatches} mismatches over ` +
    `${results.parity.eligibleNeeds}/${results.parity.totalNeeds} eligible needs` +
    `${results.parity.asserted ? "  ✓ asserted" : "  ✗ FAILED"}`,
);
console.log(
  `PARITY metric-level (control vs ref_realstore top-5, all 66 needs): ` +
    `${results.parity.metricLevel.top5Disagreements} disagreements`,
);
console.log(`abstain rate @ span ${SHIPPED.minInformativeCosSpan}: ${results.spanDistribution.abstainRateAtShippedGate}`);
console.log(`score depth ${SCORE_DEPTH}  bootstrap resamples ${RESAMPLES}  seed ${SEED}`);
console.log("");
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("ARM", 40)} ${pad("kind", 11)} hit@1  hit@5  MRR@${SCORE_DEPTH}  MRRfull  rankLen`);
for (const [id, s] of Object.entries(results.arms)) {
  console.log(
    `${pad(id, 40)} ${pad(s.kind, 11)} ${pad(s.overall.hit1, 6)} ${pad(s.overall.hit5, 6)} ` +
      `${pad(s.overall.mrr, 7)} ${pad(s.fullDepth.mrr, 8)} ${s.rankingLength.mean}`,
  );
}
console.log("");
console.log(
  `${pad("ARM vs CONTROL", 40)} ${pad("dhit@1 [CI95]", 26)} ${pad("dMRR@" + SCORE_DEPTH + " [CI95]", 26)} ` +
    `${pad("dMRRfull [CI95]", 26)} McNemar(hit@1) ctl/arm p`,
);
for (const [id, c] of Object.entries(results.pairedVsControl)) {
  console.log(
    `${pad(id, 40)} ${pad(`${c.hit1.observedDiff} [${c.hit1.ci95[0]},${c.hit1.ci95[1]}]`, 26)} ` +
      `${pad(`${c.mrr.observedDiff} [${c.mrr.ci95[0]},${c.mrr.ci95[1]}]`, 26)} ` +
      `${pad(`${c.mrrFullDepth.observedDiff} [${c.mrrFullDepth.ci95[0]},${c.mrrFullDepth.ci95[1]}]`, 26)} ` +
      `${c.hit1.mcnemar.controlWins}/${c.hit1.mcnemar.armWins} p=${c.hit1.mcnemar.pExact}`,
  );
}
console.log("");
console.log(
  `lexical channel: ${results.lexicalChannelDiagnostics.lexCandidatesPerNeed.mean} docs/need ` +
    `(max ${results.lexicalChannelDiagnostics.lexCandidatesPerNeed.max}), ` +
    `${results.lexicalChannelDiagnostics.needsWithZeroLexCandidates} needs with none, ` +
    `${results.lexicalChannelDiagnostics.needsHittingTheDepth30Cap} needs hit the depth-30 cap`,
);
if (!results.lexicalChannelDiagnostics.depthSensitivityArmsAreInformative) {
  console.log(`  NOTE: ${results.lexicalChannelDiagnostics.depthSensitivityNote}`);
}
console.log("");
for (const [id, d] of Object.entries(results.decision.perArm)) {
  console.log(`decision ${pad(id, 30)} ${pad(d.verdict, 14)}${id === results.decision.primaryArm ? "  <-- PRE-REGISTERED PRIMARY" : "  (exploratory)"}`);
}
console.log(`\n${results.decision.headline}`);
console.log(`multiplicity: ${results.decision.multiplicityWarning}`);
console.log(`\nresults → ${OUT}`);
if (EMBEDDER === "stub") {
  const bar = "=".repeat(78);
  console.log(
    `\n${bar}\n!!  REMINDER: STUB EMBEDDER. The table above is a HARNESS SELF-TEST.\n` +
      `!!  It says NOTHING about whether RRF beats the shipped fusion.\n${bar}\n`,
  );
}

// Exit code policy: this script MEASURES, it never gates on the verdict — an
// ADOPT and a KEEP_SHIPPED both exit 0. It exits NON-ZERO only when its own
// numbers would be untrustworthy, i.e. when the control arm is provably not the
// shipped fusion. Results are already written, so a failing run is debuggable.
if (!results.parity.asserted || results.parity.metricLevel.top5Disagreements > 0) {
  console.error(
    `\nFATAL: fusion parity broken (${results.parity.mismatches} k=5 mismatches, ` +
      `${results.parity.metricLevel.top5Disagreements} metric-level disagreements). ` +
      `fuseMirror() no longer reproduces store.draftCandidates(), so the control arm is NOT the ` +
      `shipped fusion and every comparison above is void. Fix the mirror against store.ts before ` +
      `drawing any conclusion.`,
  );
  process.exitCode = 1;
}
