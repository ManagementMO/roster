// Non-mutating reproduction of the store.test.ts regression test, run against
// the BUILT dist store. Checks whether the test's two `toContain` assertions
// are sensitive to the LEX_SCORE_FLOOR fix.
import { openCoachDb } from "/Users/mo/Downloads/roster/packages/coach/dist/db.js";
import { CoachStore } from "/Users/mo/Downloads/roster/packages/coach/dist/store.js";

const tool = (id, name, description) => ({
  id, kind: "tool", source: id.split("__")[0] ?? "src", name, description,
  inputSchema: { type: "object", properties: { path: { type: "string" } } },
});

const caps = () => ([
  tool("fs__write_file", "write_file", "write text content to a file on disk"),
  tool("sqlite__write_query", "write_query", "write rows via an insert query"),
  tool("x__unrelated", "unrelated", "totally different domain no overlap"),
]);

function assertTest(label, ids) {
  const a = ids.includes("fs__write_file");
  const b = ids.includes("sqlite__write_query");
  const pass = a && b;
  console.log(`[${label}] ids=${JSON.stringify(ids)}`);
  console.log(`   toContain('fs__write_file')=${a}  toContain('sqlite__write_query')=${b}  => TEST ${pass ? "PASS" : "FAIL"}`);
  return pass;
}

// ── 1. POST-FIX (built store, floor present) ───────────────────────────────
{
  const db = openCoachDb(":memory:");
  const store = new CoachStore(db);
  store.upsertCapabilities(caps());
  const cands = store.draftCandidates("write", 5);
  console.log("POST-FIX raw candidates:", cands.map(c => `${c.entry.id}=${c.score}`).join(", "));
  assertTest("POST-FIX (floor=0.05)", cands.map(c => c.entry.id));
}

console.log("");

// ── 2. PRE-FIX (revert the floor: remap [FLOOR,1] back to [0,1], worst→0) ────
// The fixed formula is score = FLOOR + (1-FLOOR)*x, x∈[0,1]. Invert to recover
// the original min-max score x = (score-FLOOR)/(1-FLOOR), which zeroes the worst
// genuine hit — exactly the pre-fix behavior the test claims to guard against.
class PreFixStore extends CoachStore {
  lexicalSearch(need, k = 30) {
    const F = 0.05;
    const hits = super.lexicalSearch(need, k);
    // Only remap when there is a real span (>1 hit); a single hit stays 1.
    if (hits.length <= 1) return hits;
    return hits.map((h) => ({ id: h.id, lexScore: (h.lexScore - F) / (1 - F) }));
  }
}
{
  const db = openCoachDb(":memory:");
  const store = new PreFixStore(db);
  store.upsertCapabilities(caps());
  // Show what the reverted lexical channel produces:
  console.log("PRE-FIX lexicalSearch('write'):", store.lexicalSearch("write", 30).map(h => `${h.id}=${h.lexScore}`).join(", "));
  const cands = store.draftCandidates("write", 5);
  console.log("PRE-FIX raw candidates:", cands.map(c => `${c.entry.id}=${c.score}`).join(", "));
  assertTest("PRE-FIX (floor reverted, worst->0)", cands.map(c => c.entry.id));
}
