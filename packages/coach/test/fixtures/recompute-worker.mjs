// A worker for the recomputeRatings cross-process contention test. Several of
// these hammer ONE shared coach.db (WAL) at once: each logs success outcomes
// (recordOutcome — an IMMEDIATE write txn) interleaved with recomputeRatings
// (a write-only txn), exactly the concurrency the finding questioned. A clean
// exit(0) from every worker is the assertion that no writer crashed with
// SQLITE_BUSY or corrupted the file under contention.
import { CoachStore, openCoachDb } from "../../dist/index.js";

const [, , dbPath, capability, session, countStr, itersStr] = process.argv;
const count = Number(countStr);
const iters = Number(itersStr);

const store = new CoachStore(openCoachDb(dbPath));
const perIter = Math.ceil(count / iters);
let logged = 0;
for (let i = 0; i < iters; i++) {
  for (let j = 0; j < perIter && logged < count; j++) {
    store.recordOutcome({ session, source: "contended", capability, outcomeClass: "success", latencyMs: 5 });
    logged += 1;
  }
  store.recomputeRatings();
}
// Log any remainder, then a final recompute.
while (logged < count) {
  store.recordOutcome({ session, source: "contended", capability, outcomeClass: "success", latencyMs: 5 });
  logged += 1;
}
store.recomputeRatings();
store.close();
process.exit(0);
