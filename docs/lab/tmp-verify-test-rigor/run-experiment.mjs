// Empirical test of the finding: does the shipped cli.test suite LOCK the
// config-write-race fix? We can't distinguish the variants with single-threaded
// tests (Scenario A). The bug only shows under real concurrency (B) and injected
// write failure (C) — neither of which any shipped test exercises.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VARIANTS } from "./variants.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freshHome = () => fs.mkdtempSync(path.join(os.tmpdir(), "roster-rigor-"));

// ── Scenario A: single-threaded happy path — exactly what cli.test exercises ──
// syncClient/ejectClient call the atomic write once, sequentially, no failure.
function scenarioA() {
  console.log("## Scenario A — single-threaded happy path (what cli.test actually runs)");
  const out = {};
  for (const name of Object.keys(VARIANTS)) {
    const home = freshHome();
    const target = path.join(home, "roster.json");
    const data = `${JSON.stringify({ version: 1, mode: "transparent", servers: {} }, null, 2)}\n`;
    let threw = null;
    try {
      VARIANTS[name](target, data);
    } catch (e) {
      threw = String(e.message);
    }
    const roundTrips = fs.existsSync(target) && fs.readFileSync(target, "utf8") === data;
    const tmpLitter = fs.readdirSync(home).filter((f) => f.endsWith(".tmp"));
    out[name] = { roundTrips, threw, tmpLitter: tmpLitter.length };
    fs.rmSync(home, { recursive: true, force: true });
  }
  console.log("   result:", JSON.stringify(out));
  const allPass = Object.values(out).every((r) => r.roundTrips && !r.threw && r.tmpLitter === 0);
  console.log(`   => all three variants behave IDENTICALLY on the single-threaded path: ${allPass}`);
  console.log(`      (so a single-threaded regression test cannot tell the fix from either mutant)\n`);
  return { out, allPass };
}

// ── Scenario B: real multi-process concurrency — the actual measured bug ──────
async function concurrency(variant, procs, writes) {
  const home = freshHome();
  const target = path.join(home, "roster.json");
  fs.writeFileSync(target, `${JSON.stringify({ version: 1, seed: true }, null, 2)}\n`);
  const goFile = path.join(home, "go");

  const children = Array.from({ length: procs }, (_, i) =>
    new Promise((resolve) => {
      const c = spawn(
        process.execPath,
        [path.join(here, "writer-worker.mjs"), JSON.stringify({ target, variant, writes, goFile, workerId: i })],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let sout = "";
      let serr = "";
      c.stdout.on("data", (d) => (sout += d));
      c.stderr.on("data", (d) => (serr += d));
      c.on("exit", (code, signal) => {
        let parsed = null;
        try {
          parsed = JSON.parse(sout.trim().split("\n").pop());
        } catch {
          /* crashed before emitting */
        }
        resolve({ code, signal, parsed, serr: serr.slice(0, 200) });
      });
    }),
  );

  await sleep(400); // let every child reach the barrier
  // Parent reader: poll the target for torn/empty/ENOENT while writers race.
  let writersDone = false;
  const all = Promise.all(children).then((r) => ((writersDone = true), r));
  const reader = { reads: 0, parseFailures: 0, empty: 0, enoent: 0, samples: [] };
  fs.writeFileSync(goFile, "go");
  while (!writersDone) {
    for (let i = 0; i < 50 && !writersDone; i++) {
      try {
        const raw = fs.readFileSync(target, "utf8");
        reader.reads++;
        if (raw.length === 0) {
          reader.empty++;
          reader.parseFailures++;
          continue;
        }
        try {
          JSON.parse(raw);
        } catch {
          reader.parseFailures++;
          if (reader.samples.length < 3) reader.samples.push({ len: raw.length, tail: JSON.stringify(raw.slice(-25)) });
        }
      } catch (err) {
        if (err.code === "ENOENT") reader.enoent++;
        reader.reads++;
      }
    }
    await new Promise((r) => setImmediate(r));
  }
  const results = await all;

  const agg = { ok: 0, failed: 0, errorCounts: {}, crashes: 0 };
  for (const w of results) {
    if (!w.parsed) {
      agg.crashes++;
      continue;
    }
    agg.ok += w.parsed.ok;
    agg.failed += w.parsed.failed;
    for (const [k, v] of Object.entries(w.parsed.errorCounts)) agg.errorCounts[k] = (agg.errorCounts[k] || 0) + v;
  }
  let finalParses = true;
  try {
    JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    finalParses = false;
  }
  const tmpLitter = fs.readdirSync(home).filter((f) => f.endsWith(".tmp")).length;
  fs.rmSync(home, { recursive: true, force: true });
  return { variant, procs, writes, writerAgg: agg, reader, finalParses, tmpLitter };
}

// ── Scenario C: injected write failure — the rmSync cleanup path ──────────────
function scenarioC() {
  console.log("## Scenario C — injected write failure (the rmSync-on-failure cleanup path)");
  const out = {};
  for (const name of ["current", "noCleanup"]) {
    const home = freshHome();
    // Make renameSync fail: target is an existing DIRECTORY. writeFileSync(tmp)
    // succeeds (creating the tmp), then renameSync(tmp -> dir) throws.
    const target = path.join(home, "roster.json");
    fs.mkdirSync(target); // target is a dir → rename will fail
    let threw = null;
    try {
      VARIANTS[name](target, "some config bytes\n");
    } catch (e) {
      threw = e.code || String(e.message).slice(0, 30);
    }
    const tmpLitter = fs.readdirSync(home).filter((f) => f.endsWith(".tmp"));
    out[name] = { rethrew: !!threw, threwCode: threw, tmpLitterLeft: tmpLitter.length };
    fs.rmSync(home, { recursive: true, force: true });
  }
  console.log("   result:", JSON.stringify(out));
  console.log(
    `   => current cleans tmp on failure (litter=${out.current.tmpLitterLeft}); ` +
      `noCleanup leaves litter (litter=${out.noCleanup.tmpLitterLeft})\n`,
  );
  return out;
}

// ── Run all ──────────────────────────────────────────────────────────────────
const a = scenarioA();

console.log("## Scenario B — real multi-process concurrency (the measured torn/ENOENT bug)");
const PROCS = 6;
const WRITES = 400;
const shared = await concurrency("sharedTmp", PROCS, WRITES);
const cur = await concurrency("current", PROCS, WRITES);
const sBug =
  shared.reader.parseFailures + shared.reader.enoent + shared.writerAgg.failed + shared.writerAgg.crashes;
const cBug = cur.reader.parseFailures + cur.reader.enoent + cur.writerAgg.failed + cur.writerAgg.crashes;
console.log(
  `   sharedTmp  (${PROCS}p x ${WRITES}w): writerFailed=${shared.writerAgg.failed} ` +
    `errorCounts=${JSON.stringify(shared.writerAgg.errorCounts)} crashes=${shared.writerAgg.crashes} | ` +
    `reader parseFail=${shared.reader.parseFailures} enoent=${shared.reader.enoent} empty=${shared.reader.empty} | ` +
    `finalParses=${shared.finalParses} tmpLitter=${shared.tmpLitter}`,
);
if (shared.reader.samples.length) console.log(`     torn sample: ${JSON.stringify(shared.reader.samples[0])}`);
console.log(
  `   current    (${PROCS}p x ${WRITES}w): writerFailed=${cur.writerAgg.failed} ` +
    `errorCounts=${JSON.stringify(cur.writerAgg.errorCounts)} crashes=${cur.writerAgg.crashes} | ` +
    `reader parseFail=${cur.reader.parseFailures} enoent=${cur.reader.enoent} empty=${cur.reader.empty} | ` +
    `finalParses=${cur.finalParses} tmpLitter=${cur.tmpLitter}`,
);
console.log(`   => sharedTmp total-damage=${sBug}  current total-damage=${cBug}\n`);

const c = scenarioC();

// ── Verdict ───────────────────────────────────────────────────────────────────
console.log("## VERDICT");
console.log(`A: single-threaded — all variants identical & passing: ${a.allPass}`);
console.log(`B: concurrency — sharedTmp damaged (${sBug} events) while current clean (${cBug} events): ${sBug > 0 && cBug === 0}`);
console.log(`C: failure path — noCleanup litters (${c.noCleanup.tmpLitterLeft}) while current clean (${c.current.tmpLitterLeft}), both rethrow: ${c.noCleanup.tmpLitterLeft > 0 && c.current.tmpLitterLeft === 0 && c.current.rethrew && c.noCleanup.rethrew}`);
