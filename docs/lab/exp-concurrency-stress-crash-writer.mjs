#!/usr/bin/env node
/**
 * Experiment (c) victim — a writer the parent kill -9s mid-flight.
 * Two flavors:
 *   mode=longtx : BEGIN IMMEDIATE, stream outcome rows in one big transaction,
 *                 print "INTX" once inside so the parent can kill mid-transaction.
 *                 Every row carries session=<txTag> so atomicity is checkable:
 *                 after crash+reopen the tag must have 0 rows (torn = partial).
 *   mode=apiloop: tight loop of real CoachStore ops (upsertCapabilities,
 *                 recordOutcome, storeBaseVec) with per-commit ACK lines
 *                 "ACK <n>" — the parent kills at a random moment and verifies
 *                 every ACKed commit survived (durability) post-recovery.
 *   mode=bigtx  : one open transaction inserting 64KB blobs until the pager
 *                 cache spills UNCOMMITTED frames into the -wal file (the
 *                 parent watches wal size, then SIGKILLs) — the true test of
 *                 WAL rollback of a torn, partially-flushed transaction.
 * argv[2] = JSON {dbPath, mode, txTag, round}.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cfg = JSON.parse(process.argv[2]);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { CoachStore, openCoachDb } = await import(req.resolve("@rosterhq/coach"));
const { TOOLS } = await import(pathToFileURL(path.join(repo, "docs/lab/corpus.mjs")).href);

const db = openCoachDb(cfg.dbPath);
const store = new CoachStore(db);

if (cfg.mode === "longtx") {
  const ins = db.prepare(
    `INSERT INTO outcome(ts, session, source, capability, class, latency_ms)
     VALUES(?,?,?,?,?,?)`,
  );
  db.exec("BEGIN IMMEDIATE");
  ins.run(Date.now(), cfg.txTag, "crash", "crash__t0", "success", 1);
  process.stdout.write("INTX\n"); // parent kills any time after this line
  // Keep the transaction open and busy indefinitely; only the parent's
  // SIGKILL ends this process — the COMMIT below must never be reached.
  let i = 1;
  for (;;) {
    ins.run(Date.now(), cfg.txTag, "crash", `crash__t${i}`, "success", 1);
    i += 1;
    if (i % 500 === 0) {
      // touch FTS + capability inside the same tx for shadow-table exposure
      db.prepare("UPDATE capability SET last_seen = ? WHERE id = ?").run(Date.now(), "fs__read_file");
    }
  }
} else if (cfg.mode === "bigtx") {
  const ins = db.prepare("INSERT INTO need_vec(need_hash, dims, vec, ts) VALUES(?,?,?,?)");
  db.exec("BEGIN IMMEDIATE");
  ins.run(`${cfg.txTag}-0`, 16384, Buffer.alloc(64 * 1024, 1), Date.now());
  process.stdout.write("INTX\n");
  let i = 1;
  for (;;) {
    // 64KB per row: ~32 rows overflow the ~2MB pager cache and force
    // uncommitted spill frames into the WAL. COMMIT is never reached.
    ins.run(`${cfg.txTag}-${i}`, 16384, Buffer.alloc(64 * 1024, i % 251), Date.now());
    i += 1;
  }
} else {
  // apiloop: real store API calls, ACK after each returns (implicit commit).
  let n = 0;
  const t = TOOLS[cfg.round % TOOLS.length];
  for (;;) {
    store.recordOutcome({
      session: `apiloop-r${cfg.round}`,
      source: t.source,
      capability: t.id,
      outcomeClass: "success",
      latencyMs: 5,
      argsHash: `a${n % 7}`,
    });
    n += 1;
    process.stdout.write(`ACK ${n}\n`);
    if (n % 5 === 0) store.upsertCapabilities([{ ...t, description: `${t.description} r${cfg.round}n${n}` }]);
    if (n % 11 === 0) db.pragma("wal_checkpoint(PASSIVE)");
  }
}
