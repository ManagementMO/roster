#!/usr/bin/env node
/**
 * ratings-math (c): rated-fallback under a gibberish need (zero FTS hits),
 * roster sizes 5 and 133 (shared corpus), on the built dist with real SQLite.
 * Measures: non-emptiness, rating-order correctness, tie-break determinism
 * across 10 repeated drafts, across full store rebuilds, and across
 * close/reopen of a file-backed DB.
 *
 * Run: node docs/lab/exp-ratings-math-c-fallback.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { CoachStore, openCoachDb } = await import(req.resolve("@rosterhq/coach"));
const { TOOLS } = await import(path.join(repo, "docs/lab/corpus.mjs"));

const GIBBERISH = "zzxqv wvutq qqjzz"; // tokens exist, match nothing
const NO_TOKENS = "???";               // tokenizer yields nothing at all

// Rated trio (all inside the first 5 corpus tools so both roster sizes share it):
// X 9/10 -> wilson 0.596, Y 3/3 -> 0.438, Z 1/1 -> 0.207. Expected order X>Y>Z.
const X = "fs__read_text_file", Y = "fs__read_file", Z = "fs__read_media_file";

const results = { startedAt: new Date().toISOString() };
const t0 = Date.now();

function buildStore(dbPath, roster, { distinctLastSeen }) {
  const db = openCoachDb(dbPath);
  const store = new CoachStore(db);
  if (distinctLastSeen) {
    // one upsert per tool with strictly increasing now -> unique last_seen
    roster.forEach((t, i) => store.upsertCapabilities([t], 1_000_000 + i * 1000));
  } else {
    store.upsertCapabilities(roster, 1_000_000); // all last_seen identical
  }
  let s = 0;
  const rec = (capability, outcomeClass) =>
    store.recordOutcome({ session: `s${++s}`, source: "fs", capability, outcomeClass, latencyMs: 20, ts: 2_000_000 });
  for (let i = 0; i < 9; i++) rec(X, "success");
  rec(X, "tool_fail:other");
  for (let i = 0; i < 3; i++) rec(Y, "success");
  rec(Z, "success");
  store.recomputeRatings("all");
  return { db, store };
}

const draftIds = (store, need, k) => store.draftCandidates(need, k).map((c) => c.entry.id);

function repeatDrafts(store, need, k, times) {
  const seqs = [];
  for (let i = 0; i < times; i++) seqs.push(draftIds(store, need, k).join("|"));
  return { allIdentical: new Set(seqs).size === 1, first: seqs[0], distinct: [...new Set(seqs)] };
}

for (const size of [5, 133]) {
  const roster = TOOLS.slice(0, size);
  const { db, store } = buildStore(":memory:", roster, { distinctLastSeen: true });

  // Precondition: the need really has zero FTS hits at this roster size.
  const lexHits = store.lexicalSearch(GIBBERISH, 30).length;
  const lexHitsNoTok = store.lexicalSearch(NO_TOKENS, 30).length;

  const k = 5;
  const cands = store.draftCandidates(GIBBERISH, k);
  const ids = cands.map((c) => c.entry.id);

  // Expected: rated trio by wilson desc, then unrated by last_seen desc.
  const ratedOrder = [X, Y, Z];
  const unratedByRecency = roster
    .map((t) => t.id)
    .filter((id) => !ratedOrder.includes(id))
    .reverse(); // insertion order had increasing last_seen
  const expectedHead = [...ratedOrder, ...unratedByRecency].slice(0, k);

  const wilson = Object.fromEntries([X, Y, Z].map((id) => [id, store.getRating(id)?.wilsonLb]));

  const rep = repeatDrafts(store, GIBBERISH, k, 10);
  const repNoTok = repeatDrafts(store, NO_TOKENS, k, 10);
  const overK = draftIds(store, GIBBERISH, Math.min(size * 2, 20)); // k > useful? k beyond roster
  const kBeyondRoster = size === 5 ? draftIds(store, GIBBERISH, 10) : null;

  // Rebuild the identical store from scratch 3x -> cross-build determinism.
  const rebuilds = [];
  for (let i = 0; i < 3; i++) {
    const b = buildStore(":memory:", roster, { distinctLastSeen: true });
    rebuilds.push(draftIds(b.store, GIBBERISH, k).join("|"));
    b.db.close();
  }

  results[`roster${size}`] = {
    lexHitsForGibberish: lexHits,
    lexHitsForNoTokenNeed: lexHitsNoTok,
    draftLen: cands.length,
    draftIds: ids,
    expectedHead,
    matchesExpected: ids.join("|") === expectedHead.join("|"),
    candidateShape: cands.map((c) => ({ id: c.entry.id, score: c.score, lexScore: c.lexScore, cosScore: c.cosScore })),
    wilsonSeeds: wilson,
    tenRepeatsIdentical: rep.allIdentical,
    tenRepeatsDistinctSeqs: rep.distinct.length,
    noTokenNeedTenRepeatsIdentical: repNoTok.allIdentical,
    noTokenSameOrderAsGibberish: repNoTok.first === rep.first,
    crossRebuildIdentical: new Set(rebuilds).size === 1,
    kBeyondRosterLen: kBeyondRoster ? kBeyondRoster.length : undefined,
    largeKLen: overK.length,
  };
  db.close();
}

// ── All-ties variant: no ratings, identical last_seen (roster 133) ─────────
{
  const roster = TOOLS;
  const db = openCoachDb(":memory:");
  const store = new CoachStore(db);
  store.upsertCapabilities(roster, 1_000_000);
  const rep = repeatDrafts(store, GIBBERISH, 5, 10);
  const rebuilds = [];
  for (let i = 0; i < 3; i++) {
    const db2 = openCoachDb(":memory:");
    const s2 = new CoachStore(db2);
    s2.upsertCapabilities(roster, 1_000_000);
    rebuilds.push(draftIds(s2, GIBBERISH, 5).join("|"));
    db2.close();
  }
  const insertionHead = roster.slice(0, 5).map((t) => t.id).join("|");
  results.allTies133 = {
    tenRepeatsIdentical: rep.allIdentical,
    observedOrder: rep.first,
    equalsInsertionOrderHead: rep.first === insertionHead,
    crossRebuildIdentical: new Set(rebuilds).size === 1,
    crossRebuildOrders: [...new Set(rebuilds)],
  };
  db.close();
}

// ── File-backed DB: determinism across close/reopen ─────────────────────────
{
  const dbPath = path.join(repo, "docs/lab/tmp-ratings-math/fallback.db");
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(f, { force: true });
  const first = buildStore(dbPath, TOOLS, { distinctLastSeen: true });
  const orderAtBuild = draftIds(first.store, GIBBERISH, 5).join("|");
  first.db.close();
  const reopened = [];
  for (let i = 0; i < 10; i++) {
    const db = openCoachDb(dbPath);
    const store = new CoachStore(db);
    reopened.push(draftIds(store, GIBBERISH, 5).join("|"));
    db.close();
  }
  results.fileBackedReopen = {
    orderAtBuild,
    reopenDraws: 10,
    allReopensIdentical: new Set(reopened).size === 1,
    reopenMatchesBuild: reopened.every((o) => o === orderAtBuild),
    observed: [...new Set(reopened)],
  };
}

results.elapsedMs = Date.now() - t0;
const out = path.join(repo, "docs/lab/tmp-ratings-math/part-c-fallback.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
