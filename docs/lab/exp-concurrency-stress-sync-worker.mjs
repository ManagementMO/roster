#!/usr/bin/env node
/**
 * Experiment (b) worker — replays the exact `roster serve` boot sync cycle
 * (upsertCapabilities + pruneMissing with keepSeenSince = boot start, per
 * packages/cli/src/serve.ts + router/src/rosterServer.ts syncCapabilities)
 * in a loop, racing a sibling whose roster overlaps but differs.
 * argv[2] = JSON {dbPath, label, cycles, goFile, myTools:[...], vecsPath}.
 * Emits one JSON line: loss events observed from THIS worker's viewpoint,
 * via the same store connection a real serve would use.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cfg = JSON.parse(process.argv[2]);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { CoachStore, openCoachDb } = await import(req.resolve("@rosterhq/coach"));

const myTools = cfg.myTools; // CapabilityEntry[]
const myIds = new Set(myTools.map((t) => t.id));
// Real MiniLM base vectors for my tools (embedded once by parent).
const vecsRaw = JSON.parse(fs.readFileSync(cfg.vecsPath, "utf8"));

const store = new CoachStore(openCoachDb(cfg.dbPath));

while (!fs.existsSync(cfg.goFile)) await new Promise((r) => setTimeout(r, 5));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lostCapEvents = []; // {cycle, missing:[ids]} — ids I upserted last cycle, gone now
const lostVecEvents = [];
const errors = [];
let upsertedOnce = false;

for (let cycle = 0; cycle < cfg.cycles; cycle++) {
  // serve(): bootStarted = Date.now() BEFORE config load + backend connects.
  const bootStarted = Date.now();
  // Real boots spend tens of ms+ connecting backends before syncCapabilities.
  await sleep(20 + Math.random() * 40);
  try {
    if (upsertedOnce) {
      // From my viewpoint: everything I fronted last cycle should still exist.
      const present = new Set(store.listCapabilities({ includeQuarantined: true }).map((e) => e.id));
      const missing = [...myIds].filter((id) => !present.has(id));
      if (missing.length > 0) lostCapEvents.push({ cycle, missing });
      const vecs = store.loadVecs();
      const vmissing = [...myIds].filter((id) => !vecs.has(id));
      if (vmissing.length > 0) lostVecEvents.push({ cycle, missing: vmissing.length });
    }
    // syncCapabilities(unavailable=∅, keepSeenSince=bootStarted):
    store.upsertCapabilities(myTools);
    // Warmup backfill analog: store real base vecs for my tools when absent.
    const have = store.loadVecs();
    for (const t of myTools) {
      if (!have.has(t.id) && vecsRaw[t.id]) store.storeBaseVec(t.id, Float32Array.from(vecsRaw[t.id]));
    }
    upsertedOnce = true;
    store.pruneMissing(myIds, new Set(), { keepSeenSince: bootStarted });
  } catch (err) {
    errors.push({ cycle, code: err.code ?? "NO_CODE", message: String(err.message).slice(0, 160) });
  }
  await sleep(Math.random() * 20);
}

const finalMine = store
  .listCapabilities({ includeQuarantined: true })
  .filter((e) => myIds.has(e.id)).length;

process.stdout.write(
  JSON.stringify({
    label: cfg.label,
    cycles: cfg.cycles,
    lostCapEvents: lostCapEvents.length,
    lostCapSample: lostCapEvents.slice(0, 5).map((e) => ({ cycle: e.cycle, n: e.missing.length, ids: e.missing.slice(0, 3) })),
    totalCapLossIds: lostCapEvents.reduce((s, e) => s + e.missing.length, 0),
    lostVecEvents: lostVecEvents.length,
    totalVecLossIds: lostVecEvents.reduce((s, e) => s + e.missing, 0),
    errors,
    finalMinePresent: finalMine,
    myCount: myIds.size,
  }) + "\n",
);
