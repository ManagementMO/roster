#!/usr/bin/env node
/**
 * ratings-math (e2): backfill LIMIT-boundary stress. Need "sentry issues" has
 * exactly 4 lexical hits in the 133-tool corpus; k=5 leaves ONE backfill slot.
 * The 4 hits are deliberately rated as the top-4 tools, so ratedFallback's
 * `LIMIT limit + exclude.size` (= 1 + 4 = 5) fetches exactly the top-5 rated
 * rows and must find its single non-excluded candidate at position 5 — the
 * off-by-one boundary. Expected slot-5 = the 5th-rated tool, NOT a recency
 * fallback and NOT an empty slot.
 *
 * Run: node docs/lab/exp-ratings-math-e2-backfill-boundary.mjs
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

const NEED = "sentry issues";
const k = 5;
const hits = store.lexicalSearch(NEED, 30).map((h) => h.id);
results.lexicalHits = hits;

// Rate the 4 lexical hits as top-4 (distinct wilson), 5th-rated = a non-hit tool.
const FIFTH = "sqlite__read_query";
let s = 0;
const seed = (capability, succ, fail) => {
  for (let i = 0; i < succ; i++)
    store.recordOutcome({ session: `s${++s}`, source: "x", capability, outcomeClass: "success", latencyMs: 10, ts: 2_000_000 });
  for (let i = 0; i < fail; i++)
    store.recordOutcome({ session: `s${++s}`, source: "x", capability, outcomeClass: "tool_fail:other", latencyMs: 10, ts: 2_000_000 });
};
// wilson: 19/20 > 18/20 > 17/20 > 16/20 > 10/20
hits.forEach((id, i) => seed(id, 19 - i, 1 + i));
seed(FIFTH, 10, 10);
store.recomputeRatings("all");

const ratingTable = db
  .prepare("SELECT capability, wilson_lb FROM rating WHERE category='all' ORDER BY wilson_lb DESC")
  .all();
results.ratingTable = ratingTable;
results.top4AreTheLexicalHits = ratingTable.slice(0, 4).every((r) => hits.includes(r.capability));

const cands = store.draftCandidates(NEED, k);
const ids = cands.map((c) => c.entry.id);
const backfilled = cands.filter((c) => c.score === 0).map((c) => c.entry.id);

const seqs = [];
for (let i = 0; i < 10; i++) seqs.push(store.draftCandidates(NEED, k).map((c) => c.entry.id).join("|"));

results.draft = {
  k,
  draftLen: ids.length,
  draftIds: ids,
  backfilledSegment: backfilled,
  expectedBackfill: [FIFTH],
  backfillIsFifthRated: backfilled.length === 1 && backfilled[0] === FIFTH,
  noDuplicates: new Set(ids).size === ids.length,
  tenRepeatsIdentical: new Set(seqs).size === 1,
};

db.close();
results.elapsedMs = Date.now() - t0;
const out = path.join(repo, "docs/lab/tmp-ratings-math/part-e2-boundary.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
