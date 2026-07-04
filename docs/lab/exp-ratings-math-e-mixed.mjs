#!/usr/bin/env node
/**
 * ratings-math (e): mixed draft — need with a FEW lexical hits, k=5, so the
 * rated backfill must top up around exclusions (LIMIT limit+exclude.size path).
 * Stress: the lexically-hit tools are ALSO the top-rated ones, forcing the
 * backfill to skip past excluded rows. Verifies no duplicates, exact expected
 * backfill order (independent recomputation from the rating table + last_seen),
 * and determinism across 10 repeats.
 *
 * Run: node docs/lab/exp-ratings-math-e-mixed.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { CoachStore, openCoachDb } = await import(req.resolve("@rosterhq/coach"));
const { TOOLS } = await import(path.join(repo, "docs/lab/corpus.mjs"));

const results = { startedAt: new Date().toISOString() };
const t0 = Date.now();

const db = openCoachDb(":memory:");
const store = new CoachStore(db);
TOOLS.forEach((t, i) => store.upsertCapabilities([t], 1_000_000 + i * 1000));

// Top-rated trio deliberately = tools that lexical "read text file" also hits.
const X = "fs__read_text_file", Y = "fs__read_file", Z = "fs__read_media_file";
let s = 0;
const rec = (capability, outcomeClass) =>
  store.recordOutcome({ session: `s${++s}`, source: "fs", capability, outcomeClass, latencyMs: 20, ts: 2_000_000 });
for (let i = 0; i < 9; i++) rec(X, "success");
rec(X, "tool_fail:other");
for (let i = 0; i < 3; i++) rec(Y, "success");
rec(Z, "success");
store.recomputeRatings("all");

const NEED = "read text file";
const k = 5;

const lexHits = store.lexicalSearch(NEED, 30);
const cands = store.draftCandidates(NEED, k);
const ids = cands.map((c) => c.entry.id);
const scored = cands.filter((c) => c.score > 0).map((c) => c.entry.id);
const backfilled = cands.filter((c) => c.score === 0).map((c) => c.entry.id);

// Independent expected backfill order among ids NOT already drafted:
// wilson_lb desc (missing rating = 0), then last_seen desc.
const ratingRows = db.prepare("SELECT capability, wilson_lb FROM rating WHERE category='all'").all();
const wilsonById = new Map(ratingRows.map((r) => [r.capability, r.wilson_lb]));
const capRows = db.prepare("SELECT id, last_seen FROM capability WHERE quarantined=0").all();
const lastSeenById = new Map(capRows.map((r) => [r.id, r.last_seen]));
const expectedBackfill = capRows
  .map((r) => r.id)
  .filter((id) => !scored.includes(id))
  .sort((a, b) => {
    const wa = wilsonById.get(a) ?? 0, wb = wilsonById.get(b) ?? 0;
    if (wb !== wa) return wb - wa;
    return (lastSeenById.get(b) ?? 0) - (lastSeenById.get(a) ?? 0);
  })
  .slice(0, k - scored.length);

const seqs = [];
for (let i = 0; i < 10; i++) seqs.push(store.draftCandidates(NEED, k).map((c) => c.entry.id).join("|"));

results.mixed = {
  need: NEED,
  lexicalHitCount: lexHits.length,
  lexicalHitIds: lexHits.map((h) => h.id),
  draftLen: ids.length,
  draftIds: ids,
  scoredSegment: scored,
  backfilledSegment: backfilled,
  expectedBackfill,
  backfillMatchesIndependentOrder: backfilled.join("|") === expectedBackfill.join("|"),
  noDuplicates: new Set(ids).size === ids.length,
  scoredSortedDesc: cands
    .filter((c) => c.score > 0)
    .every((c, i, a) => i === 0 || a[i - 1].score >= c.score),
  tenRepeatsIdentical: new Set(seqs).size === 1,
};

// Also the pathological k=1 with 1 lexical hit that IS the top-rated tool.
{
  const c1 = store.draftCandidates("read text file contents", 1);
  results.k1 = {
    len: c1.length,
    ids: c1.map((c) => c.entry.id),
    noDup: new Set(c1.map((c) => c.entry.id)).size === c1.length,
  };
}

db.close();
results.elapsedMs = Date.now() - t0;
const out = path.join(repo, "docs/lab/tmp-ratings-math/part-e-mixed.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
