#!/usr/bin/env node
/**
 * ratings-math (f): the zeroed-worst-hit interaction between lexical min-max
 * normalization and the rated fallback. lexicalSearch maps the WORST bm25 hit
 * to lexScore exactly 0; draftCandidates keeps only score > 0, so that hit is
 * dropped from the scored draft and must re-enter via ratedFallback — which,
 * in a cold-start (unrated) store, orders by recency and can seat unrelated
 * tools in its place.
 *
 * Measures on the 133-tool corpus, unrated store, distinct last_seen:
 *   1. Flagship case: need "write" — is fs__write_file (a direct match) in the
 *      k=5 draft at all?
 *   2. Scan all single-token needs with 2..5 FTS hits: how often is at least
 *      one genuine FTS hit absent from the k=5 draft, despite hits <= k?
 *   3. Mitigation probe: give the dropped tool ONE success (wilson 0.207) —
 *      does it re-enter via the rating-ordered fallback?
 *
 * Run: node docs/lab/exp-ratings-math-f-worsthit.mjs
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
const K = 5;

const db = openCoachDb(":memory:");
const store = new CoachStore(db);
// Insertion order = corpus order; later tools get NEWER last_seen (fs oldest).
TOOLS.forEach((t, i) => store.upsertCapabilities([t], 1_000_000 + i * 1000));

// ── 1. Flagship: need "write" ───────────────────────────────────────────────
{
  const need = "write";
  const hits = store.lexicalSearch(need, 30);
  const cands = store.draftCandidates(need, K);
  const ids = cands.map((c) => c.entry.id);
  results.flagshipWrite = {
    need,
    lexicalHits: hits.map((h) => ({ id: h.id, lexScore: h.lexScore })),
    draftIds: ids,
    draftDetail: cands.map((c) => ({ id: c.entry.id, score: c.score, lexScore: c.lexScore })),
    droppedHit: hits.filter((h) => !ids.includes(h.id)).map((h) => h.id),
    hitCount: hits.length,
    k: K,
    allHitsFitInK: hits.length <= K,
  };
}

// ── 2. Scan all single-token needs with 2..5 hits ──────────────────────────
const toks = new Set();
for (const t of TOOLS)
  for (const m of (`${t.source} ${t.name} ${t.description}`).toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
    toks.add(m);

let scanned = 0;
const displaced = [];
let worstWasZero = 0, tieAtWorst = 0;
for (const tok of toks) {
  const hits = store.lexicalSearch(tok, 30);
  if (hits.length < 2 || hits.length > K) continue;
  scanned++;
  const zeroHits = hits.filter((h) => h.lexScore === 0).length;
  if (zeroHits > 0) worstWasZero++; else tieAtWorst++;
  const ids = store.draftCandidates(tok, K).map((c) => c.entry.id);
  const missing = hits.filter((h) => !ids.includes(h.id)).map((h) => h.id);
  if (missing.length > 0) displaced.push({ tok, hitCount: hits.length, missing });
}
results.scan = {
  tokenNeedsScanned: scanned,
  needsWithZeroedWorstHit: worstWasZero,
  needsWithTieAtWorst: tieAtWorst,
  needsWithGenuineHitMissingFromDraft: displaced.length,
  displacementRate: +(displaced.length / scanned).toFixed(3),
  examples: displaced.slice(0, 12),
};

// ── 3. Mitigation probe: one success on the dropped tool ───────────────────
{
  store.recordOutcome({
    session: "mit1", source: "fs", capability: "fs__write_file",
    outcomeClass: "success", latencyMs: 10, ts: 2_000_000,
  });
  store.recomputeRatings("all");
  const ids = store.draftCandidates("write", K).map((c) => c.entry.id);
  results.mitigationOneSuccess = {
    wilsonOfDropped: store.getRating("fs__write_file")?.wilsonLb,
    draftIds: ids,
    droppedToolNowPresent: ids.includes("fs__write_file"),
  };
}

db.close();
results.elapsedMs = Date.now() - t0;
const out = path.join(repo, "docs/lab/tmp-ratings-math/part-f-worsthit.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
