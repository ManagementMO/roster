/**
 * Part C — re-warm cycles ×5: provider → embed full 133-tool corpus (serve
 * path batches of 16) → dispose() → new provider. RSS traced at every stage;
 * tests the real-dispose fix's claim that ONNX native memory is reclaimed
 * (vs the old ~300MB stuck waiting on GC). Run with --expose-gc.
 */
import { loadCoach, serveText, savePart, audit, vecAudit, rssMb, sleep } from "./exp-embed-torture-lib.mjs";
import { TOOLS } from "./corpus.mjs";

const { TransformersEmbeddings, MINILM_MODEL } = await loadCoach();
const gc = globalThis.gc ?? (() => {});
const out = { part: "c-rewarm", model: MINILM_MODEL, startedAt: new Date().toISOString(), exposeGc: !!globalThis.gc };

const texts = TOOLS.map(serveText);
const BATCH = 16; // serve.ts warmup batch size

gc(); await sleep(200);
out.baselineRssMb = rssMb();
out.cycles = [];

for (let c = 1; c <= 5; c++) {
  const cy = { cycle: c };
  const t0 = performance.now();
  const provider = new TransformersEmbeddings(MINILM_MODEL);
  audit(await provider.embed(["roster warmup"]));
  cy.loadMs = +(performance.now() - t0).toFixed(0);
  cy.rssAfterLoadMb = rssMb();

  const t1 = performance.now();
  let n = 0;
  for (let i = 0; i < texts.length; i += BATCH) {
    const vecs = audit(await provider.embed(texts.slice(i, i + BATCH), "document"));
    n += vecs.length;
  }
  cy.corpusVectors = n;
  cy.embedCorpusMs = +(performance.now() - t1).toFixed(0);
  cy.rssAfterEmbedMb = rssMb();

  await provider.dispose();
  gc(); await sleep(300); gc();
  cy.rssAfterDisposeGcMb = rssMb();
  cy.reclaimedMb = +(cy.rssAfterEmbedMb - cy.rssAfterDisposeGcMb).toFixed(1);
  out.cycles.push(cy);
  console.log(JSON.stringify(cy));
}

const post = out.cycles.map((c) => c.rssAfterDisposeGcMb);
out.trend = {
  rssAfterDisposePerCycleMb: post,
  cycle1ToCycle5DriftMb: +(post[4] - post[0]).toFixed(1),
  meanReclaimedPerCycleMb: +(out.cycles.reduce((a, c) => a + c.reclaimedMb, 0) / 5).toFixed(1),
};
out.vecAudit = { ...vecAudit };
savePart("c", out);
console.log(JSON.stringify(out.trend, null, 2));
