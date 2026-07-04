#!/usr/bin/env node
/**
 * Proxy-tax (a): draftCandidates latency vs roster size — 10/50/133/500 tools,
 * lexical-only vs hybrid-with-cached-vecs. Vectors are REAL MiniLM embeddings
 * (embedded once, before timing). Also measures the per-need embed cost (the
 * other half of a warm hybrid draft) and the store build cost per size.
 * Run: node docs/lab/exp-proxy-tax-a-draft.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { coach, extendCorpus, toolText, embedAll, statsMs, timeSyncUs, timeAsyncUs, machine, repo } from "./exp-proxy-tax-lib.mjs";
import { TOOLS } from "./corpus.mjs";
import { NEEDS } from "./needs.mjs";

const { CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL } = coach;

const SIZES = [10, 50, 133, 500];
const ROUNDS = 3; // 66 needs x 3 rounds = 198 timed drafts per mode per size
const K = 5;

const say = (s) => console.log(s);
const results = { experiment: "proxy-tax-a-draft-latency", ts: new Date().toISOString(), machine, model: MINILM_MODEL, k: K, needs: NEEDS.length, rounds: ROUNDS, sizes: {} };

say(`# proxy-tax (a) draftCandidates latency — ${results.ts}`);
say(`machine: ${machine.cpu} x${machine.cores}, node ${machine.node}`);

// ── one-time real embedding pass ────────────────────────────────────────────
const provider = new TransformersEmbeddings(MINILM_MODEL);
const corpus500 = extendCorpus(TOOLS, 500);

let t0 = Date.now();
const toolVecs = await embedAll(provider, corpus500.map(toolText), "document");
const toolEmbedMs = Date.now() - t0;
say(`embedded ${toolVecs.length} tool cards in ${toolEmbedMs}ms (real MiniLM, batch 16)`);

t0 = Date.now();
const needVecs = await embedAll(provider, NEEDS.map((n) => n.need), "query");
const needEmbedBatchMs = Date.now() - t0;
say(`embedded ${needVecs.length} needs in ${needEmbedBatchMs}ms`);
results.embedOnce = { toolCount: toolVecs.length, toolEmbedMs, needCount: needVecs.length, needEmbedBatchMs, dims: toolVecs[0].length };

// ── per-need single-embed latency (the warm hybrid hot-path add-on) ────────
{
  for (let i = 0; i < 10; i++) await provider.embed([NEEDS[i % NEEDS.length].need], "query"); // warmup
  const samples = [];
  for (let i = 0; i < 120; i++) {
    const { us } = await timeAsyncUs(() => provider.embed([NEEDS[i % NEEDS.length].need], "query"));
    samples.push(us);
  }
  results.needEmbedSingle = statsMs(samples);
  say(`single need embed (warm MiniLM): p50 ${results.needEmbedSingle.p50_ms}ms p95 ${results.needEmbedSingle.p95_ms}ms (n=${samples.length})`);
}

// ── per-size draft timing ───────────────────────────────────────────────────
for (const size of SIZES) {
  const subset = corpus500.slice(0, size);
  const store = new CoachStore(openCoachDb(":memory:"));

  const { us: upsertUs } = timeSyncUs(() => store.upsertCapabilities(subset));
  const { us: vecUs } = timeSyncUs(() => {
    subset.forEach((tool, i) => store.storeBaseVec(tool.id, toolVecs[i]));
  });

  const run = (mode) => {
    // warmup (uncounted): one full pass over the needs
    for (const [i, n] of NEEDS.entries()) {
      store.draftCandidates(n.need, K, mode === "hybrid" ? needVecs[i] : null);
    }
    const samples = [];
    let returned = 0;
    for (let r = 0; r < ROUNDS; r++) {
      for (const [i, n] of NEEDS.entries()) {
        const { us, out } = timeSyncUs(() =>
          store.draftCandidates(n.need, K, mode === "hybrid" ? needVecs[i] : null),
        );
        samples.push(us);
        returned += out.length;
      }
    }
    return { ...statsMs(samples), avgReturned: +(returned / samples.length).toFixed(2) };
  };

  const lexical = run("lexical");
  const hybrid = run("hybrid");
  results.sizes[size] = {
    upsertMs: +(upsertUs / 1000).toFixed(1),
    storeVecsMs: +(vecUs / 1000).toFixed(1),
    lexical,
    hybrid,
    hybridOverLexicalP50: +(hybrid.p50_ms / lexical.p50_ms).toFixed(2),
  };
  say(`size ${size}: lexical p50 ${lexical.p50_ms}ms p95 ${lexical.p95_ms}ms | hybrid p50 ${hybrid.p50_ms}ms p95 ${hybrid.p95_ms}ms (x${results.sizes[size].hybridOverLexicalP50} lex) | build: upsert ${results.sizes[size].upsertMs}ms vecs ${results.sizes[size].storeVecsMs}ms`);
  store.db?.close?.();
}

await provider.dispose();

const out = path.join(repo, "docs/lab/tmp-proxy-tax/results-a.json");
fs.writeFileSync(out, JSON.stringify(results, null, 2));
say(`\nwrote ${out}`);
