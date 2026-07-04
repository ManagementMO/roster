#!/usr/bin/env node
/**
 * OATS dynamics — PHASE 1: hybrid baseline over the shared corpus/needs with
 * REAL MiniLM embeddings. Purpose: (1) comparable baseline numbers, (2) find
 * tools with weak base retrieval for their need-family (targets for the
 * sensitivity curve), (3) measure the baseline cosine-span distribution that
 * drives the 0.15 dense-abstain gate.
 *
 * Run: node docs/lab/exp-oats-dynamics-baseline.mjs
 * Output: appends { baseline } to docs/lab/results-oats-dynamics.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const coach = await import(
  createRequire(path.join(repo, "packages/cli/package.json")).resolve("@rosterhq/coach")
);
const { CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL, cosine } = coach;
const { TOOLS } = await import(path.join(here, "corpus.mjs"));
const { NEEDS } = await import(path.join(here, "needs.mjs"));
const { rankedIds, hitAtK, reciprocalRank, summarize, percentile } = await import(
  path.join(here, "metrics.mjs")
);

const t0 = Date.now();
const provider = new TransformersEmbeddings(MINILM_MODEL);

// ── store with real base vectors (production text format: name\ndesc\nbody) ──
const store = new CoachStore(openCoachDb(":memory:"));
store.upsertCapabilities(TOOLS);
const cardTexts = TOOLS.map((t) => `${t.name}\n${t.description}\n`.slice(0, 2000));
const BATCH = 16;
const cardVecs = [];
for (let i = 0; i < cardTexts.length; i += BATCH) {
  cardVecs.push(...(await provider.embed(cardTexts.slice(i, i + BATCH), "document")));
}
TOOLS.forEach((t, i) => store.storeBaseVec(t.id, cardVecs[i]));
console.log(`embedded ${cardVecs.length} tool cards, dims=${cardVecs[0].length}, ${Date.now() - t0}ms`);

// ── needs (query side) ──
const needVecs = [];
for (let i = 0; i < NEEDS.length; i += BATCH) {
  needVecs.push(...(await provider.embed(NEEDS.slice(i, i + BATCH).map((n) => n.need), "query")));
}

// ── per-need baseline: hybrid rank of primary, span, abstain flag ──
const K = TOOLS.length; // full ranking (draftCandidates backfills to k)
const vecsById = store.loadVecs(); // base vecs (no adj yet)
const rows = [];
for (let i = 0; i < NEEDS.length; i++) {
  const n = NEEDS[i];
  const nv = needVecs[i];
  const hybrid = store.draftCandidates(n.need, K, nv);
  const lexOnly = store.draftCandidates(n.need, K);
  const ranked = rankedIds(hybrid);
  const lexRanked = rankedIds(lexOnly);

  // exact span the fusion sees: cos over every vec-bearing active candidate
  const cosAll = [];
  for (const [id, v] of vecsById) cosAll.push([id, cosine(nv, v)]);
  const cosVals = cosAll.map(([, c]) => c);
  const span = Math.max(...cosVals) - Math.min(...cosVals);
  const denseRanked = [...cosAll].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  const rankIn = (list) => {
    const idx = list.findIndex((id) => n.primary.includes(id));
    return idx === -1 ? null : idx + 1;
  };
  rows.push({
    need: n.need,
    style: n.style,
    primary: n.primary,
    hybridRank: rankIn(ranked),
    lexRank: rankIn(lexRanked),
    denseRank: rankIn(denseRanked),
    span: +span.toFixed(4),
    denseInformative: cosVals.length > 1 && span >= 0.15,
    hybridEqualsLex: ranked.join(",") === lexRanked.join(","),
    hit1: hitAtK(ranked, n.acceptable, 1),
    hit5: hitAtK(ranked, n.acceptable, 5),
    rr: reciprocalRank(ranked, n.primary),
    top5: ranked.slice(0, 5),
  });
}

const spans = rows.map((r) => r.span);
const baseline = {
  model: MINILM_MODEL,
  dims: cardVecs[0].length,
  nTools: TOOLS.length,
  nNeeds: NEEDS.length,
  summary: summarize(rows),
  spanStats: {
    min: +Math.min(...spans).toFixed(4),
    p10: +percentile(spans, 10).toFixed(4),
    p50: +percentile(spans, 50).toFixed(4),
    p90: +percentile(spans, 90).toFixed(4),
    max: +Math.max(...spans).toFixed(4),
    informativeCount: rows.filter((r) => r.denseInformative).length,
    hybridDiffersFromLexCount: rows.filter((r) => !r.hybridEqualsLex).length,
  },
  weakCandidates: rows
    .filter((r) => (r.hybridRank ?? 999) > 5)
    .map((r) => ({ need: r.need, primary: r.primary, hybridRank: r.hybridRank, lexRank: r.lexRank, denseRank: r.denseRank, top5: r.top5 }))
    .sort((a, b) => (b.hybridRank ?? 999) - (a.hybridRank ?? 999)),
  perNeed: rows,
  wallMs: Date.now() - t0,
};

console.log("overall:", JSON.stringify(baseline.summary.overall));
console.log("spanStats:", JSON.stringify(baseline.spanStats));
console.log(`weak (primary rank>5): ${baseline.weakCandidates.length} needs`);
for (const w of baseline.weakCandidates) {
  console.log(`  rank=${String(w.hybridRank).padStart(3)} lex=${String(w.lexRank).padStart(3)} dense=${String(w.denseRank).padStart(3)}  ${w.primary[0]}  «${w.need.slice(0, 60)}»`);
}

const outPath = path.join(here, "results-oats-dynamics.json");
const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
existing.meta = { generatedAt: new Date().toISOString(), model: MINILM_MODEL, script: "exp-oats-dynamics-baseline.mjs + exp-oats-dynamics.mjs" };
existing.baseline = baseline;
fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
console.log(`\nwrote baseline → ${outPath} (${Date.now() - t0}ms total)`);
await provider.dispose();
