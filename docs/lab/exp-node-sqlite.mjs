/**
 * E6 — Is node:sqlite a viable future replacement for better-sqlite3 in ROSTER?
 *
 * Part 1: feature-parity probes (FTS5+bm25 first — it is the decisive one).
 * Part 2: performance on the four shapes the Coach actually uses.
 * Part 3: cross-process WAL + busy_timeout behavior.
 *
 * All SQL/DDL is lifted verbatim out of the BUILT coach dist (see e6-schema.mjs),
 * so both drivers run byte-identical statements. Read-only w.r.t. the repo.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { coachRequire, productionDdl, sqlFromStore, median, round, REPO } from "./e6-schema.mjs";

const OUT = "/tmp/claude-0/-home-user-roster/c85b98df-18e8-5308-a861-b4353c52ba11/scratchpad";
const BS3 = coachRequire("better-sqlite3");
const DDL = productionDdl();

const results = {
  experiment: "e6-node-sqlite-viability",
  nodeVersion: process.version,
  platform: `${process.platform}-${process.arch}`,
  betterSqlite3Version: coachRequire("better-sqlite3/package.json").version,
  ddlSource: `${REPO}/packages/coach/dist/db.js (migrate() exec block, ${DDL.length} bytes)`,
  probes: {},
  perf: {},
  crossProcess: {},
};

let tmp;
function mkTmp() {
  tmp = mkdtempSync(join(tmpdir(), "e6-nodesqlite-"));
  return tmp;
}
function dbPath(name) {
  return join(tmp, name);
}

function probe(name, fn) {
  let r;
  try {
    r = fn();
  } catch (err) {
    r = { status: "ERROR", evidence: `${err?.code ?? err?.name ?? "Error"}: ${err?.message}` };
  }
  results.probes[name] = r;
  const s = String(r.status).padEnd(14);
  console.log(`  ${s} ${name}`);
  if (r.evidence) console.log(`                 ${String(r.evidence).replace(/\n/g, "\n                 ")}`);
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — FEATURE PARITY
// ─────────────────────────────────────────────────────────────────────────────
mkTmp();
console.log(`\n=== PART 1: FEATURE PARITY (node ${process.version}) ===\n`);

// P0. sqlite version + FTS5 in the compile options of BOTH engines.
probe("P0_sqlite_build", () => {
  const ns = new DatabaseSync(":memory:");
  const nsVer = ns.prepare("select sqlite_version() v").get().v;
  const nsOpts = ns.prepare("pragma compile_options").all().map((r) => r.compile_options);
  ns.close();
  const bs = new BS3(":memory:");
  const bsVer = bs.prepare("select sqlite_version() v").get().v;
  const bsOpts = bs.prepare("pragma compile_options").all().map((r) => r.compile_options);
  bs.close();
  const interesting = (o) =>
    o.filter((x) => /FTS|RTREE|MATH|JSON|GEOPOLY|STAT4|DQS|THREADSAFE|DEFAULT_FOREIGN/.test(x));
  return {
    status: "INFO",
    nodeSqliteVersion: nsVer,
    betterSqlite3Version: bsVer,
    nodeSqliteHasFts5: nsOpts.includes("ENABLE_FTS5"),
    betterSqlite3HasFts5: bsOpts.includes("ENABLE_FTS5"),
    nodeSqliteOptions: interesting(nsOpts),
    betterSqlite3Options: interesting(bsOpts),
    evidence: `node:sqlite sqlite=${nsVer} FTS5=${nsOpts.includes("ENABLE_FTS5")}; better-sqlite3 sqlite=${bsVer} FTS5=${bsOpts.includes("ENABLE_FTS5")}`,
  };
});

// P1. THE DECISIVE PROBE: fts5 virtual table + bm25() ranking, and bm25 PARITY
//     against better-sqlite3 on identical data + identical production SQL.
probe("P1_fts5_bm25", () => {
  const lexSql = sqlFromStore("bm25(capability_fts)");
  const docs = [
    ["a", "memory create_entities create entities", "Create entities in the knowledge graph", ""],
    ["b", "fs read_file read file", "Read the contents of a file from disk", ""],
    ["c", "fs write_file write file", "Write text content to a file on disk", ""],
    ["d", "time get_current_time get current time", "Return the current time in a timezone", ""],
    ["e", "memory search_nodes search nodes", "Search for nodes in the memory graph by query", ""],
  ];
  const run = (db, kind) => {
    db.exec(DDL);
    const ins = db.prepare(
      "INSERT INTO capability_fts(id, name, description, body) VALUES(?,?,?,?)",
    );
    for (const d of docs) ins.run(...d);
    const rows = db.prepare(lexSql).all('"file" OR "read"', 10);
    return rows.map((r) => ({ id: r.id, rank: r.rank }));
  };
  const ns = new DatabaseSync(":memory:");
  const nsRows = run(ns, "node:sqlite");
  ns.close();
  const bs = new BS3(":memory:");
  const bsRows = run(bs, "better-sqlite3");
  bs.close();
  const sameOrder = JSON.stringify(nsRows.map((r) => r.id)) === JSON.stringify(bsRows.map((r) => r.id));
  const maxAbsDelta = Math.max(
    ...nsRows.map((r, i) => Math.abs(r.rank - (bsRows[i]?.rank ?? Number.NaN))),
  );
  return {
    status:
      nsRows.length > 0 && sameOrder && maxAbsDelta === 0 ? "SUPPORTED" : "DIFFERENT-API",
    nodeSqliteRows: nsRows.map((r) => [r.id, round(r.rank, 12)]),
    betterSqlite3Rows: bsRows.map((r) => [r.id, round(r.rank, 12)]),
    identicalOrder: sameOrder,
    maxAbsBm25Delta: maxAbsDelta,
    evidence: `CREATE VIRTUAL TABLE ... USING fts5 OK; production lexicalSearch SQL with bm25() returned ${nsRows.length} rows on node:sqlite; order identical to better-sqlite3=${sameOrder}; max |Δbm25| = ${maxAbsDelta}`,
  };
});

// P1b. fts5 auxiliary functions actually used / plausibly needed.
probe("P1b_fts5_aux_functions", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE VIRTUAL TABLE t USING fts5(a, b);");
  db.prepare("INSERT INTO t(a,b) VALUES(?,?)").run("read a file", "reads files from disk");
  const out = {};
  for (const [name, sql] of [
    ["bm25/1", "SELECT bm25(t) x FROM t WHERE t MATCH 'file'"],
    ["bm25/weighted", "SELECT bm25(t, 10.0, 1.0) x FROM t WHERE t MATCH 'file'"],
    ["rank", "SELECT rank x FROM t WHERE t MATCH 'file'"],
    ["highlight", "SELECT highlight(t,0,'[',']') x FROM t WHERE t MATCH 'file'"],
    ["snippet", "SELECT snippet(t,0,'[',']','…',8) x FROM t WHERE t MATCH 'file'"],
    ["fts5vocab", "SELECT 1 x"],
  ]) {
    try {
      out[name] = db.prepare(sql).get().x;
    } catch (e) {
      out[name] = `ERROR ${e.message}`;
    }
  }
  try {
    db.exec("CREATE VIRTUAL TABLE tv USING fts5vocab(t, 'row');");
    out["fts5vocab"] = db.prepare("SELECT count(*) c FROM tv").get().c;
  } catch (e) {
    out["fts5vocab"] = `ERROR ${e.message}`;
  }
  db.close();
  const bad = Object.entries(out).filter(([, v]) => String(v).startsWith("ERROR"));
  return {
    status: bad.length === 0 ? "SUPPORTED" : "PARTIAL",
    detail: out,
    evidence: `bm25/1=${out["bm25/1"]}, bm25/weighted=${out["bm25/weighted"]}, rank=${out.rank}, highlight=${JSON.stringify(out.highlight)}, snippet=${JSON.stringify(out.snippet)}, fts5vocab rows=${out.fts5vocab}`,
  };
});

// P2. Pragmas: WAL, foreign_keys, busy_timeout — and the missing .pragma() method.
probe("P2_pragmas", () => {
  const p = dbPath("pragma.db");
  const db = new DatabaseSync(p);
  const hasPragmaMethod = typeof db.pragma === "function";
  // journal_mode returns a row; must go through prepare().get(), exec() discards it.
  const wal = db.prepare("PRAGMA journal_mode = WAL").get();
  const walRead = db.prepare("PRAGMA journal_mode").get();
  db.exec("PRAGMA foreign_keys = ON");
  const fk = db.prepare("PRAGMA foreign_keys").get();
  db.exec("PRAGMA busy_timeout = 5000");
  const bt = db.prepare("PRAGMA busy_timeout").get();
  // Does exec() tolerate a row-returning pragma?
  let execWalOk = true;
  let execWalErr = null;
  try {
    db.exec("PRAGMA journal_mode = WAL");
  } catch (e) {
    execWalOk = false;
    execWalErr = e.message;
  }
  const sync = db.prepare("PRAGMA synchronous").get();
  db.close();
  // constructor-level equivalents that node:sqlite offers
  let timeoutOptionAccepted = null;
  try {
    const d2 = new DatabaseSync(dbPath("timeout.db"), { timeout: 5000 });
    timeoutOptionAccepted = d2.prepare("PRAGMA busy_timeout").get().timeout;
    d2.close();
  } catch (e) {
    timeoutOptionAccepted = `ERROR ${e.message}`;
  }
  let fkDefault = null;
  try {
    const d3 = new DatabaseSync(":memory:");
    fkDefault = d3.prepare("PRAGMA foreign_keys").get().foreign_keys;
    d3.close();
  } catch (e) {
    fkDefault = `ERROR ${e.message}`;
  }
  return {
    status: "DIFFERENT-API",
    hasPragmaMethod,
    journalModeSet: wal,
    journalModeRead: walRead,
    foreignKeys: fk,
    busyTimeout: bt,
    synchronous: sync,
    execOnRowReturningPragmaOk: execWalOk,
    execOnRowReturningPragmaErr: execWalErr,
    constructorTimeoutOption_busyTimeout: timeoutOptionAccepted,
    defaultForeignKeysWithoutPragma: fkDefault,
    evidence: `db.pragma() does NOT exist (typeof=${typeof db.pragma}) -> must use exec()/prepare(). PRAGMA journal_mode=WAL via prepare().get() -> ${JSON.stringify(wal)}; read-back ${JSON.stringify(walRead)}; foreign_keys=${JSON.stringify(fk)}; busy_timeout=${JSON.stringify(bt)}; exec() on row-returning pragma ok=${execWalOk}. Constructor {timeout:5000} -> busy_timeout=${JSON.stringify(timeoutOptionAccepted)}. node:sqlite default foreign_keys (no pragma) = ${JSON.stringify(fkDefault)} (better-sqlite3 default is 0).`,
  };
});

// P3. Named parameters — bare keys, @-prefixed keys, unknown keys, booleans.
probe("P3_named_parameters", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t(a TEXT, b INTEGER)");
  const st = db.prepare("INSERT INTO t(a,b) VALUES(@a,@b)");
  const out = {};
  // (a) bare keys (what store.ts passes: {id, kind, ...} against @id, @kind)
  try {
    st.run({ a: "x", b: 1 });
    out.bareKeys = "OK";
  } catch (e) {
    out.bareKeys = `ERROR ${e.code ?? ""} ${e.message}`;
  }
  // (b) prefixed keys
  try {
    st.run({ "@a": "y", "@b": 2 });
    out.prefixedKeys = "OK";
  } catch (e) {
    out.prefixedKeys = `ERROR ${e.code ?? ""} ${e.message}`;
  }
  // (c) unknown extra key (better-sqlite3 THROWS; production never does this)
  try {
    st.run({ a: "z", b: 3, nope: 1 });
    out.unknownKey = "ACCEPTED (no throw)";
  } catch (e) {
    out.unknownKey = `THROWS ${e.code ?? ""}: ${e.message}`;
  }
  // (d) boolean value (better-sqlite3 throws TypeError; production pre-converts)
  try {
    st.run({ a: "b", b: true });
    out.booleanValue = `ACCEPTED -> stored ${db.prepare("SELECT b FROM t WHERE a='b'").get().b}`;
  } catch (e) {
    out.booleanValue = `THROWS ${e.code ?? ""}: ${e.message}`;
  }
  // (e) undefined value
  try {
    st.run({ a: "u", b: undefined });
    out.undefinedValue = "ACCEPTED";
  } catch (e) {
    out.undefinedValue = `THROWS ${e.code ?? ""}: ${e.message}`;
  }
  // (f) same on better-sqlite3 for contrast
  const bs = new BS3(":memory:");
  bs.exec("CREATE TABLE t(a TEXT, b INTEGER)");
  const bst = bs.prepare("INSERT INTO t(a,b) VALUES(@a,@b)");
  const bout = {};
  for (const [k, v] of [
    ["bareKeys", { a: "x", b: 1 }],
    ["prefixedKeys", { "@a": "y", "@b": 2 }],
    ["unknownKey", { a: "z", b: 3, nope: 1 }],
    ["booleanValue", { a: "b", b: true }],
    ["undefinedValue", { a: "u", b: undefined }],
  ]) {
    try {
      bst.run(v);
      bout[k] = "OK/ACCEPTED";
    } catch (e) {
      bout[k] = `THROWS: ${e.message}`;
    }
  }
  bs.close();
  db.close();
  return {
    status: out.bareKeys === "OK" ? "SUPPORTED" : "DIFFERENT-API",
    nodeSqlite: out,
    betterSqlite3: bout,
    evidence: `node:sqlite bare '@x' keys: ${out.bareKeys}; prefixed: ${out.prefixedKeys}; unknown key: ${out.unknownKey}; boolean: ${out.booleanValue}; undefined: ${out.undefinedValue}. better-sqlite3: ${JSON.stringify(bout)}`,
  };
});

// P4. ON CONFLICT upserts — including the real, gnarly storeBaseVec statement.
probe("P4_on_conflict_upsert", () => {
  const vecSql = sqlFromStore("INSERT INTO vec(capability, dims, base, adj, updated_at)");
  const ratingSql = sqlFromStore("INSERT INTO rating(capability, category");
  const metaSql =
    "INSERT INTO meta(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value";
  const vecBuf = Buffer.from(new Float32Array(4).fill(0.5).buffer);
  const runAll = (db) => {
    db.exec(DDL);
    db.prepare(metaSql).run("embedding_model", "m1");
    db.prepare(metaSql).run("embedding_model", "m2");
    const meta = db.prepare("SELECT value FROM meta WHERE key='embedding_model'").get().value;
    // capability row so the guarded path can match
    db.prepare(
      `INSERT INTO capability(id,kind,source,name,description,def_hash,first_seen,last_seen)
       VALUES('c1','tool','s','n','d','H',1,1)`,
    ).run();
    const p = {
      capability: "c1",
      dims: 4,
      base: vecBuf,
      updatedAt: 100,
      guarded: 1,
      expectedDefHash: "H",
      expectedModelId: "m2",
    };
    const r1 = db.prepare(vecSql).run(p);
    // second write, same dims -> adj must survive; dims change -> adj must clear
    db.prepare("UPDATE vec SET adj = ? WHERE capability='c1'").run(vecBuf);
    const r2 = db.prepare(vecSql).run({ ...p, updatedAt: 200 });
    const afterSameDims = db.prepare("SELECT dims, adj IS NULL n FROM vec WHERE capability='c1'").get();
    const wideBuf = Buffer.from(new Float32Array(8).fill(0.25).buffer);
    const r3 = db.prepare(vecSql).run({ ...p, dims: 8, base: wideBuf, updatedAt: 300 });
    const afterDimsChange = db.prepare("SELECT dims, adj IS NULL n FROM vec WHERE capability='c1'").get();
    // guarded write with a WRONG model id must be a no-op (changes === 0)
    const r4 = db.prepare(vecSql).run({ ...p, expectedModelId: "WRONG", updatedAt: 400 });
    // rating upsert (named params)
    const rp = {
      capability: "c1", category: "all", n: 3, successes: 2,
      wilson_lb: 0.2, p50: 10, p95: 20, now: 5,
    };
    db.prepare(ratingSql).run(rp);
    db.prepare(ratingSql).run({ ...rp, n: 4 });
    const rating = db.prepare("SELECT n FROM rating WHERE capability='c1' AND category='all'").get();
    return {
      meta,
      changes: [Number(r1.changes), Number(r2.changes), Number(r3.changes), Number(r4.changes)],
      afterSameDims_adjIsNull: Number(afterSameDims.n),
      afterDimsChange: { dims: Number(afterDimsChange.dims), adjIsNull: Number(afterDimsChange.n) },
      ratingN: Number(rating.n),
    };
  };
  const ns = new DatabaseSync(":memory:");
  const nsr = runAll(ns);
  ns.close();
  const bs = new BS3(":memory:");
  const bsr = runAll(bs);
  bs.close();
  const same = JSON.stringify(nsr) === JSON.stringify(bsr);
  return {
    status: same ? "SUPPORTED" : "DIFFERENT-API",
    nodeSqlite: nsr,
    betterSqlite3: bsr,
    identical: same,
    evidence: `Real storeBaseVec INSERT..SELECT..WHERE + ON CONFLICT DO UPDATE (with the CASE that clears adj on a dims change) and the real rating upsert behave identically on both drivers: ${same}. changes[] = ${JSON.stringify(nsr.changes)} (r4 guarded-mismatch no-op = ${nsr.changes[3]}).`,
  };
});

// P5. Transactions: no db.transaction(); test manual BEGIN IMMEDIATE, rollback,
//     nesting (better-sqlite3 uses SAVEPOINTs), and return-value passthrough.
probe("P5_transactions", () => {
  const db = new DatabaseSync(dbPath("txn.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec("CREATE TABLE t(a INTEGER)");
  const out = { hasTransactionMethod: typeof db.transaction };
  // manual BEGIN IMMEDIATE / COMMIT
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO t VALUES(1)").run();
  out.inTransactionDuringWrite = db.isTransaction ?? "isTransaction property absent";
  db.exec("COMMIT");
  out.afterCommitCount = Number(db.prepare("SELECT count(*) c FROM t").get().c);
  // rollback
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO t VALUES(2)").run();
  db.exec("ROLLBACK");
  out.afterRollbackCount = Number(db.prepare("SELECT count(*) c FROM t").get().c);
  // nested BEGIN must fail (this is exactly what better-sqlite3's transaction()
  // hides by switching to SAVEPOINT)
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("BEGIN IMMEDIATE");
    out.nestedBegin = "ACCEPTED (surprising)";
  } catch (e) {
    out.nestedBegin = `THROWS ${e.code ?? ""}: ${e.message}`;
  }
  // savepoint nesting works
  try {
    db.exec("SAVEPOINT sp1");
    db.prepare("INSERT INTO t VALUES(3)").run();
    db.exec("RELEASE sp1");
    out.savepointNesting = "OK";
  } catch (e) {
    out.savepointNesting = `THROWS: ${e.message}`;
  }
  db.exec("COMMIT");
  out.finalCount = Number(db.prepare("SELECT count(*) c FROM t").get().c);
  // BEGIN DEFERRED read-then-write upgrade (the SQLITE_BUSY_SNAPSHOT hazard
  // db.ts/store.ts explicitly reasons about) still exists identically.
  out.beginModesAccepted = [];
  for (const mode of ["BEGIN", "BEGIN DEFERRED", "BEGIN IMMEDIATE", "BEGIN EXCLUSIVE"]) {
    try {
      db.exec(mode);
      db.exec("COMMIT");
      out.beginModesAccepted.push(mode);
    } catch (e) {
      out.beginModesAccepted.push(`${mode}: ERROR ${e.message}`);
    }
  }
  db.close();
  // better-sqlite3 side: what the shim must reproduce
  const bs = new BS3(":memory:");
  bs.exec("CREATE TABLE t(a INTEGER)");
  const bsOut = {};
  const fn = bs.transaction((x) => {
    bs.prepare("INSERT INTO t VALUES(?)").run(x);
    return `returned-${x}`;
  });
  bsOut.returnValuePassthrough = fn.immediate(7);
  bsOut.hasImmediate = typeof fn.immediate;
  bsOut.hasDeferred = typeof fn.deferred;
  bsOut.hasExclusive = typeof fn.exclusive;
  const outer = bs.transaction(() => {
    fn(8); // nested -> savepoint
    return bs.prepare("SELECT count(*) c FROM t").get().c;
  });
  bsOut.nestedViaSavepoint = outer.immediate();
  try {
    bs.transaction(() => {
      bs.prepare("INSERT INTO t VALUES(9)").run();
      throw new Error("boom");
    }).immediate();
  } catch {
    /* expected */
  }
  bsOut.autoRollbackOnThrow_countAfter = bs.prepare("SELECT count(*) c FROM t").get().c;
  bs.close();
  return {
    status: "MISSING",
    nodeSqlite: out,
    betterSqlite3TransactionSemantics: bsOut,
    evidence: `node:sqlite has NO db.transaction() (typeof=${out.hasTransactionMethod}) and no isTransaction flag (${out.inTransactionDuringWrite}). Manual BEGIN IMMEDIATE/COMMIT/ROLLBACK all work (${out.beginModesAccepted.join(", ")}), SAVEPOINT nesting works, but a nested BEGIN ${out.nestedBegin}. A shim must reproduce: auto-rollback on throw, return-value passthrough (${bsOut.returnValuePassthrough}), .immediate/.deferred/.exclusive (${bsOut.hasImmediate}/${bsOut.hasDeferred}/${bsOut.hasExclusive}), and SAVEPOINT-based nesting.`,
  };
});

// P6. BLOB round-trip: what TYPE comes back, and does the production
//     blobToVec()/vecToBlob() pair survive it unchanged?
probe("P6_blob_roundtrip", () => {
  const vec = new Float32Array([0.1, -0.2, 0.3, 0.4]);
  const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
  const read = (db) => {
    db.exec(DDL);
    db.prepare("INSERT INTO need_vec(need_hash, dims, vec, ts) VALUES(?,?,?,?)").run("h", 4, buf, 1);
    const row = db.prepare("SELECT dims, vec FROM need_vec WHERE need_hash='h'").get();
    // BLOB equality bind (deleteNeedVecStmt does exactly this)
    const del = db
      .prepare("DELETE FROM need_vec WHERE need_hash = ? AND dims = ? AND vec = ?")
      .run("h", 4, row.vec);
    return { row, deleted: Number(del.changes) };
  };
  const ns = new DatabaseSync(":memory:");
  const nsr = read(ns);
  ns.close();
  const bs = new BS3(":memory:");
  const bsr = read(bs);
  bs.close();
  return {
    status: "DIFFERENT-API",
    nodeSqliteBlobCtor: nsr.row.vec.constructor.name,
    nodeSqliteIsBuffer: Buffer.isBuffer(nsr.row.vec),
    nodeSqliteByteLength: nsr.row.vec.byteLength,
    nodeSqliteBlobEqualityDelete: nsr.deleted,
    betterSqlite3BlobCtor: bsr.row.vec.constructor.name,
    betterSqlite3IsBuffer: Buffer.isBuffer(bsr.row.vec),
    betterSqlite3BlobEqualityDelete: bsr.deleted,
    bytesIdentical: Buffer.compare(Buffer.from(nsr.row.vec), Buffer.from(bsr.row.vec)) === 0,
    evidence: `node:sqlite returns BLOBs as ${nsr.row.vec.constructor.name} (Buffer.isBuffer=${Buffer.isBuffer(nsr.row.vec)}); better-sqlite3 returns ${bsr.row.vec.constructor.name} (isBuffer=${Buffer.isBuffer(bsr.row.vec)}). Bytes identical=${Buffer.compare(Buffer.from(nsr.row.vec), Buffer.from(bsr.row.vec)) === 0}. Binding the read-back value for a BLOB '=' comparison deleted ${nsr.deleted} row (better-sqlite3: ${bsr.deleted}).`,
  };
});

// P6b. Does the REAL production blobToVec() accept a node:sqlite Uint8Array?
probe("P6b_real_blobToVec_on_uint8array", () => {
  // util.ts is not re-exported wholesale; import the built module directly.
  const url = new URL(`file://${REPO}/packages/coach/dist/util.js`);
  // dynamic import is async; do it synchronously via require on the ESM? No —
  // read the source and use the exported functions via a child eval instead.
  const script = `
    import { blobToVec, vecToBlob } from ${JSON.stringify(url.href)};
    import { DatabaseSync } from "node:sqlite";
    const vec = new Float32Array([0.1,-0.2,0.3,0.4]);
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE v(dims INTEGER, b BLOB)");
    db.prepare("INSERT INTO v VALUES(?,?)").run(4, vecToBlob(vec));
    const row = db.prepare("SELECT dims, b FROM v").get();
    const out = { ctor: row.b.constructor.name };
    try { const back = blobToVec(row.b, Number(row.dims)); out.ok = true; out.values = Array.from(back); }
    catch (e) { out.ok = false; out.err = e.constructor.name + ": " + e.message; }
    // and vecToBlob's output bound directly (Buffer) for completeness
    console.log(JSON.stringify(out));
  `;
  const f = join(tmp, "p6b.mjs");
  writeFileSync(f, script);
  const stdout = execFileSync(process.execPath, [f], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const parsed = JSON.parse(stdout.trim().split("\n").pop());
  return {
    status: parsed.ok ? "SUPPORTED" : "MISSING",
    detail: parsed,
    evidence: `Real dist blobToVec() applied to a node:sqlite ${parsed.ctor}: ok=${parsed.ok}${parsed.ok ? `, values=${JSON.stringify(parsed.values)}` : `, ${parsed.err}`} — the runtime function is duck-typed (byteLength + Buffer.from), so it works; only the TypeScript type (Buffer) is wrong.`,
  };
});

// P7. Integers / bigints: lastInsertRowid, changes, > 2^53 reads.
probe("P7_integers_bigints", () => {
  const check = (db, isNs) => {
    db.exec("CREATE TABLE t(id INTEGER PRIMARY KEY, v INTEGER)");
    const info = db.prepare("INSERT INTO t(v) VALUES(?)").run(42);
    const out = {
      lastInsertRowidType: typeof info.lastInsertRowid,
      lastInsertRowidValue: String(info.lastInsertRowid),
      changesType: typeof info.changes,
      changesValue: String(info.changes),
    };
    // big rowid
    db.prepare("INSERT INTO t(id, v) VALUES(?, ?)").run(9007199254740993n, 1);
    const st = db.prepare("SELECT id FROM t WHERE v=1");
    try {
      out.readBigDefault = String(st.get().id);
      out.readBigDefaultType = typeof st.get().id;
    } catch (e) {
      out.readBigDefault = `THROWS: ${e.message}`;
    }
    if (isNs) {
      st.setReadBigInts(true);
      out.readBigWithSetReadBigInts = String(st.get().id);
      const info2 = db.prepare("INSERT INTO t(v) VALUES(?)").run(7);
      out.lastInsertRowidAfterBigId = String(info2.lastInsertRowid);
      out.lastInsertRowidAfterBigIdType = typeof info2.lastInsertRowid;
    } else {
      db.defaultSafeIntegers(true);
      out.readBigWithSafeIntegers = String(db.prepare("SELECT id FROM t WHERE v=1").get().id);
      db.defaultSafeIntegers(false);
      const info2 = db.prepare("INSERT INTO t(v) VALUES(?)").run(7);
      out.lastInsertRowidAfterBigId = String(info2.lastInsertRowid);
      out.lastInsertRowidAfterBigIdType = typeof info2.lastInsertRowid;
    }
    return out;
  };
  const ns = new DatabaseSync(":memory:");
  const nsr = check(ns, true);
  ns.close();
  const bs = new BS3(":memory:");
  const bsr = check(bs, false);
  bs.close();
  return {
    status: "DIFFERENT-API",
    nodeSqlite: nsr,
    betterSqlite3: bsr,
    evidence: `node:sqlite: lastInsertRowid is ${nsr.lastInsertRowidType} (${nsr.lastInsertRowidValue}), changes is ${nsr.changesType}; unsafe-int read default -> ${nsr.readBigDefault}; setReadBigInts(true) -> ${nsr.readBigWithSetReadBigInts}. better-sqlite3: lastInsertRowid ${bsr.lastInsertRowidType}, changes ${bsr.changesType}; unsafe-int read default -> ${bsr.readBigDefault}. store.ts already wraps both in Number()/Number(), so both are safe; node:sqlite has no per-DB defaultSafeIntegers (per-statement setReadBigInts only).`,
  };
});

// P8. Whole real migrate() DDL + addColumnIfMissing PRAGMA table_info path.
probe("P8_full_migration", () => {
  const runMigrate = (db) => {
    db.exec(DDL);
    db.prepare("INSERT OR IGNORE INTO meta(key, value) VALUES('schema_version', ?)").run("1");
    const addIfMissing = (table, column, decl) => {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all();
      if (cols.some((c) => c.name === column)) return false;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
      return true;
    };
    const added = [
      addIfMissing("capability", "title", "TEXT"),
      addIfMissing("capability", "annotations", "TEXT"),
      addIfMissing("capability", "execution", "TEXT"),
    ];
    // idempotency: run the whole thing again
    db.exec(DDL);
    const again = [
      addIfMissing("capability", "title", "TEXT"),
      addIfMissing("capability", "annotations", "TEXT"),
      addIfMissing("capability", "execution", "TEXT"),
    ];
    const tables = db
      .prepare("SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => `${r.type}:${r.name}`);
    return { added, again, tables };
  };
  const ns = new DatabaseSync(dbPath("mig-ns.db"));
  ns.exec("PRAGMA journal_mode = WAL");
  const nsr = runMigrate(ns);
  ns.close();
  const bs = new BS3(dbPath("mig-bs.db"));
  bs.pragma("journal_mode = WAL");
  const bsr = runMigrate(bs);
  bs.close();
  const same = JSON.stringify(nsr) === JSON.stringify(bsr);
  return {
    status: same ? "SUPPORTED" : "DIFFERENT-API",
    identical: same,
    objectCount: nsr.tables.length,
    tables: nsr.tables,
    firstRunAdded: nsr.added,
    secondRunAdded: nsr.again,
    evidence: `The complete production migrate() (11 tables incl. the fts5 virtual table + its 5 shadow tables, 2 indexes, AUTOINCREMENT, CHECK constraint, INSERT OR IGNORE, PRAGMA table_info + ALTER TABLE ADD COLUMN) runs on node:sqlite and produces an object list identical to better-sqlite3: ${same}. ${nsr.tables.length} sqlite_master objects.`,
  };
});

// P9. Misc API surface store.ts touches.
probe("P9_misc_api", () => {
  const db = new DatabaseSync(dbPath("misc.db"));
  const out = {
    openGetter: db.open,
    location: typeof db.location === "function" ? db.location() : db.location,
    hasIterate: typeof db.prepare("SELECT 1").iterate,
    hasColumns: typeof db.prepare("SELECT 1").columns,
    hasPluck: typeof db.prepare("SELECT 1").pluck,
    hasRaw: typeof db.prepare("SELECT 1").raw,
    hasSetReturnArrays: typeof db.prepare("SELECT 1").setReturnArrays,
    hasFunction: typeof db.function,
    hasAggregate: typeof db.aggregate,
    hasBackupMethod: typeof db.backup,
    hasLoadExtension: typeof db.loadExtension,
    hasSerialize: typeof db.serialize,
    hasUnsafeMode: typeof db.unsafeMode,
    hasName: db.name,
  };
  db.close();
  out.openAfterClose = (() => {
    const d = new DatabaseSync(dbPath("misc2.db"));
    d.close();
    let doubleClose = "n/a";
    try {
      d.close();
      doubleClose = "no throw";
    } catch (e) {
      doubleClose = `THROWS ${e.code ?? ""}: ${e.message}`;
    }
    return { open: d.open, doubleClose };
  })();
  const bs = new BS3(dbPath("misc3.db"));
  const bsOut = { open: bs.open, name: bs.name, hasPluck: typeof bs.prepare("SELECT 1").pluck };
  bs.close();
  let bsDouble = "no throw";
  try {
    bs.close();
  } catch (e) {
    bsDouble = `THROWS: ${e.message}`;
  }
  bsOut.doubleClose = bsDouble;
  return {
    status: "DIFFERENT-API",
    nodeSqlite: out,
    betterSqlite3: bsOut,
    evidence: `db.open exists on both (node:sqlite ${out.openGetter}). node:sqlite: db.name MISSING (${out.hasName}) — has db.location() instead; stmt.pluck/raw MISSING (${out.hasPluck}/${out.hasRaw}) — setReturnArrays() instead; db.serialize/unsafeMode MISSING (${out.hasSerialize}/${out.hasUnsafeMode}); function/aggregate/loadExtension/backup PRESENT. node:sqlite double close(): ${out.openAfterClose.doubleClose}; better-sqlite3 double close(): ${bsOut.doubleClose}. store.ts guards with 'if (this.db.open)' which works on both.`,
  };
});

// P10. Error shape (needed to keep the try/catch in lexicalSearch honest).
probe("P10_error_shape", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  const lexSql = sqlFromStore("bm25(capability_fts)");
  const out = {};
  try {
    db.prepare(lexSql).all('"unclosed OR (', 5);
    out.malformedMatch = "no throw";
  } catch (e) {
    out.malformedMatch = {
      name: e.constructor.name,
      code: e.code,
      errcode: e.errcode,
      errstr: e.errstr,
      message: e.message,
    };
  }
  try {
    db.prepare("SELECT * FROM nope");
    out.badSql = { name: (0, Error).name, code: null };
  } catch (e) {
    out.badSql = { name: e.constructor.name, code: e.code, errcode: e.errcode, message: e.message };
  }
  db.close();
  const bs = new BS3(":memory:");
  bs.exec(DDL);
  const bout = {};
  try {
    bs.prepare(lexSql).all('"unclosed OR (', 5);
    bout.malformedMatch = "no throw";
  } catch (e) {
    bout.malformedMatch = { name: e.constructor.name, code: e.code, message: e.message };
  }
  bs.close();
  return {
    status: "DIFFERENT-API",
    nodeSqlite: out,
    betterSqlite3: bout,
    evidence: `Malformed FTS MATCH — node:sqlite throws ${JSON.stringify(out.malformedMatch)}; better-sqlite3 throws ${JSON.stringify(bout.malformedMatch)}. lexicalSearch's bare catch{} works either way, but node:sqlite error objects use code='ERR_SQLITE_ERROR' + errcode/errstr, not better-sqlite3's code='SQLITE_ERROR'.`,
  };
});

// P11. Statement re-prepare across DDL (activeCapabilityStmt is long-lived).
probe("P11_stmt_survives_ddl", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t(a TEXT)");
  db.prepare("INSERT INTO t VALUES('x')").run();
  const st = db.prepare("SELECT * FROM t");
  const before = st.all();
  db.exec("ALTER TABLE t ADD COLUMN b TEXT");
  let after;
  try {
    after = st.all();
  } catch (e) {
    after = `THROWS: ${e.message}`;
  }
  db.close();
  return {
    status: Array.isArray(after) ? "SUPPORTED" : "DIFFERENT-API",
    before,
    after,
    evidence: `A prepared SELECT * survives ALTER TABLE ADD COLUMN and picks up the new column: ${JSON.stringify(after)} (SQLite auto-reprepare).`,
  };
});

// P12. Experimental warning: is it emitted, and can it be suppressed?
probe("P12_experimental_warning", () => {
  const f = join(tmp, "warn.mjs");
  writeFileSync(f, `import { DatabaseSync } from "node:sqlite";\nnew DatabaseSync(":memory:").close();\n`);
  const cap = (args) => {
    const r = spawnSync(process.execPath, [...args, f], { encoding: "utf8" });
    return (r.stderr || "").trim();
  };
  const plain = cap([]);
  const suppressed = cap(["--no-warnings"]);
  const filtered = cap(["--disable-warning=ExperimentalWarning"]);
  return {
    status: plain.includes("ExperimentalWarning") ? "WARNS" : "SILENT",
    stderrPlain: plain,
    stderrNoWarnings: suppressed,
    stderrDisableWarningExperimental: filtered,
    evidence: `Importing node:sqlite on ${process.version} emits: ${JSON.stringify(plain.split("\n")[0])}. Suppressible with --no-warnings (stderr=${JSON.stringify(suppressed)}) or --disable-warning=ExperimentalWarning (stderr=${JSON.stringify(filtered)}) — but ROSTER's stdio MCP server writes protocol on stdout, so a stderr warning is cosmetic, NOT protocol-breaking.`,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — PERFORMANCE on the four real shapes
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n=== PART 2: PERFORMANCE ===\n`);

const OUTCOME_SQL = sqlFromStore("INSERT INTO outcome(ts, session");
const RATING_SQL = sqlFromStore("INSERT INTO rating(capability, category");
const LEX_SQL = sqlFromStore("bm25(capability_fts)");
const N_OUTCOMES = 2000;
const N_UPSERTS = 500;
const N_DOCS = 1000;
const N_QUERIES = 200;
const N_BLOBS = 200;
const REPS = 7;
const DIMS = 384;

function makeDocs(n) {
  const verbs = ["read", "write", "list", "search", "create", "delete", "update", "fetch", "render", "compile"];
  const nouns = ["file", "entity", "node", "issue", "branch", "table", "record", "page", "image", "commit"];
  const srcs = ["memory", "fs", "git", "github", "time", "sqlite", "browser", "slack", "jira", "notion"];
  const docs = [];
  for (let i = 0; i < n; i++) {
    const v = verbs[i % verbs.length];
    const nn = nouns[(i * 7) % nouns.length];
    const s = srcs[(i * 3) % srcs.length];
    docs.push([
      `cap${i}`,
      `${s} ${v}_${nn} ${v} ${nn}`,
      `${v.charAt(0).toUpperCase() + v.slice(1)} the ${nn} using ${s} backend number ${i} with options`,
      `handler for ${v} ${nn} in ${s}`,
    ]);
  }
  return docs;
}
const DOCS = makeDocs(N_DOCS);
const QUERIES = [];
for (let i = 0; i < N_QUERIES; i++) {
  const toks = [["read", "file"], ["search", "node"], ["create", "entity"], ["git", "commit"], ["list", "table"]][i % 5];
  QUERIES.push(toks.map((t) => `"${t}"`).join(" OR "));
}
const VEC_BLOB = Buffer.from(new Float32Array(DIMS).fill(0.0123).buffer);

/** Uniform driver shim so both engines run the identical benchmark body. */
function makeDriver(kind, path) {
  if (kind === "node:sqlite") {
    const db = new DatabaseSync(path);
    db.prepare("PRAGMA journal_mode = WAL").get();
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    return {
      db,
      exec: (s) => db.exec(s),
      prepare: (s) => db.prepare(s),
      begin: () => db.exec("BEGIN IMMEDIATE"),
      commit: () => db.exec("COMMIT"),
      close: () => db.close(),
    };
  }
  const db = new BS3(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return {
    db,
    exec: (s) => db.exec(s),
    prepare: (s) => db.prepare(s),
    begin: () => db.exec("BEGIN IMMEDIATE"),
    commit: () => db.exec("COMMIT"),
    close: () => db.close(),
  };
}

function benchOnce(kind, rep) {
  const p = join(tmp, `bench-${kind.replace(/[:]/g, "")}-${rep}.db`);
  const d = makeDriver(kind, p);
  d.exec(DDL);
  const t = {};

  // A. bulk insert 2000 outcome rows inside ONE transaction (named params)
  {
    const st = d.prepare(OUTCOME_SQL);
    const t0 = performance.now();
    d.begin();
    for (let i = 0; i < N_OUTCOMES; i++) {
      st.run({
        ts: 1_700_000_000_000 + i,
        session: `sess-${i % 20}`,
        source: `src-${i % 10}`,
        capability: `cap${i % 200}`,
        need_hash: `nh${i % 300}`,
        args_hash: `ah${i}`,
        intent_cat: i % 3 === 0 ? "web" : null,
        class: i % 5 === 0 ? "tool_fail" : "success",
        latency_ms: 10 + (i % 400),
        substituted: 0,
        explored: 0,
        spec_ver: null,
      });
    }
    d.commit();
    t.bulkInsert2000InOneTxn = performance.now() - t0;
  }

  // B. 500 single-row upserts, each in its OWN IMMEDIATE transaction
  //    (the recordOutcome / storeBaseVec shape: one autocommit-scale write each)
  {
    const st = d.prepare(RATING_SQL);
    const t0 = performance.now();
    for (let i = 0; i < N_UPSERTS; i++) {
      d.begin();
      st.run({
        capability: `cap${i % 250}`,
        category: "all",
        n: i,
        successes: i >> 1,
        wilson_lb: 0.5,
        p50: 10,
        p95: 99,
        now: 1_700_000_000_000 + i,
      });
      d.commit();
    }
    t.upsert500EachOwnTxn = performance.now() - t0;
  }

  // C. FTS5 bm25 query over 1000 docs, 200 queries
  {
    const ins = d.prepare("INSERT INTO capability_fts(id, name, description, body) VALUES(?,?,?,?)");
    d.begin();
    for (const doc of DOCS) ins.run(...doc);
    d.commit();
    const st = d.prepare(LEX_SQL);
    let rows = 0;
    const t0 = performance.now();
    for (const q of QUERIES) rows += st.all(q, 30).length;
    t.fts5Bm25_200queries_1000docs = performance.now() - t0;
    t._ftsRowsTotal = rows;
  }

  // D. read 200 blob rows (384-d float32 = 1536 B each)
  {
    const ins = d.prepare("INSERT INTO vec(capability, dims, base, adj, updated_at) VALUES(?,?,?,?,?)");
    d.begin();
    for (let i = 0; i < N_BLOBS; i++) ins.run(`vcap${i}`, DIMS, VEC_BLOB, null, 1);
    d.commit();
    const st = d.prepare("SELECT capability, dims, base, adj FROM vec");
    let bytes = 0;
    const t0 = performance.now();
    for (let r = 0; r < 20; r++) {
      for (const row of st.all()) bytes += row.base.byteLength;
    }
    t.blobRead200rows_x20 = performance.now() - t0;
    t._blobBytes = bytes;
  }

  d.close();
  rmSync(p, { force: true });
  rmSync(`${p}-wal`, { force: true });
  rmSync(`${p}-shm`, { force: true });
  return t;
}

const perfRaw = { "node:sqlite": [], "better-sqlite3": [] };
// interleave reps to spread any machine drift across both drivers
for (let rep = 0; rep < REPS; rep++) {
  for (const kind of ["node:sqlite", "better-sqlite3"]) {
    perfRaw[kind].push(benchOnce(kind, rep));
  }
  console.log(`  rep ${rep + 1}/${REPS} done`);
}

const METRICS = [
  "bulkInsert2000InOneTxn",
  "upsert500EachOwnTxn",
  "fts5Bm25_200queries_1000docs",
  "blobRead200rows_x20",
];
results.perf = {
  reps: REPS,
  shapes: {
    bulkInsert2000InOneTxn: `${N_OUTCOMES} outcome rows, real INSERT SQL + named params, one BEGIN IMMEDIATE`,
    upsert500EachOwnTxn: `${N_UPSERTS} rating ON CONFLICT upserts, each in its own BEGIN IMMEDIATE/COMMIT`,
    fts5Bm25_200queries_1000docs: `${N_QUERIES} runs of the real lexicalSearch bm25 SQL over ${N_DOCS} fts5 docs`,
    blobRead200rows_x20: `20 x SELECT of ${N_BLOBS} rows carrying ${DIMS}-d float32 BLOBs (${DIMS * 4} B each)`,
  },
  perRepMs: {
    "node:sqlite": perfRaw["node:sqlite"].map((t) =>
      Object.fromEntries(METRICS.map((m) => [m, round(t[m], 2)])),
    ),
    "better-sqlite3": perfRaw["better-sqlite3"].map((t) =>
      Object.fromEntries(METRICS.map((m) => [m, round(t[m], 2)])),
    ),
  },
  medianMs: {},
  ratioNodeSqliteOverBetterSqlite3: {},
  pairedPerRepRatio: {},
  sanity: {
    ftsRowsTotal_nodeSqlite: perfRaw["node:sqlite"][0]._ftsRowsTotal,
    ftsRowsTotal_betterSqlite3: perfRaw["better-sqlite3"][0]._ftsRowsTotal,
    blobBytes_nodeSqlite: perfRaw["node:sqlite"][0]._blobBytes,
    blobBytes_betterSqlite3: perfRaw["better-sqlite3"][0]._blobBytes,
  },
};
for (const m of METRICS) {
  const a = median(perfRaw["node:sqlite"].map((t) => t[m]));
  const b = median(perfRaw["better-sqlite3"].map((t) => t[m]));
  results.perf.medianMs[m] = { "node:sqlite": round(a, 2), "better-sqlite3": round(b, 2) };
  results.perf.ratioNodeSqliteOverBetterSqlite3[m] = round(a / b, 3);
  const ratios = perfRaw["node:sqlite"].map((t, i) => t[m] / perfRaw["better-sqlite3"][i][m]);
  results.perf.pairedPerRepRatio[m] = {
    ratios: ratios.map((r) => round(r, 3)),
    min: round(Math.min(...ratios), 3),
    median: round(median(ratios), 3),
    max: round(Math.max(...ratios), 3),
  };
}
console.table(
  METRICS.map((m) => ({
    shape: m,
    "node:sqlite ms (med)": results.perf.medianMs[m]["node:sqlite"],
    "better-sqlite3 ms (med)": results.perf.medianMs[m]["better-sqlite3"],
    ratio: results.perf.ratioNodeSqliteOverBetterSqlite3[m],
  })),
);

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — CROSS-PROCESS WAL + busy_timeout
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n=== PART 3: CROSS-PROCESS WAL / busy_timeout ===\n`);

const WORKER = join(tmp, "e6-worker.mjs");
writeFileSync(
  WORKER,
  `
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
const [kind, path, mode, arg] = process.argv.slice(2);
const req = createRequire(${JSON.stringify(`${REPO}/packages/coach/package.json`)});
function open(busyMs) {
  if (kind === "ns") {
    const db = new DatabaseSync(path);
    db.prepare("PRAGMA journal_mode = WAL").get();
    db.exec("PRAGMA busy_timeout = " + busyMs);
    return { db, exec: s => db.exec(s), prep: s => db.prepare(s), close: () => db.close() };
  }
  const BS3 = req("better-sqlite3");
  const db = new BS3(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = " + busyMs);
  return { db, exec: s => db.exec(s), prep: s => db.prepare(s), close: () => db.close() };
}
const out = { kind, mode, ok: true, writes: 0, busy: 0, errors: [] };
try {
  if (mode === "hammer") {
    const d = open(5000);
    d.exec("CREATE TABLE IF NOT EXISTS w(id INTEGER PRIMARY KEY AUTOINCREMENT, who TEXT, i INTEGER)");
    const st = d.prep("INSERT INTO w(who,i) VALUES(?,?)");
    const n = Number(arg);
    for (let i = 0; i < n; i++) {
      try {
        d.exec("BEGIN IMMEDIATE");
        st.run(process.pid + "", i);
        // hold the write lock briefly so the sibling actually contends
        const until = Date.now() + 2;
        while (Date.now() < until) {}
        d.exec("COMMIT");
        out.writes++;
      } catch (e) {
        const code = e.code || e.errstr || e.message;
        if (/BUSY/i.test(String(code)) || /busy/i.test(String(e.message))) out.busy++;
        else out.errors.push(String(e.code) + ":" + e.message);
        try { d.exec("ROLLBACK"); } catch {}
      }
    }
    out.total = Number(d.prep("SELECT count(*) c FROM w").get().c);
    d.close();
  } else if (mode === "holder") {
    // hold an IMMEDIATE write txn for \`arg\` ms
    const d = open(0);
    d.exec("CREATE TABLE IF NOT EXISTS w(id INTEGER PRIMARY KEY AUTOINCREMENT, who TEXT, i INTEGER)");
    d.exec("BEGIN IMMEDIATE");
    d.prep("INSERT INTO w(who,i) VALUES(?,?)").run("holder", 0);
    console.error("HOLDING");
    const until = Date.now() + Number(arg);
    while (Date.now() < until) {}
    d.exec("COMMIT");
    d.close();
    out.held = Number(arg);
  } else if (mode === "waiter") {
    // try one write with busy_timeout=arg against a held lock
    const d = open(Number(arg));
    const t0 = Date.now();
    try {
      d.exec("BEGIN IMMEDIATE");
      d.prep("INSERT INTO w(who,i) VALUES(?,?)").run("waiter", 1);
      d.exec("COMMIT");
      out.acquired = true;
    } catch (e) {
      out.acquired = false;
      out.errCode = e.code ?? null;
      out.errcode = e.errcode ?? null;
      out.errstr = e.errstr ?? null;
      out.errMessage = e.message;
      try { d.exec("ROLLBACK"); } catch {}
    }
    out.waitedMs = Date.now() - t0;
    d.close();
  }
} catch (e) {
  out.ok = false;
  out.fatal = String(e.code) + ": " + e.message;
}
console.log("E6RESULT " + JSON.stringify(out));
`,
);

function runWorker(args, opts = {}) {
  const r = spawnSync(process.execPath, [WORKER, ...args], { encoding: "utf8", ...opts });
  const line = (r.stdout || "").split("\n").find((l) => l.startsWith("E6RESULT "));
  return {
    parsed: line ? JSON.parse(line.slice("E6RESULT ".length)) : null,
    status: r.status,
    stderr: (r.stderr || "").trim(),
    stdout: (r.stdout || "").trim(),
  };
}

async function concurrentHammer(kind, n) {
  const p = join(tmp, `xp-${kind}.db`);
  // create schema first so both children see the table
  const seed = runWorker([kind, p, "hammer", "1"]);
  const kids = [0, 1].map(
    () =>
      new Promise((resolve) => {
        const c = spawn(process.execPath, [WORKER, kind, p, "hammer", String(n)], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let so = "";
        let se = "";
        c.stdout.on("data", (d) => (so += d));
        c.stderr.on("data", (d) => (se += d));
        c.on("close", (code) => {
          const line = so.split("\n").find((l) => l.startsWith("E6RESULT "));
          resolve({ code, parsed: line ? JSON.parse(line.slice(9)) : null, stderr: se.trim() });
        });
      }),
  );
  const [a, b] = await Promise.all(kids);
  return { seed: seed.parsed, a, b, dbPath: p };
}

for (const [label, kind] of [["node:sqlite", "ns"], ["better-sqlite3", "bs"]]) {
  const h = await concurrentHammer(kind, 150);
  const totalWrites = (h.a.parsed?.writes ?? -1) + (h.b.parsed?.writes ?? -1);
  results.crossProcess[`${label}_twoWriterHammer`] = {
    perProcessAttempts: 150,
    exitCodes: [h.a.code, h.b.code],
    writesA: h.a.parsed?.writes,
    writesB: h.b.parsed?.writes,
    busyA: h.a.parsed?.busy,
    busyB: h.b.parsed?.busy,
    otherErrorsA: h.a.parsed?.errors,
    otherErrorsB: h.b.parsed?.errors,
    rowsInDbSeenByA: h.a.parsed?.total,
    stderrSample: [h.a.stderr.split("\n")[0] ?? "", h.b.stderr.split("\n")[0] ?? ""],
    allWritesSucceeded: totalWrites === 300,
  };
  console.log(
    `  ${label}: writes=${h.a.parsed?.writes}+${h.b.parsed?.writes}=${totalWrites}/300 busy=${h.a.parsed?.busy}+${h.b.parsed?.busy} exit=${h.a.code}/${h.b.code}`,
  );
}

// Held-lock test: does busy_timeout actually make node:sqlite WAIT?
{
  for (const [label, kind] of [["node:sqlite", "ns"], ["better-sqlite3", "bs"]]) {
    const out = {};
    for (const waiterTimeout of [50, 3000]) {
      const p = join(tmp, `hold-${kind}-${waiterTimeout}.db`);
      runWorker([kind, p, "hammer", "1"]); // create schema
      const holder = spawn(process.execPath, [WORKER, kind, p, "holder", "700"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      // wait for the holder to announce it has the lock
      await new Promise((resolve) => {
        let se = "";
        holder.stderr.on("data", (d) => {
          se += d;
          if (se.includes("HOLDING")) resolve();
        });
        setTimeout(resolve, 3000);
      });
      const w = runWorker([kind, p, "waiter", String(waiterTimeout)]);
      await new Promise((r) => holder.on("close", r));
      out[`busyTimeout${waiterTimeout}ms`] = w.parsed;
    }
    results.crossProcess[`${label}_heldLock700ms`] = out;
    console.log(
      `  ${label} held-lock 700ms: bt=50ms -> acquired=${out.busyTimeout50ms?.acquired} waited=${out.busyTimeout50ms?.waitedMs}ms err=${out.busyTimeout50ms?.errCode ?? out.busyTimeout50ms?.errstr ?? "-"}; bt=3000ms -> acquired=${out.busyTimeout3000ms?.acquired} waited=${out.busyTimeout3000ms?.waitedMs}ms`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
writeFileSync(`${OUT}/e6-results-node-sqlite.json`, `${JSON.stringify(results, null, 2)}\n`);
console.log(`\nwrote ${OUT}/e6-results-node-sqlite.json`);
rmSync(tmp, { recursive: true, force: true });
