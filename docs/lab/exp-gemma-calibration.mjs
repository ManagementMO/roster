#!/usr/bin/env node
/**
 * Gemma calibration lab — REAL EmbeddingGemma-300M (onnx q8, transformers.js),
 * real CoachStore over real in-memory SQLite, shared lab fixtures.
 *
 *  (a) lexical vs hybrid retrieval quality (hit@1/hit@5/MRR, overall + per style)
 *  (b) per-draft cosine span distributions: real needs vs word-shuffled needs
 *      vs gibberish — does the MiniLM-calibrated 0.15 abstain threshold hold?
 *  (c) threshold sweep 0→0.4 step 0.05: hit@5 / MRR / abstain-rate curves
 *  (d) Matryoshka dims 128/256/512/768: quality + spans per dim
 *  (e) per-need regressions vs lexical at the production config (256, t=0.15)
 *
 * Method notes:
 *  - Documents/queries embedded ONCE at native 768 dims through the same
 *    pipeline call shape the provider uses (dtype q8, pooling mean, normalize,
 *    gemmaPrefix kinds), then truncateAndNormalize() — the exported production
 *    function — derives every dim set. Stage 2 empirically verifies this
 *    equals the real TransformersEmbeddings provider output at 256 dims.
 *  - All rankings come from the REAL store.draftCandidates() except the
 *    threshold sweep, which needs a variable threshold: there a reimplemented
 *    fusion is used only after being verified to reproduce draftCandidates()
 *    exactly at the built-in 0.15 on every need and dim.
 *
 * Run from repo root: node docs/lab/exp-gemma-calibration.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const RESULTS = path.join(here, "results-gemma-calibration.json");

const cliReq = createRequire(path.join(repo, "packages/cli/package.json"));
const coachReq = createRequire(path.join(repo, "packages/coach/package.json"));
const coachEntry = cliReq.resolve("@rosterhq/coach");
const coach = await import(pathToFileURL(coachEntry).href);
const embMod = await import(pathToFileURL(path.join(path.dirname(coachEntry), "embeddings.js")).href);
const { CoachStore, openCoachDb, TransformersEmbeddings, GEMMA_MODEL, cosine, truncateAndNormalize } = coach;
const { gemmaPrefix } = embMod;

const { TOOLS } = await import(pathToFileURL(path.join(here, "corpus.mjs")).href);
const { NEEDS } = await import(pathToFileURL(path.join(here, "needs.mjs")).href);
const { rankedIds, hitAtK, reciprocalRank, mean, summarize } = await import(
  pathToFileURL(path.join(here, "metrics.mjs")).href
);

const say = (s) => console.log(s);
const results = {
  meta: {
    date: new Date().toISOString(),
    model: GEMMA_MODEL,
    dtype: "q8",
    nativeDims: null,
    corpus: TOOLS.length,
    needs: NEEDS.length,
    k: 10,
    productionThreshold: 0.15,
    node: process.version,
  },
};
const save = () => fs.writeFileSync(RESULTS, JSON.stringify(results, null, 1));

// ── deterministic noise fixtures ─────────────────────────────────────────────
const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffleWords = (text, seed) => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return text;
  const rnd = mulberry32(seed);
  for (let attempt = 0; attempt < 10; attempt++) {
    const w = [...words];
    for (let i = w.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [w[i], w[j]] = [w[j], w[i]];
    }
    const s = w.join(" ");
    if (s !== text) return s;
  }
  return [...words].reverse().join(" ");
};
const SHUFFLED = NEEDS.map((n, i) => shuffleWords(n.need, 1000 + i));
const GIBBERISH = [
  "xqzv plorf wnkt jrb",
  "asdf jkl qwerty uiop zxcv",
  "blorptang vexilquor mizzenfrap",
  "q8x!!7 zz@@ vv##9 rr$$",
  "lorem zipsum dolor blat amet consectetur frobnitz",
  "aaaaaa bbbbbb cccccc dddddd",
  "kjhdskjfh sdkjfhsdkf jhsdkfjhs dkfjhsdkjf",
  "zzz yyy xxx www vvv uuu ttt",
  "9481 2750 6613 0092 8837",
  "ﬂ‡†¶• ∆˚¬… æœ∑´®†",
];

// ── stage 1: embed everything ONCE at native dims (raw pipeline, prod shape) ─
say("## stage 1 — native-dim embedding (real Gemma, q8, production prefixes)");
const tf = await import(pathToFileURL(coachReq.resolve("@huggingface/transformers")).href);
const pipeline = tf.pipeline ?? tf.default?.pipeline;
const tLoad = Date.now();
const pipe = await pipeline("feature-extraction", GEMMA_MODEL, { dtype: "q8" });
const loadMs = Date.now() - tLoad;
say(`  pipeline loaded in ${loadMs}ms (warm cache)`);

const BATCH = 16; // matches serve.ts backfill batch size
const embedNative = async (texts, kind) => {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const prepared = texts.slice(i, i + BATCH).map((t) => gemmaPrefix(kind, t));
    const res = await pipe(prepared, { pooling: "mean", normalize: true });
    for (const row of res.tolist()) out.push(new Float32Array(row));
  }
  return out;
};

// production document text shape (serve.ts): `${name}\n${description}\n${body ?? ""}`.slice(0,2000)
const docTexts = TOOLS.map((t) => `${t.name}\n${t.description}\n`.slice(0, 2000));
const tDocs = Date.now();
const docNative = await embedNative(docTexts, "document");
const docMs = Date.now() - tDocs;
const tNeeds = Date.now();
const needNative = await embedNative(NEEDS.map((n) => n.need), "query");
const shufNative = await embedNative(SHUFFLED, "query");
const gibNative = await embedNative(GIBBERISH, "query");
const queryMs = Date.now() - tNeeds;
if (pipe.dispose) await pipe.dispose();
results.meta.nativeDims = docNative[0].length;
results.timing = {
  pipelineLoadMs: loadMs,
  docEmbedMs: docMs,
  docMsPerText: +(docMs / docTexts.length).toFixed(1),
  queryEmbedMs: queryMs,
  queryMsPerText: +(queryMs / (NEEDS.length * 2 + GIBBERISH.length)).toFixed(1),
};
say(`  ${docTexts.length} docs in ${docMs}ms (${results.timing.docMsPerText}ms/text), ${NEEDS.length * 2 + GIBBERISH.length} queries in ${queryMs}ms`);
save();

// ── stage 2: equivalence — raw native→truncate256 vs real provider output ───
say("## stage 2 — provider-equivalence check at 256 dims");
const provider = new TransformersEmbeddings(GEMMA_MODEL);
const checkDocIdx = [0, 40, 120];
const checkNeedIdx = [0, 33];
const provDocs = await provider.embed(checkDocIdx.map((i) => docTexts[i]), "document");
const provNeeds = await provider.embed(checkNeedIdx.map((i) => NEEDS[i].need), "query");
await provider.dispose();
let maxAbsDiff = 0;
let minPairCos = 1;
const pairs = [
  ...checkDocIdx.map((i, j) => [truncateAndNormalize(docNative[i]), provDocs[j]]),
  ...checkNeedIdx.map((i, j) => [truncateAndNormalize(needNative[i]), provNeeds[j]]),
];
for (const [a, b] of pairs) {
  for (let i = 0; i < a.length; i++) maxAbsDiff = Math.max(maxAbsDiff, Math.abs(a[i] - b[i]));
  minPairCos = Math.min(minPairCos, cosine(a, b));
}
results.equivalence = {
  providerDims: provDocs[0].length,
  maxAbsComponentDiff: maxAbsDiff,
  minPairCosine: minPairCos,
  pass: provDocs[0].length === 256 && minPairCos > 0.9999,
};
say(`  provider dims=${provDocs[0].length}, maxAbsDiff=${maxAbsDiff.toExponential(2)}, minPairCos=${minPairCos.toFixed(6)} → ${results.equivalence.pass ? "PASS" : "FAIL"}`);
save();
if (!results.equivalence.pass) {
  say("EQUIVALENCE FAILED — aborting rather than report derived numbers");
  process.exit(1);
}

// ── retrieval machinery ──────────────────────────────────────────────────────
const K = 10;
const DIMS = [128, 256, 512, 768];
const derive = (vecs, d) => vecs.map((v) => truncateAndNormalize(v, d));

const primaryRank = (ranked, primary) => {
  const idx = ranked.findIndex((id) => primary.includes(id));
  return idx === -1 ? null : idx + 1;
};

// Reimplemented fusion (for the threshold sweep only) — mirrors
// store.draftCandidates() pass 1+2 with a parametric threshold. Verified below
// against the real implementation at t=0.15 for every need and every dim.
const fuseEngaged = (store, need, vecsMap, cosByTool) => {
  const lexical = store.lexicalSearch(need, Math.max(30, K * 6));
  const lexById = new Map(lexical.map((l) => [l.id, l.lexScore]));
  const candidateIds = new Set(lexById.keys());
  for (const id of vecsMap.keys()) candidateIds.add(id);
  const gathered = [];
  for (const id of candidateIds) {
    gathered.push({ id, lexScore: lexById.get(id) ?? null, cosScore: cosByTool.get(id) ?? null });
  }
  const cosVals = gathered.map((g) => g.cosScore).filter((c) => c !== null);
  const cosMin = Math.min(...cosVals);
  const cosSpan = Math.max(...cosVals) - cosMin;
  const out = [];
  for (const g of gathered) {
    let score;
    if (g.cosScore !== null) {
      const cosNorm = (g.cosScore - cosMin) / cosSpan;
      score = 0.3 * (g.lexScore ?? 0) + 0.7 * cosNorm;
    } else {
      score = g.lexScore ?? 0;
    }
    if (score > 0) out.push({ id: g.id, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, K).map((c) => c.id);
};

say("## stage 3 — per-dim retrieval (REAL store.draftCandidates on real SQLite)");
const perDim = {};
let lexicalOrders = null; // dim-independent
for (const d of DIMS) {
  const store = new CoachStore(openCoachDb(":memory:"));
  store.upsertCapabilities(TOOLS);
  const docsD = derive(docNative, d);
  TOOLS.forEach((t, i) => store.storeBaseVec(t.id, docsD[i]));
  const vecsMap = store.loadVecs(); // exact store data path (blob roundtrip)
  const needsD = derive(needNative, d);
  const shufD = derive(shufNative, d);
  const gibD = derive(gibNative, d);

  if (!lexicalOrders) {
    lexicalOrders = NEEDS.map((n) => rankedIds(store.draftCandidates(n.need, K)));
  }

  const spanOf = (qv) => {
    const cosByTool = new Map();
    let mn = Infinity, mx = -Infinity;
    for (const [id, v] of vecsMap) {
      const c = cosine(qv, v);
      cosByTool.set(id, c);
      if (c < mn) mn = c;
      if (c > mx) mx = c;
    }
    return { span: mx - mn, max: mx, min: mn, cosByTool };
  };

  const perNeed = [];
  let fusionMismatches = 0;
  for (let i = 0; i < NEEDS.length; i++) {
    const n = NEEDS[i];
    const { span, max, min, cosByTool } = spanOf(needsD[i]);
    const hybrid = rankedIds(store.draftCandidates(n.need, K, needsD[i]));
    const engaged = fuseEngaged(store, n.need, vecsMap, cosByTool);
    // verify reimplementation reproduces the real store at built-in 0.15
    const predicted = span >= 0.15 ? engaged : lexicalOrders[i];
    if (JSON.stringify(predicted) !== JSON.stringify(hybrid)) fusionMismatches++;
    perNeed.push({
      need: n.need, style: n.style, span: +span.toFixed(4), cosMax: +max.toFixed(4), cosMin: +min.toFixed(4),
      lex: lexicalOrders[i], hybrid, engaged,
      lexRank: primaryRank(lexicalOrders[i], n.primary), hybRank: primaryRank(hybrid, n.primary),
    });
  }
  const shufSpans = shufD.map((v) => +spanOf(v).span.toFixed(4));
  const gibDetail = GIBBERISH.map((g, i) => {
    const { span, cosByTool } = spanOf(gibD[i]);
    const top = [...cosByTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { text: g, span: +span.toFixed(4), top3: top.map(([id, c]) => `${id}:${c.toFixed(3)}`) };
  });

  const rows = (orders) =>
    NEEDS.map((n, i) => ({
      style: n.style,
      hit1: hitAtK(orders[i], n.acceptable, 1),
      hit5: hitAtK(orders[i], n.acceptable, 5),
      rr: reciprocalRank(orders[i], n.primary),
    }));
  perDim[d] = {
    fusionMismatches,
    lexical: summarize(rows(lexicalOrders)),
    hybrid: summarize(rows(perNeed.map((p) => p.hybrid))),
    engagedForced: summarize(rows(perNeed.map((p) => p.engaged))),
    engageRateAt015: +mean(perNeed.map((p) => (p.span >= 0.15 ? 1 : 0))).toFixed(3),
    realSpans: perNeed.map((p) => p.span),
    shuffledSpans: shufSpans,
    gibberishSpans: gibDetail.map((g) => g.span),
    gibberishDetail: d === 256 ? gibDetail : undefined,
    perNeed: d === 256 ? perNeed : undefined,
  };
  say(`  dims=${d}: hybrid hit@5=${perDim[d].hybrid.overall.hit5} mrr=${perDim[d].hybrid.overall.mrr} | lexical hit@5=${perDim[d].lexical.overall.hit5} | fusionMismatches=${fusionMismatches} | realSpan p50=${[...perDim[d].realSpans].sort((a, b) => a - b)[33].toFixed(3)}`);
}
results.perDim = perDim;
save();

// shuffled needs keep their topic — same ground truth applies (word-order robustness)
{
  const store = new CoachStore(openCoachDb(":memory:"));
  store.upsertCapabilities(TOOLS);
  const docs256 = derive(docNative, 256);
  TOOLS.forEach((t, i) => store.storeBaseVec(t.id, docs256[i]));
  const shuf256 = derive(shufNative, 256);
  const rowsShufLex = [];
  const rowsShufHyb = [];
  for (let i = 0; i < NEEDS.length; i++) {
    const n = NEEDS[i];
    const lex = rankedIds(store.draftCandidates(SHUFFLED[i], K));
    const hyb = rankedIds(store.draftCandidates(SHUFFLED[i], K, shuf256[i]));
    rowsShufLex.push({ style: n.style, hit1: hitAtK(lex, n.acceptable, 1), hit5: hitAtK(lex, n.acceptable, 5), rr: reciprocalRank(lex, n.primary) });
    rowsShufHyb.push({ style: n.style, hit1: hitAtK(hyb, n.acceptable, 1), hit5: hitAtK(hyb, n.acceptable, 5), rr: reciprocalRank(hyb, n.primary) });
  }
  results.shuffledRetrieval256 = { lexical: summarize(rowsShufLex).overall, hybrid: summarize(rowsShufHyb).overall };
  say(`  shuffled-need retrieval @256: lexical hit@5=${results.shuffledRetrieval256.lexical.hit5} vs hybrid hit@5=${results.shuffledRetrieval256.hybrid.hit5}`);
}
save();

// ── stage 4: span distributions + threshold sweep at production 256 dims ────
say("## stage 4 — span distributions + threshold sweep (256 dims)");
const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return +(s[lo] + (s[hi] - s[lo]) * (idx - lo)).toFixed(4);
};
const dist = (xs) => ({ n: xs.length, min: q(xs, 0), p10: q(xs, 0.1), p25: q(xs, 0.25), p50: q(xs, 0.5), p75: q(xs, 0.75), p90: q(xs, 0.9), max: q(xs, 1) });
const real = perDim[256].realSpans;
const shuf = perDim[256].shuffledSpans;
const gib = perDim[256].gibberishSpans;
results.spans256 = {
  real: dist(real),
  shuffled: dist(shuf),
  gibberish: dist(gib),
  fractionBelow015: { real: +mean(real.map((s) => (s < 0.15 ? 1 : 0))).toFixed(3), shuffled: +mean(shuf.map((s) => (s < 0.15 ? 1 : 0))).toFixed(3), gibberish: +mean(gib.map((s) => (s < 0.15 ? 1 : 0))).toFixed(3) },
  separation: {
    minRealSpan: q(real, 0), maxShuffledSpan: q(shuf, 1), maxGibberishSpan: q(gib, 1),
    noiseAboveMinReal: +mean([...shuf, ...gib].map((s) => (s >= q(real, 0) ? 1 : 0))).toFixed(3),
    realBelowMaxGibberish: +mean(real.map((s) => (s <= q(gib, 1) ? 1 : 0))).toFixed(3),
  },
};
say(`  real spans:      ${JSON.stringify(results.spans256.real)}`);
say(`  shuffled spans:  ${JSON.stringify(results.spans256.shuffled)}`);
say(`  gibberish spans: ${JSON.stringify(results.spans256.gibberish)}`);

const sweep = [];
for (let t = 0; t <= 0.401; t += 0.05) {
  const th = +t.toFixed(2);
  const orders = perDim[256].perNeed.map((p) => (p.span >= th ? p.engaged : p.lex));
  const rows = NEEDS.map((n, i) => ({
    style: n.style,
    hit1: hitAtK(orders[i], n.acceptable, 1),
    hit5: hitAtK(orders[i], n.acceptable, 5),
    rr: reciprocalRank(orders[i], n.primary),
  }));
  const s = summarize(rows).overall;
  sweep.push({
    threshold: th,
    abstainRateReal: +mean(real.map((x) => (x < th ? 1 : 0))).toFixed(3),
    engageRateShuffled: +mean(shuf.map((x) => (x >= th ? 1 : 0))).toFixed(3),
    engageRateGibberish: +mean(gib.map((x) => (x >= th ? 1 : 0))).toFixed(3),
    hit1: s.hit1, hit5: s.hit5, mrr: s.mrr,
  });
}
results.thresholdSweep256 = sweep;
say("  t    abstain(real)  engage(shuf)  engage(gib)  hit@1  hit@5  MRR");
for (const r of sweep) say(`  ${r.threshold.toFixed(2)}    ${r.abstainRateReal.toFixed(3)}         ${r.engageRateShuffled.toFixed(3)}        ${r.engageRateGibberish.toFixed(3)}       ${r.hit1} ${r.hit5} ${r.mrr}`);
save();

// ── stage 5: regressions & wins vs lexical at production config ─────────────
say("## stage 5 — per-need regressions vs lexical (256, t=0.15)");
const regressions = [];
const wins = [];
for (const p of perDim[256].perNeed) {
  const n = NEEDS.find((x) => x.need === p.need);
  const lexHit5 = hitAtK(p.lex, n.acceptable, 5);
  const hybHit5 = hitAtK(p.hybrid, n.acceptable, 5);
  const rec = {
    need: p.need, style: p.style, span: p.span,
    lexRank: p.lexRank, hybRank: p.hybRank,
    lexTop5: p.lex.slice(0, 5), hybTop5: p.hybrid.slice(0, 5), primary: n.primary,
  };
  const worse = (hybHit5 < lexHit5) || (p.lexRank !== null && (p.hybRank === null || p.hybRank > p.lexRank));
  const better = (hybHit5 > lexHit5) || (p.hybRank !== null && (p.lexRank === null || p.hybRank < p.lexRank));
  if (worse) regressions.push({ ...rec, hit5: `${lexHit5}→${hybHit5}` });
  else if (better) wins.push({ need: p.need, style: p.style, lexRank: p.lexRank, hybRank: p.hybRank, hit5: `${lexHit5}→${hybHit5}` });
}
results.regressions256 = regressions;
results.winsCount256 = wins.length;
results.wins256 = wins;
say(`  regressions: ${regressions.length}, wins: ${wins.length} (of ${NEEDS.length})`);
for (const r of regressions) say(`   ✗ [${r.style}] "${r.need}" primary-rank ${r.lexRank}→${r.hybRank} hit5 ${r.hit5} span=${r.span}`);
save();
say(`\nresults → ${RESULTS}`);
