/**
 * Part E — chunked-batch equivalence: the serve warmup path embeds tool cards
 * in batches of 16; drafts embed the need alone. Are batch-of-16 vectors
 * bitwise-identical to one-by-one vectors for the same 133 corpus texts?
 * If not, how big is the numeric gap, and does it ever change a ranking
 * (probed with 20 ground-truthed needs from needs.mjs)?
 */
import { loadCoach, serveText, bitwiseEqual, cosine, maxAbsDiff, savePart, audit, vecAudit } from "./exp-embed-torture-lib.mjs";
import { TOOLS } from "./corpus.mjs";
import { NEEDS } from "./needs.mjs";
import { percentile, mean } from "./metrics.mjs";

const { TransformersEmbeddings, MINILM_MODEL } = await loadCoach();
const out = { part: "e-batchequiv", model: MINILM_MODEL, startedAt: new Date().toISOString() };

const provider = new TransformersEmbeddings(MINILM_MODEL);
audit(await provider.embed(["roster warmup"]));

const texts = TOOLS.map(serveText);
out.corpusSize = texts.length;

// Path 1: one-by-one (draft-style single-text calls), per-call timing.
const single = [];
const singleTimes = [];
for (const t of texts) {
  const t0 = performance.now();
  const [v] = await provider.embed([t], "document");
  singleTimes.push(performance.now() - t0);
  single.push(v);
}
audit(single);

// Path 2: batch-of-16 chunks (serve.ts warmup shape), per-batch timing.
const BATCH = 16;
const batched = [];
const batchTimes = [];
for (let i = 0; i < texts.length; i += BATCH) {
  const chunk = texts.slice(i, i + BATCH);
  const t0 = performance.now();
  const vecs = await provider.embed(chunk, "document");
  batchTimes.push(performance.now() - t0);
  batched.push(...vecs);
}
audit(batched);

// Numeric comparison per text.
let bitwiseSame = 0;
const cosines = [];
const diffs = [];
for (let i = 0; i < texts.length; i++) {
  if (bitwiseEqual(single[i], batched[i])) bitwiseSame++;
  cosines.push(cosine(single[i], batched[i]));
  diffs.push(maxAbsDiff(single[i], batched[i]));
}
out.equivalence = {
  bitwiseIdentical: bitwiseSame,
  of: texts.length,
  cosineSingleVsBatch: {
    min: +Math.min(...cosines).toFixed(8),
    mean: +mean(cosines).toFixed(8),
  },
  maxAbsComponentDiff: { max: +Math.max(...diffs).toFixed(8), p50: +percentile(diffs, 50).toFixed(8) },
};

out.timing = {
  singlePerTextMsMean: +mean(singleTimes).toFixed(2),
  singlePerTextMsP50: +percentile(singleTimes, 50).toFixed(2),
  singlePerTextMsP95: +percentile(singleTimes, 95).toFixed(2),
  singleTotalMs: +singleTimes.reduce((a, b) => a + b, 0).toFixed(0),
  batchOf16CallMsMean: +mean(batchTimes).toFixed(2),
  batchTotalMs: +batchTimes.reduce((a, b) => a + b, 0).toFixed(0),
  batchPerTextMsEffective: +(batchTimes.reduce((a, b) => a + b, 0) / texts.length).toFixed(2),
  speedupFactor: +(singleTimes.reduce((a, b) => a + b, 0) / batchTimes.reduce((a, b) => a + b, 0)).toFixed(2),
};

// Ranking impact probe: 20 needs (query embedded once) ranked against
// single-vectors vs batch-vectors by pure cosine. Count top-1 flips and
// any order difference in the top-5.
const probeNeeds = NEEDS.slice(0, 20);
let top1Flips = 0, top5Diffs = 0;
const flips = [];
for (const n of probeNeeds) {
  const [q] = await provider.embed([n.need], "query");
  audit([q]);
  const rank = (vecs) =>
    vecs.map((v, i) => ({ id: TOOLS[i].id, c: cosine(q, v) })).sort((a, b) => b.c - a.c);
  const rs = rank(single).slice(0, 5).map((x) => x.id);
  const rb = rank(batched).slice(0, 5).map((x) => x.id);
  if (rs[0] !== rb[0]) { top1Flips++; flips.push({ need: n.need, single: rs[0], batch: rb[0] }); }
  if (rs.join(",") !== rb.join(",")) top5Diffs++;
}
out.rankingImpact = { needsProbed: probeNeeds.length, top1Flips, top5OrderDiffs: top5Diffs, flips };

await provider.dispose();
out.vecAudit = { ...vecAudit };
savePart("e", out);
console.log(JSON.stringify(out, null, 2));
