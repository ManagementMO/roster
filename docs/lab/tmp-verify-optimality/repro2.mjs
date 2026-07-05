// Verify the finding's PROPOSED strengthened test: seed >=4 rated unrelated
// tools (wilson_lb>0), keep the 2 genuine 'write' hits UNRATED, draft('write',5),
// and assert the worst genuine hit still appears. This should PASS post-fix and
// FAIL pre-fix (fallback fills with rated tools, displacing the zeroed hit).
import { openCoachDb } from "/Users/mo/Downloads/roster/packages/coach/dist/db.js";
import { CoachStore } from "/Users/mo/Downloads/roster/packages/coach/dist/store.js";

const tool = (id, name, description) => ({
  id, kind: "tool", source: id.split("__")[0] ?? "src", name, description,
  inputSchema: { type: "object", properties: { path: { type: "string" } } },
});

class PreFixStore extends CoachStore {
  lexicalSearch(need, k = 30) {
    const F = 0.05;
    const hits = super.lexicalSearch(need, k);
    if (hits.length <= 1) return hits;
    return hits.map((h) => ({ id: h.id, lexScore: (h.lexScore - F) / (1 - F) }));
  }
}

function build(StoreClass) {
  const db = openCoachDb(":memory:");
  const store = new StoreClass(db);
  store.upsertCapabilities([
    tool("fs__write_file", "write_file", "write text content to a file on disk"),
    tool("sqlite__write_query", "write_query", "write rows via an insert query"),
  ]);
  // 4 unrelated tools, each RATED with successes -> wilson_lb > 0.
  for (let i = 0; i < 4; i++) {
    store.upsertCapabilities([tool(`u${i}__op`, `op${i}`, `unrelated operation number ${i} zzz`)]);
    for (let j = 0; j < 5; j++) {
      store.recordOutcome({ session: `s${i}-${j}`, source: `u${i}`, capability: `u${i}__op`, outcomeClass: "success", latencyMs: 10 });
    }
  }
  store.recomputeRatings();
  return store;
}

for (const [label, cls] of [["POST-FIX (floor=0.05)", CoachStore], ["PRE-FIX (floor reverted)", PreFixStore]]) {
  const store = build(cls);
  const cands = store.draftCandidates("write", 5);
  const ids = cands.map(c => c.entry.id);
  const has = ids.includes("fs__write_file");
  console.log(`[${label}] candidates=${cands.map(c => `${c.entry.id}=${c.score.toFixed(3)}`).join(", ")}`);
  console.log(`   assert toContain('fs__write_file') => ${has ? "PASS" : "FAIL"}\n`);
}
