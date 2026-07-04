#!/usr/bin/env node
/**
 * Concurrency-stress follow-up — closes the gaps run 1 exposed:
 *  (c2) kill -9 while UNCOMMITTED frames are already spilled into the -wal
 *       (run 1's longtx kills died with 0-byte WALs: dirty pages never left
 *       RAM, so WAL rollback was never truly exercised) × 8 rounds
 *  (d2) 5 repetitions of the 4×100 saveConfig race; capture a full torn
 *       roster.json + prove loadConfig()/serve-boot crashes on it
 *  (d3) 20 rounds of two racing real read-modify-write cycles
 *       (loadConfig → mergeServers → saveConfig, the `roster add` sequence):
 *       how often is one process's server silently lost?
 * Extends docs/lab/results-concurrency-stress.json in place (keys c2,d2,d3).
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
const { CoachStore, openCoachDb } = await import(req.resolve("@rosterhq/coach"));
const { TOOLS } = await import(pathToFileURL(path.join(here, "corpus.mjs")).href);

const TMP = path.join(here, "tmp-concurrency-stress");
fs.mkdirSync(TMP, { recursive: true });
const resultsPath = path.join(here, "results-concurrency-stress.json");
const results = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function spawnJsonWorker(script, cfg) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, script), JSON.stringify(cfg)], {
      cwd: repo,
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
      } catch { /* crashed before emitting */ }
      resolve({ code, signal, parsed, stderr: errOut.slice(0, 600) });
    });
  });
}

// ─── (c2) kill -9 with uncommitted frames ALREADY IN THE WAL ────────────────
say("## (c2) kill -9 after uncommitted tx frames spill into the WAL, 8 rounds");
{
  const dbPath = path.join(TMP, "stress-c2.db");
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  const seedDb = openCoachDb(dbPath);
  new CoachStore(seedDb).upsertCapabilities(TOOLS);
  seedDb.close();

  const rounds = [];
  for (let r = 0; r < 8; r++) {
    const txTag = `bigtx-r${r}`;
    const child = spawn(
      process.execPath,
      [
        path.join(here, "exp-concurrency-stress-crash-writer.mjs"),
        JSON.stringify({ dbPath, mode: "bigtx", txTag, round: r }),
      ],
      { cwd: repo, stdio: ["ignore", "pipe", "pipe"] },
    );
    let sawIntx = false;
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d;
      if (buf.includes("INTX")) sawIntx = true;
    });
    const exited = new Promise((res) => child.on("exit", (c, s) => res({ c, s })));
    const t1 = Date.now();
    while (!sawIntx && Date.now() - t1 < 8000) await sleep(2);
    // Wait for the pager cache to spill uncommitted frames into the WAL.
    const SPILL_BYTES = 262144;
    let walAtKill = 0;
    while (Date.now() - t1 < 8000) {
      try {
        walAtKill = fs.statSync(`${dbPath}-wal`).size;
      } catch { walAtKill = 0; }
      if (walAtKill >= SPILL_BYTES) break;
      await sleep(1);
    }
    await sleep(Math.random() * 10);
    try { walAtKill = fs.statSync(`${dbPath}-wal`).size; } catch { /* keep last */ }
    child.kill("SIGKILL");
    const exit = await exited;
    await sleep(15);

    let integrity = null;
    let tornRows = null;
    let openError = null;
    let walAfter = null;
    try {
      const db = openCoachDb(dbPath); // fresh open = the next serve's recovery
      integrity = db.pragma("integrity_check");
      tornRows = db.prepare("SELECT COUNT(*) c FROM need_vec WHERE need_hash LIKE ?").get(`${txTag}%`).c;
      db.close();
      walAfter = fs.existsSync(`${dbPath}-wal`) ? fs.statSync(`${dbPath}-wal`).size : 0;
    } catch (err) {
      openError = String(err.message);
    }
    rounds.push({
      r,
      spilledWalBytesAtKill: walAtKill,
      exitSignal: exit.s,
      integrity,
      tornRowsVisible: tornRows,
      walBytesAfterRecovery: walAfter,
      openError,
    });
    say(
      `   r${r}: walAtKill=${walAtKill}b integrity=${JSON.stringify(integrity)} tornRows=${tornRows} (must be 0) walAfter=${walAfter}b`,
    );
  }
  results.c2 = {
    rounds,
    roundsWithRealSpill: rounds.filter((x) => x.spilledWalBytesAtKill >= 262144).length,
    tornRounds: rounds.filter((x) => x.tornRowsVisible > 0).length,
    badIntegrityRounds: rounds.filter((x) => JSON.stringify(x.integrity) !== '[{"integrity_check":"ok"}]').length,
    openErrors: rounds.filter((x) => x.openError).length,
  };
  say(
    `   summary: realSpillRounds=${results.c2.roundsWithRealSpill}/8 torn=${results.c2.tornRounds} badIntegrity=${results.c2.badIntegrityRounds}`,
  );
}

// ─── (d2) repeat the saveConfig race ×5, capture a full torn file ───────────
say("\n## (d2) saveConfig race ×5 reps — full torn capture + loadConfig crash demo");
{
  const reps = [];
  let tornCapture = null;
  for (let rep = 0; rep < 5; rep++) {
    const home = path.join(TMP, `home-d2-${rep}`);
    fs.rmSync(home, { recursive: true, force: true });
    fs.mkdirSync(path.join(home, ".roster"), { recursive: true });
    const target = path.join(home, ".roster", "roster.json");
    fs.writeFileSync(
      target,
      JSON.stringify({ version: 1, mode: "transparent", servers: {}, skillSources: [], telemetry: { enabled: false }, embeddings: "auto" }, null, 2),
    );
    const goFile = path.join(TMP, `go-d2-${rep}`);
    const writers = Array.from({ length: 4 }, (_, i) =>
      spawnJsonWorker("exp-concurrency-stress-config-writer.mjs", { home, writerId: i, writes: 100, goFile }),
    );
    let writersDone = false;
    const allDone = Promise.all(writers).then((r) => {
      writersDone = true;
      return r;
    });
    await sleep(850);
    const reader = { reads: 0, parseFailures: 0, emptyReads: 0 };
    fs.writeFileSync(goFile, "go");
    while (!writersDone) {
      for (let i = 0; i < 40 && !writersDone; i++) {
        try {
          const raw = fs.readFileSync(target, "utf8");
          reader.reads += 1;
          if (raw.length === 0) {
            reader.emptyReads += 1;
            reader.parseFailures += 1;
            if (!tornCapture) {
              tornCapture = { rep, kind: "empty", len: 0, file: null };
            }
            continue;
          }
          try {
            JSON.parse(raw);
          } catch (perr) {
            reader.parseFailures += 1;
            if (!tornCapture || tornCapture.kind === "empty") {
              const f = path.join(TMP, `torn-sample-rep${rep}.json.broken`);
              fs.writeFileSync(f, raw);
              tornCapture = { rep, kind: "partial", len: raw.length, file: f, parseError: String(perr.message).slice(0, 120) };
            }
          }
        } catch { /* ENOENT etc. */ }
      }
      await yieldLoop();
    }
    const writerResults = await allDone;
    let ok = 0;
    let failed = 0;
    const errorCounts = {};
    for (const w of writerResults) {
      if (!w.parsed) continue;
      ok += w.parsed.ok;
      failed += w.parsed.failed;
      for (const [c, n] of Object.entries(w.parsed.errorCounts)) errorCounts[c] = (errorCounts[c] ?? 0) + n;
    }
    let finalParses = true;
    try { JSON.parse(fs.readFileSync(target, "utf8")); } catch { finalParses = false; }
    reps.push({ rep, writerOk: ok, writerFailed: failed, errorCounts, reader, finalParses, leftoverTmp: fs.existsSync(`${target}.tmp`) });
    say(`   rep${rep}: writers ok=${ok}/400 ENOENT=${errorCounts.ENOENT ?? 0} reader torn=${reader.parseFailures}/${reader.reads} finalParses=${finalParses}`);
  }

  // Crash demo: point the REAL loadConfig at a torn roster.json (captured live).
  let crashDemo = null;
  if (tornCapture?.file) {
    const home = path.join(TMP, "home-torn");
    fs.mkdirSync(path.join(home, ".roster"), { recursive: true });
    fs.copyFileSync(tornCapture.file, path.join(home, ".roster", "roster.json"));
    const code = `
      import { createRequire } from "node:module";
      const req = createRequire(${JSON.stringify(path.join(repo, "packages/cli/package.json"))});
      const { loadConfig } = await import(req.resolve("@rosterhq/cli"));
      try { loadConfig(); console.log(JSON.stringify({ threw: false })); }
      catch (e) { console.log(JSON.stringify({ threw: true, message: String(e.message).slice(0, 200) })); }
    `;
    crashDemo = await new Promise((resolve) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
        cwd: repo,
        env: { ...process.env, ROSTER_TEST_HOME: home },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.on("exit", () => {
        try { resolve(JSON.parse(out.trim())); } catch { resolve({ threw: null, raw: out.slice(0, 200) }); }
      });
    });
    say(`   loadConfig() on live-captured torn roster.json → threw=${crashDemo.threw}: ${crashDemo.message ?? ""}`);
  } else {
    say("   (no partial-torn file captured this run — only empty/none)");
  }
  results.d2 = {
    reps,
    totals: {
      writerOk: reps.reduce((s, x) => s + x.writerOk, 0),
      writerFailed: reps.reduce((s, x) => s + x.writerFailed, 0),
      readerReads: reps.reduce((s, x) => s + x.reader.reads, 0),
      readerTorn: reps.reduce((s, x) => s + x.reader.parseFailures, 0),
      readerEmpty: reps.reduce((s, x) => s + x.reader.emptyReads, 0),
      finalCorruptReps: reps.filter((x) => !x.finalParses).length,
    },
    tornCapture,
    crashDemo,
  };
  say(`   totals: writerFailed=${results.d2.totals.writerFailed}/2000 readerTorn=${results.d2.totals.readerTorn}/${results.d2.totals.readerReads} finalCorruptReps=${results.d2.totals.finalCorruptReps}/5`);
}

// ─── (d3) two racing roster-add cycles: silent lost update? ────────────────
say("\n## (d3) two racing loadConfig→mergeServers→saveConfig cycles × 20 rounds");
{
  const rounds = [];
  for (let r = 0; r < 20; r++) {
    const home = path.join(TMP, `home-d3-${r}`);
    fs.rmSync(home, { recursive: true, force: true });
    fs.mkdirSync(path.join(home, ".roster"), { recursive: true });
    const target = path.join(home, ".roster", "roster.json");
    fs.writeFileSync(
      target,
      JSON.stringify({ version: 1, mode: "transparent", servers: { base: { command: "npx", args: ["-y", "@example/base"], importedFrom: ["claude-code"] } }, skillSources: [], telemetry: { enabled: false }, embeddings: "auto" }, null, 2),
    );
    const goFile = path.join(TMP, `go-d3-${r}`);
    const pA = spawnJsonWorker("exp-concurrency-stress-adder.mjs", { home, serverName: "alpha", goFile });
    const pB = spawnJsonWorker("exp-concurrency-stress-adder.mjs", { home, serverName: "beta", goFile });
    await sleep(700);
    fs.writeFileSync(goFile, "go");
    const [ra, rb] = await Promise.all([pA, pB]);
    let final = null;
    let parses = true;
    try { final = JSON.parse(fs.readFileSync(target, "utf8")); } catch { parses = false; }
    const hasAlpha = Boolean(final?.servers?.alpha);
    const hasBeta = Boolean(final?.servers?.beta);
    rounds.push({
      r,
      aOutcome: ra.parsed?.outcome ?? "crash",
      bOutcome: rb.parsed?.outcome ?? "crash",
      parses,
      hasAlpha,
      hasBeta,
      lostUpdate: parses && !(hasAlpha && hasBeta),
    });
  }
  const lost = rounds.filter((x) => x.lostUpdate).length;
  const crashed = rounds.filter((x) => x.aOutcome !== "ok" || x.bOutcome !== "ok").length;
  const corrupt = rounds.filter((x) => !x.parses).length;
  results.d3 = {
    rounds,
    lostUpdateRounds: lost,
    writerErrorRounds: crashed,
    corruptFinalRounds: corrupt,
    total: rounds.length,
  };
  say(`   lostUpdateRounds=${lost}/20 writerErrorRounds=${crashed}/20 corruptFinal=${corrupt}/20`);
  say(`   sample: ${JSON.stringify(rounds.slice(0, 4))}`);
}

results.meta.followUpFinishedAt = new Date().toISOString();
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
say(`\nresults extended → ${resultsPath}`);
