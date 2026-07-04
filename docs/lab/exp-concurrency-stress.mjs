#!/usr/bin/env node
/**
 * Concurrency-stress lab: attack ROSTER's multi-process safety claims with
 * REAL OS processes on REAL SQLite files. Four experiments:
 *  (a) 8 processes × 200 mixed CoachStore ops on one shared coach.db
 *  (b) two processes racing serve-boot sync cycles (upsert + pruneMissing
 *      keepSeenSince) with overlapping-but-different rosters
 *  (c) kill -9 a writer mid-transaction × 20 rounds → integrity + atomicity
 *  (d) 4 processes × 100 saveConfig() calls on one roster.json + torn-read probe
 * Run from repo root: node docs/lab/exp-concurrency-stress.mjs
 * Results → docs/lab/results-concurrency-stress.json
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setImmediate as yieldLoop } from "node:timers/promises";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL } = await import(
  req.resolve("@rosterhq/coach")
);
const { TOOLS } = await import(pathToFileURL(path.join(here, "corpus.mjs")).href);
const { NEEDS } = await import(pathToFileURL(path.join(here, "needs.mjs")).href);

const TMP = path.join(here, "tmp-concurrency-stress");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = {
  meta: {
    startedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    model: MINILM_MODEL,
    corpusTools: TOOLS.length,
    needs: NEEDS.length,
  },
};
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function spawnJsonWorker(script, cfg, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, script), JSON.stringify(cfg)], {
      cwd: repo,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let errOut = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (errOut += d));
    child.on("exit", (code, signal) => {
      let parsed = null;
      try {
        parsed = JSON.parse(out.trim().split("\n").pop());
      } catch {
        /* worker crashed before emitting */
      }
      resolve({ code, signal, parsed, stderr: errOut.slice(0, 800) });
    });
  });
}

function dbHealth(dbPath) {
  const db = openCoachDb(dbPath);
  const integrity = db.pragma("integrity_check");
  const fk = db.pragma("foreign_key_check");
  const counts = {
    capability: db.prepare("SELECT COUNT(*) c FROM capability").get().c,
    capability_fts: db.prepare("SELECT COUNT(*) c FROM capability_fts").get().c,
    outcome: db.prepare("SELECT COUNT(*) c FROM outcome").get().c,
    rating: db.prepare("SELECT COUNT(*) c FROM rating").get().c,
    vec: db.prepare("SELECT COUNT(*) c FROM vec").get().c,
    drift_event: db.prepare("SELECT COUNT(*) c FROM drift_event").get().c,
  };
  const ftsOrphans = db
    .prepare(
      "SELECT COUNT(*) c FROM capability_fts f WHERE NOT EXISTS(SELECT 1 FROM capability c WHERE c.id = f.id)",
    )
    .get().c;
  const capsMissingFts = db
    .prepare(
      "SELECT COUNT(*) c FROM capability c WHERE NOT EXISTS(SELECT 1 FROM capability_fts f WHERE f.id = c.id)",
    )
    .get().c;
  const badRatings = db
    .prepare("SELECT COUNT(*) c FROM rating WHERE wilson_lb IS NULL OR wilson_lb != wilson_lb").get().c;
  db.close();
  return { integrity, fk, counts, ftsOrphans, capsMissingFts, badRatings };
}

// ─── Step 0: real MiniLM vectors, embedded ONCE in this parent ──────────────
say("## step 0: real MiniLM embeddings (parent-side, single load — 8 child model loads would blow the RAM budget)");
const t0 = Date.now();
const provider = new TransformersEmbeddings(MINILM_MODEL);
const toolVecsArr = await provider.embed(
  TOOLS.map((t) => `${t.name}\n${t.description}`),
  "document",
);
const needVecsArr = await provider.embed(
  NEEDS.map((n) => n.need),
  "query",
);
await provider.dispose();
const toolVecs = Object.fromEntries(TOOLS.map((t, i) => [t.id, Array.from(toolVecsArr[i])]));
const needVecs = Object.fromEntries(NEEDS.map((n, i) => [n.need, Array.from(needVecsArr[i])]));
const toolVecsPath = path.join(TMP, "tool-vecs.json");
const needVecsPath = path.join(TMP, "need-vecs.json");
fs.writeFileSync(toolVecsPath, JSON.stringify(toolVecs));
fs.writeFileSync(needVecsPath, JSON.stringify(needVecs));
results.meta.embedMs = Date.now() - t0;
results.meta.embedDims = toolVecsArr[0].length;
say(`   embedded ${TOOLS.length} tools + ${NEEDS.length} needs in ${results.meta.embedMs}ms, dims=${toolVecsArr[0].length}`);

// ─── Experiment (a): 8 processes × 200 mixed ops, one shared DB ─────────────
say("\n## (a) 8 real processes × 200 mixed ops on one shared coach.db");
{
  const dbPath = path.join(TMP, "stress-a.db");
  const seedDb = openCoachDb(dbPath);
  const seed = new CoachStore(seedDb);
  seed.upsertCapabilities(TOOLS);
  for (const t of TOOLS) seed.storeBaseVec(t.id, Float32Array.from(toolVecs[t.id]));
  seedDb.pragma("wal_checkpoint(TRUNCATE)");
  seedDb.close(); // parent must NOT hold a connection while children fight

  const goFile = path.join(TMP, "go-a");
  const wall0 = Date.now();
  const workers = Array.from({ length: 8 }, (_, i) =>
    spawnJsonWorker("exp-concurrency-stress-worker.mjs", {
      dbPath,
      workerId: i,
      goFile,
      needVecsPath,
      ops: 200,
    }),
  );
  await sleep(2000); // let all 8 finish module load and reach the barrier
  fs.writeFileSync(goFile, "go");
  const done = await Promise.all(workers);
  const wallMs = Date.now() - wall0 - 2000;

  const agg = { totalOps: 0, ok: 0, errorCounts: {}, byWorker: [], crashes: 0 };
  let expectedOutcomes = 0;
  for (const w of done) {
    if (!w.parsed) {
      agg.crashes += 1;
      agg.byWorker.push({ crashed: true, code: w.code, signal: w.signal, stderr: w.stderr });
      continue;
    }
    const p = w.parsed;
    agg.byWorker.push(p);
    expectedOutcomes += p.outcomeInserts;
    agg.totalOps += 200;
    agg.ok += Object.values(p.okCounts).reduce((s, n) => s + n, 0);
    for (const [c, n] of Object.entries(p.errorCounts)) agg.errorCounts[c] = (agg.errorCounts[c] ?? 0) + n;
  }
  const health = dbHealth(dbPath);
  const walSize = fs.existsSync(`${dbPath}-wal`) ? fs.statSync(`${dbPath}-wal`).size : 0;
  results.a = {
    wallMs,
    workers: 8,
    opsPerWorker: 200,
    aggregate: agg,
    expectedOutcomeRows: expectedOutcomes,
    actualOutcomeRows: health.counts.outcome,
    lostCommittedOutcomes: expectedOutcomes - health.counts.outcome,
    health,
    walBytesAfter: walSize,
  };
  say(`   ${agg.ok}/${agg.totalOps} ops ok, errors=${JSON.stringify(agg.errorCounts)}, crashes=${agg.crashes}`);
  say(`   integrity=${JSON.stringify(health.integrity)} fkViolations=${health.fk.length}`);
  say(`   outcome rows expected=${expectedOutcomes} actual=${health.counts.outcome}`);
  say(`   capability=${health.counts.capability} fts=${health.counts.capability_fts} orphans=${health.ftsOrphans}/${health.capsMissingFts} vec=${health.counts.vec}`);
  const latAll = {};
  for (const w of agg.byWorker) if (w.latMs) for (const [op, s] of Object.entries(w.latMs)) (latAll[op] ??= []).push(s);
  results.a.latencyByOp = Object.fromEntries(
    Object.entries(latAll).map(([op, arr]) => [
      op,
      {
        p50Median: +median(arr.map((x) => x.p50)).toFixed(2),
        p95Max: Math.max(...arr.map((x) => x.p95)),
        maxMax: Math.max(...arr.map((x) => x.max)),
      },
    ]),
  );
  say(`   latency (ms) worst-of-workers: ${JSON.stringify(results.a.latencyByOp)}`);
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

// ─── Experiment (b): two serve-boot sync cycles racing, divergent rosters ──
say("\n## (b) two processes racing serve-boot sync cycles (overlapping-but-different rosters)");
{
  const dbPath = path.join(TMP, "stress-b.db");
  const goFile = path.join(TMP, "go-b");
  const shared = TOOLS.slice(0, 20);
  const onlyA = TOOLS.slice(20, 30);
  const onlyB = TOOLS.slice(30, 40);
  const wA = spawnJsonWorker("exp-concurrency-stress-sync-worker.mjs", {
    dbPath, label: "A", cycles: 30, goFile, myTools: [...shared, ...onlyA], vecsPath: toolVecsPath,
  });
  const wB = spawnJsonWorker("exp-concurrency-stress-sync-worker.mjs", {
    dbPath, label: "B", cycles: 30, goFile, myTools: [...shared, ...onlyB], vecsPath: toolVecsPath,
  });
  await sleep(900);
  fs.writeFileSync(goFile, "go");
  const [ra, rb] = await Promise.all([wA, wB]);
  const health = dbHealth(dbPath);
  const db = openCoachDb(dbPath);
  const finalIds = new Set(db.prepare("SELECT id FROM capability").all().map((r) => r.id));
  const vecIds = new Set(db.prepare("SELECT capability FROM vec").all().map((r) => r.capability));
  db.close();
  const missingA = onlyA.filter((t) => !finalIds.has(t.id)).map((t) => t.id);
  const missingB = onlyB.filter((t) => !finalIds.has(t.id)).map((t) => t.id);
  const missingVecA = onlyA.filter((t) => !vecIds.has(t.id)).length;
  const missingVecB = onlyB.filter((t) => !vecIds.has(t.id)).length;
  results.b = {
    workerA: ra.parsed ?? { crashed: true, stderr: ra.stderr },
    workerB: rb.parsed ?? { crashed: true, stderr: rb.stderr },
    finalState: {
      capabilityRows: health.counts.capability,
      missingOnlyAFinal: missingA,
      missingOnlyBFinal: missingB,
      missingVecAFinal: missingVecA,
      missingVecBFinal: missingVecB,
    },
    health,
  };
  say(`   A: capLossEvents=${ra.parsed?.lostCapEvents} (ids lost ${ra.parsed?.totalCapLossIds}) vecLossEvents=${ra.parsed?.lostVecEvents} errors=${JSON.stringify(ra.parsed?.errors?.slice(0, 3))}`);
  say(`   B: capLossEvents=${rb.parsed?.lostCapEvents} (ids lost ${rb.parsed?.totalCapLossIds}) vecLossEvents=${rb.parsed?.lostVecEvents} errors=${JSON.stringify(rb.parsed?.errors?.slice(0, 3))}`);
  say(`   final: onlyA missing=${missingA.length} onlyB missing=${missingB.length} integrity=${JSON.stringify(health.integrity)}`);
}

// ─── Experiment (c): kill -9 mid-transaction × 20 rounds ───────────────────
say("\n## (c) kill -9 a writer mid-transaction, 20 rounds");
{
  const dbPath = path.join(TMP, "stress-c.db");
  const seedDb = openCoachDb(dbPath);
  const seed = new CoachStore(seedDb);
  seed.upsertCapabilities(TOOLS);
  for (const t of TOOLS.slice(0, 40)) seed.storeBaseVec(t.id, Float32Array.from(toolVecs[t.id]));
  seedDb.close(); // recovery must be exercised by fresh opens, not masked by a live parent handle

  const rounds = [];
  for (let r = 0; r < 20; r++) {
    const mode = r % 2 === 0 ? "longtx" : "apiloop";
    const txTag = `longtx-r${r}`;
    const child = spawn(
      process.execPath,
      [path.join(here, "exp-concurrency-stress-crash-writer.mjs"), JSON.stringify({ dbPath, mode, txTag, round: r })],
      { cwd: repo, stdio: ["ignore", "pipe", "pipe"] },
    );
    let acks = 0;
    let sawIntx = false;
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d;
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line === "INTX") sawIntx = true;
        else if (line.startsWith("ACK ")) acks = Number(line.slice(4));
      }
    });
    const exited = new Promise((res) => child.on("exit", (c, s) => res({ c, s })));
    // Kill mid-flight: for longtx wait for INTX then 5-45ms; apiloop random 30-150ms.
    if (mode === "longtx") {
      const t1 = Date.now();
      while (!sawIntx && Date.now() - t1 < 5000) await sleep(2);
      await sleep(5 + Math.random() * 40);
    } else {
      // wait for real committed work (first ACK), then kill 10-80ms later
      const t1 = Date.now();
      while (acks === 0 && Date.now() - t1 < 5000) await sleep(2);
      await sleep(10 + Math.random() * 70);
    }
    child.kill("SIGKILL");
    const exit = await exited;
    await sleep(15); // let the OS release locks/fds
    const walBytes = fs.existsSync(`${dbPath}-wal`) ? fs.statSync(`${dbPath}-wal`).size : 0;

    // Recovery: fresh connection (this is what the next `roster serve` does).
    let integrity, tornRows, durableRows, openError = null;
    try {
      const db = openCoachDb(dbPath);
      integrity = db.pragma("integrity_check");
      tornRows = db.prepare("SELECT COUNT(*) c FROM outcome WHERE session = ?").get(txTag).c;
      durableRows = db
        .prepare("SELECT COUNT(*) c FROM outcome WHERE session = ?")
        .get(`apiloop-r${r}`).c;
      db.close();
    } catch (err) {
      openError = String(err.message);
    }
    const round = {
      r,
      mode,
      killedMidTx: mode === "longtx" ? sawIntx : null,
      exitSignal: exit.s,
      walBytesAtCrash: walBytes,
      integrity,
      openError,
      // longtx: any visible row from the un-committed tx = atomicity violation
      tornTxRowsVisible: mode === "longtx" ? tornRows : null,
      // apiloop: every ACKed (committed) row must survive = durability
      acked: mode === "apiloop" ? acks : null,
      visibleCommitted: mode === "apiloop" ? durableRows : null,
      durabilityViolation: mode === "apiloop" ? durableRows < acks : null,
    };
    rounds.push(round);
    say(
      `   r${r} ${mode}: killed(sig=${exit.s}) wal=${walBytes}b integrity=${JSON.stringify(integrity)} ` +
        (mode === "longtx" ? `tornRows=${tornRows} (must be 0)` : `acked=${acks} visible=${durableRows} (must be ≥)`),
    );
  }
  const health = dbHealth(dbPath);
  results.c = {
    rounds,
    tornWriteRounds: rounds.filter((x) => x.tornTxRowsVisible > 0).length,
    durabilityViolationRounds: rounds.filter((x) => x.durabilityViolation === true).length,
    badIntegrityRounds: rounds.filter((x) => JSON.stringify(x.integrity) !== '[{"integrity_check":"ok"}]').length,
    openErrors: rounds.filter((x) => x.openError).length,
    midTxKillsConfirmed: rounds.filter((x) => x.killedMidTx === true).length,
    finalHealth: health,
  };
  say(`   summary: tornWriteRounds=${results.c.tornWriteRounds} durabilityViolations=${results.c.durabilityViolationRounds} badIntegrity=${results.c.badIntegrityRounds}`);
}

// ─── Experiment (d): 4 processes × 100 saveConfig on one roster.json ───────
say("\n## (d) 4 processes × 100 saveConfig() + reader polling for torn JSON");
{
  const home = path.join(TMP, "home-d");
  fs.mkdirSync(path.join(home, ".roster"), { recursive: true });
  const target = path.join(home, ".roster", "roster.json");
  fs.writeFileSync(target, JSON.stringify({ version: 1, mode: "transparent", servers: {}, skillSources: [], telemetry: { enabled: false }, embeddings: "auto" }, null, 2));
  const goFile = path.join(TMP, "go-d");

  const writers = Array.from({ length: 4 }, (_, i) =>
    spawnJsonWorker("exp-concurrency-stress-config-writer.mjs", {
      home, writerId: i, writes: 100, goFile,
    }),
  );
  let writersDone = false;
  const allDone = Promise.all(writers).then((r) => {
    writersDone = true;
    return r;
  });
  await sleep(900);
  const reader = { reads: 0, parseFailures: 0, emptyReads: 0, enoent: 0, tornSamples: [] };
  fs.writeFileSync(goFile, "go");
  while (!writersDone) {
    for (let i = 0; i < 40 && !writersDone; i++) {
      try {
        const raw = fs.readFileSync(target, "utf8");
        reader.reads += 1;
        if (raw.length === 0) {
          reader.emptyReads += 1;
          reader.parseFailures += 1;
          if (reader.tornSamples.length < 10) reader.tornSamples.push({ len: 0, head: "", tail: "" });
          continue;
        }
        try {
          JSON.parse(raw);
        } catch {
          reader.parseFailures += 1;
          if (reader.tornSamples.length < 10)
            reader.tornSamples.push({ len: raw.length, head: raw.slice(0, 60), tail: raw.slice(-40) });
        }
      } catch (err) {
        if (err.code === "ENOENT") reader.enoent += 1;
        reader.reads += 1;
      }
    }
    await yieldLoop();
  }
  const writerResults = await allDone;
  // Post-mortem: final file must parse; a leftover .tmp is crash debris.
  let finalParses = true;
  let finalError = null;
  try {
    JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (err) {
    finalParses = false;
    finalError = String(err.message).slice(0, 200);
  }
  const leftoverTmp = fs.existsSync(`${target}.tmp`);
  const agg = { ok: 0, failed: 0, errorCounts: {}, crashes: 0, samples: [] };
  for (const w of writerResults) {
    if (!w.parsed) {
      agg.crashes += 1;
      agg.samples.push({ crashed: true, stderr: w.stderr });
      continue;
    }
    agg.ok += w.parsed.ok;
    agg.failed += w.parsed.failed;
    for (const [c, n] of Object.entries(w.parsed.errorCounts)) agg.errorCounts[c] = (agg.errorCounts[c] ?? 0) + n;
    if (w.parsed.errorSample.length > 0) agg.samples.push(...w.parsed.errorSample.slice(0, 3));
  }
  results.d = {
    writers: 4,
    writesPerWriter: 100,
    writerAggregate: agg,
    reader,
    finalParses,
    finalError,
    leftoverTmp,
  };
  say(`   writers: ok=${agg.ok}/400 failed=${agg.failed} errorCounts=${JSON.stringify(agg.errorCounts)}`);
  say(`   reader: reads=${reader.reads} parseFailures=${reader.parseFailures} empty=${reader.emptyReads} enoent=${reader.enoent}`);
  say(`   final roster.json parses=${finalParses}${finalError ? ` (${finalError})` : ""} leftoverTmp=${leftoverTmp}`);
  if (reader.tornSamples.length) say(`   torn samples: ${JSON.stringify(reader.tornSamples.slice(0, 3))}`);
}

results.meta.finishedAt = new Date().toISOString();
const outPath = path.join(here, "results-concurrency-stress.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
say(`\nresults → ${outPath}`);
