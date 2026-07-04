#!/usr/bin/env node
/**
 * Proxy-tax (d): coach.db growth + maintenance cost at scale.
 * Real SQLite file DB, real MiniLM vectors, 10k recordOutcome calls with
 * realistic field mixes. Measures: file bytes at each stage (WAL-checkpointed),
 * per-outcome insert latency, draft latency on the 10k-outcome DB (vs the
 * fresh DB in exp (a)), recomputeRatings + runOats wall time, and worst-case
 * need_vec growth with 1000 real unique need embeddings.
 * Run: node docs/lab/exp-proxy-tax-d-db-growth.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { coach, statsMs, timeSyncUs, machine, repo, embedAll, toolText } from "./exp-proxy-tax-lib.mjs";
import { TOOLS } from "./corpus.mjs";
import { NEEDS } from "./needs.mjs";

const { CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL, hashNeed, hashArgs } = coach;

const say = (s) => console.log(s);
const dbPath = path.join(repo, "docs/lab/tmp-proxy-tax/coach-growth.db");
for (const suffix of ["", "-wal", "-shm"]) {
  if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
}

const results = { experiment: "proxy-tax-d-db-growth", ts: new Date().toISOString(), machine, model: MINILM_MODEL, stages: {}, };
say(`# proxy-tax (d) DB growth — ${results.ts}`);

const store = new CoachStore(openCoachDb(dbPath));
const rawDb = store.db; // JS access to the private handle for checkpoint/stat

function sizeNow(label) {
  rawDb.pragma("wal_checkpoint(TRUNCATE)");
  const bytes = fs.statSync(dbPath).size;
  const wal = fs.existsSync(dbPath + "-wal") ? fs.statSync(dbPath + "-wal").size : 0;
  results.stages[label] = { dbBytes: bytes, walBytesAfterCheckpoint: wal, dbKiB: +(bytes / 1024).toFixed(1) };
  say(`  size @ ${label}: ${(bytes / 1024).toFixed(1)} KiB`);
  return bytes;
}

sizeNow("schema-only");

// 133 real corpus capabilities
store.upsertCapabilities(TOOLS);
sizeNow("caps-133");

// real MiniLM base vectors for all 133
const provider = new TransformersEmbeddings(MINILM_MODEL);
const toolVecs = await embedAll(provider, TOOLS.map(toolText), "document");
TOOLS.forEach((t, i) => store.storeBaseVec(t.id, toolVecs[i]));
sizeNow("vecs-133");

// 66 real need vectors (needs repeat across sessions — the realistic case)
const needVecs = await embedAll(provider, NEEDS.map((n) => n.need), "query");
const needHashes = NEEDS.map((n) => hashNeed(n.need));
NEEDS.forEach((_, i) => store.storeNeedVec(needHashes[i], needVecs[i]));
sizeNow("needvecs-66");

// ── 10k recordOutcome calls, timed individually ────────────────────────────
const classes = ["success", "success", "success", "success", "success", "success", "success", "success", "success", "tool_fail:internal", "success", "success", "success", "success", "success", "tool_fail:internal", "success", "success", "hard_fail:transport", "success"]; // 85% success, 10% tool_fail, 5% hard_fail
const insertUs = [];
const NOW = Date.now();
function record(i) {
  const cap = TOOLS[i % TOOLS.length];
  const { us } = timeSyncUs(() =>
    store.recordOutcome({
      session: `s${Math.floor(i / 20)}`,
      source: cap.source,
      capability: cap.id,
      outcomeClass: classes[i % classes.length],
      latencyMs: 10 + (i % 190),
      argsHash: hashArgs({ path: `/tmp/f${i % 97}.txt`, i: i % 13 }),
      needHash: needHashes[i % needHashes.length],
      ts: NOW - (10_000 - i) * 500, // spread over ~58 days, inside the 90d OATS window
    }),
  );
  insertUs.push(us);
}
for (let i = 0; i < 1000; i++) record(i);
const at1k = sizeNow("outcomes-1k");
for (let i = 1000; i < 10_000; i++) record(i);
const at10k = sizeNow("outcomes-10k");
results.recordOutcome = { ...statsMs(insertUs), perOutcomeMarginalBytes: +((at10k - at1k) / 9000).toFixed(1) };
say(`  recordOutcome: p50 ${results.recordOutcome.p50_ms}ms p95 ${results.recordOutcome.p95_ms}ms over ${insertUs.length} inserts; ~${results.recordOutcome.perOutcomeMarginalBytes} B/outcome`);

// ── draft latency on the 10k-outcome DB (compare with exp (a) size 133) ────
function draftLoop(mode) {
  for (const [i, n] of NEEDS.entries()) store.draftCandidates(n.need, 5, mode === "hybrid" ? needVecs[i] : null); // warmup
  const samples = [];
  for (let r = 0; r < 3; r++) {
    for (const [i, n] of NEEDS.entries()) {
      const { us } = timeSyncUs(() => store.draftCandidates(n.need, 5, mode === "hybrid" ? needVecs[i] : null));
      samples.push(us);
    }
  }
  return statsMs(samples);
}
results.draftAt10k = { lexical: draftLoop("lexical"), hybrid: draftLoop("hybrid") };
say(`  draft @10k outcomes: lexical p50 ${results.draftAt10k.lexical.p50_ms}ms | hybrid p50 ${results.draftAt10k.hybrid.p50_ms}ms`);

// ── maintenance cost at 10k ────────────────────────────────────────────────
results.recomputeRatings = [];
for (let r = 0; r < 3; r++) {
  const { us } = timeSyncUs(() => store.recomputeRatings());
  results.recomputeRatings.push(+(us / 1000).toFixed(1));
}
sizeNow("after-ratings");
results.runOats = [];
let oatsOut;
for (let r = 0; r < 2; r++) {
  const { us, out } = timeSyncUs(() => store.runOats());
  oatsOut = out;
  results.runOats.push(+(us / 1000).toFixed(1));
}
results.oatsOutcome = oatsOut;
sizeNow("after-oats");
say(`  recomputeRatings ms: ${results.recomputeRatings.join(", ")} | runOats ms: ${results.runOats.join(", ")} (${JSON.stringify(oatsOut)})`);

results.draftAt10kPostOats = { hybrid: draftLoop("hybrid") };
say(`  hybrid draft post-OATS: p50 ${results.draftAt10kPostOats.hybrid.p50_ms}ms`);

// ── worst-case need_vec growth: 1000 REAL unique need embeddings ───────────
const uniqueNeeds = Array.from({ length: 1000 }, (_, i) => `unique task ${i}: ${NEEDS[i % NEEDS.length].need} for project ${i}`);
const t0 = Date.now();
const uniqueVecs = await embedAll(provider, uniqueNeeds, "query", 32);
const uniqueEmbedMs = Date.now() - t0;
const before = sizeNow("before-1k-unique-needvecs");
uniqueNeeds.forEach((n, i) => store.storeNeedVec(hashNeed(n), uniqueVecs[i]));
const after = sizeNow("after-1k-unique-needvecs");
results.needVecGrowth = {
  uniqueEmbedMs,
  rows: 1000,
  totalBytes: after - before,
  perRowBytes: +((after - before) / 1000).toFixed(1),
};
say(`  1000 unique need_vecs: +${((after - before) / 1024).toFixed(1)} KiB (${results.needVecGrowth.perRowBytes} B/row; embeds took ${uniqueEmbedMs}ms)`);

await provider.dispose();
rawDb.close();

const out = path.join(repo, "docs/lab/tmp-proxy-tax/results-d.json");
fs.writeFileSync(out, JSON.stringify(results, null, 2));
say(`\nwrote ${out}`);
