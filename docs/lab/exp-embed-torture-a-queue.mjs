/**
 * Part A — queue serialization under real concurrency.
 * 50 concurrent embed() via Promise.all: all resolve? identical text →
 * bitwise-identical vector? interleaved mixed-shape batches uncorrupted
 * (row↔text identity vs serial reference vectors)?
 */
import { loadCoach, serveText, bitwiseEqual, cosine, maxAbsDiff, savePart, audit, vecAudit } from "./exp-embed-torture-lib.mjs";
import { TOOLS } from "./corpus.mjs";

const { TransformersEmbeddings, MINILM_MODEL } = await loadCoach();
const out = { part: "a-queue", model: MINILM_MODEL, startedAt: new Date().toISOString() };
const unhandled = [];
process.on("unhandledRejection", (r) => unhandled.push(String(r)));

const provider = new TransformersEmbeddings(MINILM_MODEL);
const texts10 = TOOLS.slice(0, 10).map(serveText);

// Warm (excludes model load from timings)
const tWarm = performance.now();
audit(await provider.embed(["roster warmup"]));
out.warmMs = +(performance.now() - tWarm).toFixed(0);

// 1. Serial reference vectors: each text embedded alone, one call at a time.
const refs = [];
const tSerial = performance.now();
for (const t of texts10) refs.push(audit(await provider.embed([t]))[0]);
out.serial10Ms = +(performance.now() - tSerial).toFixed(1);
out.dims = refs[0].length;

// 2. Determinism: same text, 5 separate serial single-item calls → bitwise?
const det = [];
for (let i = 0; i < 5; i++) det.push(audit(await provider.embed([texts10[0]]))[0]);
out.determinismSerial = {
  bitwiseIdenticalAll: det.every((v) => bitwiseEqual(v, det[0])),
  maxAbsDiffVsFirst: Math.max(...det.map((v) => maxAbsDiff(v, det[0]))),
};

// 3. 50 concurrent single-text embeds (round-robin over the 10 texts).
const t50 = performance.now();
const fifty = await Promise.all(
  Array.from({ length: 50 }, (_, i) => provider.embed([texts10[i % 10]])),
);
out.concurrent50 = {
  wallMs: +(performance.now() - t50).toFixed(1),
  allResolved: fifty.length === 50 && fifty.every((r) => r.length === 1 && r[0].length === out.dims),
  bitwiseMatchSerialRef: fifty.every((r, i) => bitwiseEqual(r[0], refs[i % 10])),
  maxAbsDiffVsRef: Math.max(...fifty.map((r, i) => maxAbsDiff(r[0], refs[i % 10]))),
};
fifty.forEach((r) => audit(r));

// Serial baseline for the same 50 workload (queue serializes anyway — verify no starvation/overhead).
const tS50 = performance.now();
for (let i = 0; i < 50; i++) audit(await provider.embed([texts10[i % 10]]));
out.serial50WallMs = +(performance.now() - tS50).toFixed(1);

// 4. Interleaved mixed-shape batches fired concurrently: rows must map to the
// right text (corruption check). Batch numerics may differ from single-text
// refs (padding), so identity = argmax over refs; also record worst cosine drop.
const shapes = [
  texts10.slice(0, 5), // batch of 5
  texts10.slice(5, 10), // batch of 5
  [texts10[3]], // single
  texts10.slice(2, 8), // batch of 6 overlapping
  [texts10[7]], // single
  texts10.slice(0, 10), // full 10
];
const inter = await Promise.all(shapes.map((s) => provider.embed(s)));
let rowsChecked = 0, rowsCorrectIdentity = 0, worstSelfCos = 1, worstBitwise = 0;
inter.forEach((vecs, si) => {
  audit(vecs);
  vecs.forEach((v, ri) => {
    const expectIdx = texts10.indexOf(shapes[si][ri]);
    const cosines = refs.map((ref) => cosine(v, ref));
    const arg = cosines.indexOf(Math.max(...cosines));
    rowsChecked++;
    if (arg === expectIdx) rowsCorrectIdentity++;
    worstSelfCos = Math.min(worstSelfCos, cosines[expectIdx]);
    if (!bitwiseEqual(v, refs[expectIdx])) worstBitwise++;
  });
});
out.interleaved = {
  calls: shapes.length,
  rowsChecked,
  rowsCorrectIdentity,
  worstSelfCosineVsSingleRef: +worstSelfCos.toFixed(6),
  rowsNotBitwiseVsSingleRef: worstBitwise,
};

// 5. Same-shape batch determinism: full-10 batch twice → bitwise?
const b1 = audit(await provider.embed(texts10));
const b2 = audit(await provider.embed(texts10));
out.batchDeterminism = {
  bitwiseIdentical: b1.every((v, i) => bitwiseEqual(v, b2[i])),
  maxAbsDiff: Math.max(...b1.map((v, i) => maxAbsDiff(v, b2[i]))),
};

await provider.dispose();
out.unhandledRejections = unhandled;
out.vecAudit = { ...vecAudit };
savePart("a", out);
console.log(JSON.stringify(out, null, 2));
