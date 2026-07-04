#!/usr/bin/env node
/**
 * Retrieval quality + fusion calibration with REAL MiniLM inference.
 *
 * Question: is the shipped hybrid fusion (0.3 lex / 0.7 cos, dense abstain
 * below cosine span 0.15) the right calibration for MiniLM on a realistic
 * 133-tool corpus, measured against 66 ground-truthed needs?
 *
 * Method:
 *  - Real TransformersEmbeddings(MINILM_MODEL) via transformers.js (q8 ONNX).
 *  - Tool cards embedded EXACTLY like packages/cli/src/serve.ts:116 —
 *    `${name}\n${description}\n${body ?? ""}`.slice(0,2000), kind "document",
 *    batches of 16. Needs embedded like serve.ts:141, kind "query".
 *  - Base vecs stored in a real CoachStore (in-memory SQLite via openCoachDb).
 *  - (a) shipped behavior: store.draftCandidates(need, 5) lexical-only vs
 *    store.draftCandidates(need, 5, needVec) hybrid — hit@1/hit@5/MRR.
 *  - (b) weight sweep: fusion weights are module constants in store.ts, so the
 *    sweep uses fuseMirror() below, a line-faithful REIMPLEMENTATION of the
 *    fusion arithmetic in store.ts draftCandidates (pass 1 + pass 2, same
 *    candidate-set construction, same min-max normalization, same abstain,
 *    same score>0 filter, same stable sort; only the rated fallback backfill
 *    is omitted). Inputs are the store's REAL lexicalSearch scores and REAL
 *    cosines against store.loadVecs(). Parity with the real draftCandidates is
 *    asserted at the shipped configuration before the sweep is trusted.
 *  - (c) per-draft cosine span distribution + abstain rate at 0.15; threshold
 *    sweep 0 → 0.40 step 0.05 at shipped weights.
 *  - (d) full-depth rank regressions hybrid vs lexical-only (rank of the best
 *    acceptable tool among score>0 candidates, k=133).
 *
 * hit@k is scored against `acceptable`, MRR against `primary`, per needs.mjs.
 * Run from repo root: node docs/lab/exp-retrieval-minilm.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "./corpus.mjs";
import { NEEDS } from "./needs.mjs";
import { rankedIds, hitAtK, reciprocalRank, mean, percentile, summarize } from "./metrics.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const coach = await import(
  createRequire(path.join(repo, "packages/cli/package.json")).resolve("@rosterhq/coach")
);
const { CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL, cosine } = coach;

const results = {
  meta: {
    startedAt: new Date().toISOString(),
    model: MINILM_MODEL,
    node: process.version,
    corpusTools: TOOLS.length,
    needs: NEEDS.length,
    shipped: { lexWeight: 0.3, cosWeight: 0.7, minInformativeCosSpan: 0.15 },
    toolTextRule: "serve.ts:116 `${name}\\n${description}\\n${body ?? ''}`.slice(0,2000), kind=document",
    needTextRule: "serve.ts:141 raw need, kind=query",
  },
};

// ── setup: real store, real embeddings ─────────────────────────────────────
const store = new CoachStore(openCoachDb(":memory:"));
store.upsertCapabilities(TOOLS);

const provider = new TransformersEmbeddings(MINILM_MODEL);

// Provider health probe (mirrors dense-live.mjs): related words must beat unrelated.
{
  const [dog, puppy, qft] = await provider.embed(["dog", "puppy", "quantum field theory"]);
  results.meta.sanity = {
    cosDogPuppy: +cosine(dog, puppy).toFixed(4),
    cosDogQft: +cosine(dog, qft).toFixed(4),
    dims: dog.length,
  };
  if (!(results.meta.sanity.cosDogPuppy > results.meta.sanity.cosDogQft)) {
    throw new Error("provider sanity probe failed — aborting rather than reporting noise");
  }
}

// Embed tool cards exactly like the serve warmup path (batch 16, document kind).
const toolTexts = TOOLS.map((e) => `${e.name}\n${e.description}\n${e.body ?? ""}`.slice(0, 2000));
let t0 = Date.now();
const toolVecs = [];
for (let i = 0; i < toolTexts.length; i += 16) {
  toolVecs.push(...(await provider.embed(toolTexts.slice(i, i + 16), "document")));
}
results.meta.toolEmbedMs = Date.now() - t0;
TOOLS.forEach((t, i) => store.storeBaseVec(t.id, toolVecs[i]));

// Embed needs like the serve draft path (query kind).
t0 = Date.now();
const needVecs = [];
for (let i = 0; i < NEEDS.length; i += 16) {
  needVecs.push(...(await provider.embed(NEEDS.slice(i, i + 16).map((n) => n.need), "query")));
}
results.meta.needEmbedMs = Date.now() - t0;

// The vectors drafts actually use (normalized, adj??base — here all base).
const storedVecs = store.loadVecs();
if (storedVecs.size !== TOOLS.length) throw new Error(`expected ${TOOLS.length} stored vecs, got ${storedVecs.size}`);

// ── fusion mirror (states clearly: mirrors store.ts draftCandidates fusion) ─
// Line-faithful copy of store.ts pass 1+2 (lines ~490-535), with weights and
// minSpan as parameters instead of module constants. No rated fallback.
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
  return { out, cosSpan, denseInformative };
}

const row = (n, ids) => ({
  style: n.style,
  hit1: hitAtK(ids, n.acceptable, 1),
  hit5: hitAtK(ids, n.acceptable, 5),
  rr: reciprocalRank(ids, n.primary),
});

// Rank of best acceptable among score>0 candidates only (fallback = score 0).
const scoredRank = (cands, acceptable) => {
  const ids = rankedIds(cands.filter((c) => c.score > 0));
  const idx = ids.findIndex((id) => acceptable.includes(id));
  return idx === -1 ? null : idx + 1;
};

// ── (a) shipped behavior: real draftCandidates, k=5 ────────────────────────
const rowsLex = [];
const rowsHyb = [];
const perNeed = [];
const lexLatencies = [];
const hybLatencies = [];
let parityMismatches = [];

for (let i = 0; i < NEEDS.length; i++) {
  const n = NEEDS[i];
  const nv = needVecs[i];

  let s = performance.now();
  const lex5 = store.draftCandidates(n.need, 5);
  lexLatencies.push(performance.now() - s);
  s = performance.now();
  const hyb5 = store.draftCandidates(n.need, 5, nv);
  hybLatencies.push(performance.now() - s);

  const lexIds = rankedIds(lex5);
  const hybIds = rankedIds(hyb5);
  rowsLex.push(row(n, lexIds));
  rowsHyb.push(row(n, hybIds));

  // (d) full-depth ranks for regression counting.
  const lexFull = store.draftCandidates(n.need, TOOLS.length);
  const hybFull = store.draftCandidates(n.need, TOOLS.length, nv);
  const lexRank = scoredRank(lexFull, n.acceptable);
  const hybRank = scoredRank(hybFull, n.acceptable);

  // (c) span the real draft saw (mirror at shipped config for span + parity).
  const lex30 = store.lexicalSearch(n.need, 30);
  const mirror = fuseMirror(lex30, nv, 0.3, 0.7, 0.15);
  const mirrorTop5 = mirror.out.slice(0, 5).map((c) => c.id);
  // Parity: real hybrid top-5 must equal mirror top-5 wherever the mirror
  // produced >= 5 scored candidates (below that the real path backfills).
  if (mirror.out.length >= 5 && mirrorTop5.join(",") !== hybIds.join(",")) {
    parityMismatches.push({ need: n.need, mirrorTop5, hybIds });
  }

  const accCos = Math.max(...n.acceptable.map((id) => {
    const v = storedVecs.get(id);
    return v ? cosine(nv, v) : -1;
  }));
  perNeed.push({
    need: n.need,
    style: n.style,
    cosSpan: +mirror.cosSpan.toFixed(4),
    abstainedAtShipped: !mirror.denseInformative,
    maxCos: +Math.max(...[...storedVecs.values()].map((v) => cosine(nv, v))).toFixed(4),
    bestAcceptableCos: +accCos.toFixed(4),
    lexTop5: lexIds,
    hybTop5: hybIds,
    lexRankFull: lexRank,
    hybRankFull: hybRank,
    lexHit5: rowsLex[i].hit5,
    hybHit5: rowsHyb[i].hit5,
  });
}

results.parity = {
  mismatches: parityMismatches.length,
  detail: parityMismatches.slice(0, 5),
  note: "mirror top-5 vs real draftCandidates top-5 at shipped config, needs with >=5 scored candidates",
};
results.shippedDraftK5 = {
  lexicalOnly: summarize(rowsLex),
  hybrid: summarize(rowsHyb),
  draftLatencyMs: {
    lex: { mean: +mean(lexLatencies).toFixed(2), p95: +percentile(lexLatencies, 95).toFixed(2) },
    hyb: { mean: +mean(hybLatencies).toFixed(2), p95: +percentile(hybLatencies, 95).toFixed(2) },
  },
};

// ── (d) regressions: hybrid ranks best acceptable WORSE than lexical ───────
const INF = 1e9;
const regressions = perNeed.filter((p) => (p.hybRankFull ?? INF) > (p.lexRankFull ?? INF));
const improvements = perNeed.filter((p) => (p.hybRankFull ?? INF) < (p.lexRankFull ?? INF));
results.rankMovement = {
  regressions: regressions.length,
  improvements: improvements.length,
  unchanged: NEEDS.length - regressions.length - improvements.length,
  hit5Losses: perNeed.filter((p) => p.lexHit5 === 1 && p.hybHit5 === 0).length,
  hit5Gains: perNeed.filter((p) => p.lexHit5 === 0 && p.hybHit5 === 1).length,
  regressionDetail: regressions.map((p) => ({
    need: p.need, style: p.style, lexRank: p.lexRankFull, hybRank: p.hybRankFull,
    cosSpan: p.cosSpan, bestAcceptableCos: p.bestAcceptableCos, maxCos: p.maxCos, hybTop5: p.hybTop5,
  })),
};

// ── (b) weight sweep (mirrored fusion; real lexScores + real cosines) ──────
const WEIGHTS = [[1, 0], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.2, 0.8], [0.15, 0.85], [0.1, 0.9], [0, 1]];
const lex30ByNeed = NEEDS.map((n) => store.lexicalSearch(n.need, 30));
const sweepCell = (wLex, wCos, minSpan) => {
  const rows = NEEDS.map((n, i) => {
    const { out } = fuseMirror(lex30ByNeed[i], needVecs[i], wLex, wCos, minSpan);
    return row(n, out.slice(0, 5).map((c) => c.id));
  });
  return summarize(rows);
};
results.weightSweep = {};
for (const minSpan of [0.15, 0]) {
  for (const [wLex, wCos] of WEIGHTS) {
    results.weightSweep[`lex${wLex}_cos${wCos}_abstain${minSpan}`] = sweepCell(wLex, wCos, minSpan);
  }
}

// ── (c) span distribution + threshold sweep ────────────────────────────────
const spans = perNeed.map((p) => p.cosSpan);
results.spanDistribution = {
  deciles: Object.fromEntries(
    [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((p) => [`p${p}`, +percentile(spans, p).toFixed(4)]),
  ),
  mean: +mean(spans).toFixed(4),
  abstainRateAt015: +(spans.filter((s) => s < 0.15).length / spans.length).toFixed(4),
  abstainedNeeds: perNeed.filter((p) => p.abstainedAtShipped).map((p) => p.need),
};
results.thresholdSweep = [];
for (let t = 0; t <= 0.401; t += 0.05) {
  const thr = +t.toFixed(2);
  const cell = sweepCell(0.3, 0.7, thr);
  results.thresholdSweep.push({
    threshold: thr,
    abstainRate: +(spans.filter((s) => s < thr).length / spans.length).toFixed(3),
    hit1: cell.overall.hit1,
    hit5: cell.overall.hit5,
    mrr: cell.overall.mrr,
  });
}

// Paired per-need comparison: pure cosine (0/1) vs shipped (0.3/0.7), by RR
// against primary and hit@5 against acceptable — is the sweep delta driven by
// a consistent trend or by 2-3 needs?
{
  const paired = { rrWins01: 0, rrWins0307: 0, rrTies: 0, hit5Wins01: 0, hit5Wins0307: 0, hit5Ties: 0 };
  NEEDS.forEach((n, i) => {
    const a = fuseMirror(lex30ByNeed[i], needVecs[i], 0, 1, 0.15).out.slice(0, 5).map((c) => c.id);
    const b = fuseMirror(lex30ByNeed[i], needVecs[i], 0.3, 0.7, 0.15).out.slice(0, 5).map((c) => c.id);
    const rrA = reciprocalRank(a, n.primary);
    const rrB = reciprocalRank(b, n.primary);
    if (rrA > rrB) paired.rrWins01 += 1; else if (rrB > rrA) paired.rrWins0307 += 1; else paired.rrTies += 1;
    const hA = hitAtK(a, n.acceptable, 5);
    const hB = hitAtK(b, n.acceptable, 5);
    if (hA > hB) paired.hit5Wins01 += 1; else if (hB > hA) paired.hit5Wins0307 += 1; else paired.hit5Ties += 1;
  });
  results.pairedPureCosVsShipped = paired;
}

// Alternative informativeness gate: dense abstains when max ABSOLUTE cosine
// across candidates is below t (span gate stays off). Motivated by the
// regression pattern: every hybrid regression has low maxCos while span stays
// high, so the shipped span gate cannot catch them. PROPOSAL-grade measurement.
function fuseMaxCosGate(lexResults, needVec, wLex, wCos, maxCosGate) {
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
  const cosMax = cosVals.length > 0 ? Math.max(...cosVals) : 0;
  const cosSpan = cosMax - cosMin;
  const denseInformative = cosVals.length > 1 && cosSpan > 0 && cosMax >= maxCosGate;
  const out = [];
  for (const g of gathered) {
    let score;
    if (denseInformative && g.cosScore !== null) {
      const cosNorm = (g.cosScore - cosMin) / cosSpan;
      score = wLex * (g.lexScore ?? 0) + wCos * cosNorm;
    } else {
      score = g.lexScore ?? 0;
    }
    if (score > 0) out.push({ id: g.id, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
results.maxCosGateSweep = [];
for (const gate of [0, 0.2, 0.25, 0.3, 0.35, 0.4]) {
  for (const [wLex, wCos] of [[0.3, 0.7], [0, 1]]) {
    const rows = NEEDS.map((n, i) => {
      const out = fuseMaxCosGate(lex30ByNeed[i], needVecs[i], wLex, wCos, gate);
      return row(n, out.slice(0, 5).map((c) => c.id));
    });
    const s = summarize(rows);
    results.maxCosGateSweep.push({
      gate, wLex, wCos,
      abstainRate: +(perNeed.filter((p) => p.maxCos < gate).length / NEEDS.length).toFixed(3),
      hit1: s.overall.hit1, hit5: s.overall.hit5, mrr: s.overall.mrr,
    });
  }
}

// maxCos distribution + movement-group means (does maxCos separate the needs
// dense helped from the needs it hurt?).
{
  const maxCosAll = perNeed.map((p) => p.maxCos);
  const groupMean = (ps) => (ps.length ? +mean(ps.map((p) => p.maxCos)).toFixed(4) : null);
  results.maxCosDiagnostics = {
    deciles: Object.fromEntries(
      [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((p) => [`p${p}`, +percentile(maxCosAll, p).toFixed(4)]),
    ),
    meanWhereHybridImproved: groupMean(improvements),
    meanWhereHybridRegressed: groupMean(regressions),
    meanWhereUnchanged: groupMean(perNeed.filter((p) => (p.hybRankFull ?? INF) === (p.lexRankFull ?? INF))),
  };
}

results.perNeed = perNeed;
results.meta.finishedAt = new Date().toISOString();

await provider.dispose();
fs.writeFileSync(path.join(here, "results-retrieval-minilm.json"), JSON.stringify(results, null, 2));

// Console digest
const fmt = (s) => `hit@1 ${s.overall.hit1}  hit@5 ${s.overall.hit5}  MRR ${s.overall.mrr}  (n=${s.overall.n})`;
console.log(`model ${MINILM_MODEL}  dims ${results.meta.sanity.dims}  sanity dog~puppy=${results.meta.sanity.cosDogPuppy} dog~qft=${results.meta.sanity.cosDogQft}`);
console.log(`tool embed ${results.meta.toolEmbedMs}ms  need embed ${results.meta.needEmbedMs}ms  parity mismatches ${results.parity.mismatches}`);
console.log(`LEX-ONLY  ${fmt(results.shippedDraftK5.lexicalOnly)}`);
console.log(`HYBRID    ${fmt(results.shippedDraftK5.hybrid)}`);
console.log(`span deciles ${JSON.stringify(results.spanDistribution.deciles)}`);
console.log(`abstain@0.15 rate ${results.spanDistribution.abstainRateAt015}`);
console.log(`movement: ${results.rankMovement.improvements} improved / ${results.rankMovement.regressions} regressed / ${results.rankMovement.unchanged} unchanged; hit5 losses ${results.rankMovement.hit5Losses} gains ${results.rankMovement.hit5Gains}`);
for (const [k, v] of Object.entries(results.weightSweep)) console.log(`sweep ${k}  ${fmt(v)}`);
for (const r of results.thresholdSweep) console.log(`thr ${r.threshold}  abstain ${r.abstainRate}  hit1 ${r.hit1}  hit5 ${r.hit5}  mrr ${r.mrr}`);
console.log("results → docs/lab/results-retrieval-minilm.json");
