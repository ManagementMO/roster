#!/usr/bin/env node
/**
 * Experiment (a) worker — one OS process hammering the SHARED coach.db with a
 * shuffled mix of real CoachStore ops. Spawned by exp-concurrency-stress.mjs.
 * argv[2] = JSON config {dbPath, workerId, goFile, needVecsPath, ops}.
 * Emits one JSON line on stdout when done.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cfg = JSON.parse(process.argv[2]);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { CoachStore, openCoachDb, hashNeed } = await import(req.resolve("@rosterhq/coach"));
const { TOOLS } = await import(pathToFileURL(path.join(repo, "docs/lab/corpus.mjs")).href);
const { NEEDS } = await import(pathToFileURL(path.join(repo, "docs/lab/needs.mjs")).href);

// Real MiniLM need vectors, embedded once by the parent (real inference, no
// per-worker model load — 8 concurrent model loads would blow the RAM budget).
const needVecsRaw = JSON.parse(fs.readFileSync(cfg.needVecsPath, "utf8"));
const needVecs = new Map(Object.entries(needVecsRaw).map(([k, v]) => [k, Float32Array.from(v)]));

// Deterministic PRNG per worker.
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1000 + cfg.workerId);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const CLASSES = ["success", "success", "success", "success", "success", "success", "success", "tool_fail:internal", "tool_fail:timeout", "hard_fail:protocol"];

// Op mix: 80 recordOutcome / 50 draftCandidates / 50 upsertCapabilities / 20 recomputeRatings = 200.
const mix = [];
for (let i = 0; i < 80; i++) mix.push("recordOutcome");
for (let i = 0; i < 50; i++) mix.push("draftCandidates");
for (let i = 0; i < 50; i++) mix.push("upsertCapabilities");
for (let i = 0; i < 20; i++) mix.push("recomputeRatings");
for (let i = mix.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [mix[i], mix[j]] = [mix[j], mix[i]];
}

// Fixed per-worker slice of the corpus for upserts (16-17 tools each).
const sliceLen = Math.ceil(TOOLS.length / 8);
const mySlice = TOOLS.slice(cfg.workerId * sliceLen, (cfg.workerId + 1) * sliceLen);

// Barrier: wait for the parent's go-file so all 8 workers start together.
const store = new CoachStore(openCoachDb(cfg.dbPath));
while (!fs.existsSync(cfg.goFile)) await new Promise((r) => setTimeout(r, 5));

const errors = [];
const lat = {}; // op -> [ms]
const okCounts = {};
let outcomeInserts = 0;
const wall0 = Date.now();

for (const op of mix.slice(0, cfg.ops)) {
  const t0 = process.hrtime.bigint();
  try {
    if (op === "recordOutcome") {
      const tool = pick(TOOLS);
      const need = pick(NEEDS).need;
      store.recordOutcome({
        session: `w${cfg.workerId}`,
        source: tool.source,
        capability: tool.id,
        outcomeClass: pick(CLASSES),
        latencyMs: Math.floor(rand() * 900),
        needHash: hashNeed(need),
        argsHash: `args-${Math.floor(rand() * 50)}`,
      });
      outcomeInserts += 1;
    } else if (op === "draftCandidates") {
      const n = pick(NEEDS);
      const vec = rand() < 0.5 ? (needVecs.get(n.need) ?? null) : null;
      store.draftCandidates(n.need, 5, vec);
    } else if (op === "upsertCapabilities") {
      // 2% of upserts mutate one description (drift path: drift_event insert,
      // quarantine flip, FTS delete+insert) — the rest re-sight stable defs.
      let entries = mySlice;
      if (rand() < 0.02) {
        const idx = Math.floor(rand() * mySlice.length);
        entries = mySlice.map((t, i) =>
          i === idx ? { ...t, description: `${t.description} (drifted ${Math.floor(rand() * 1e6)})` } : t,
        );
      }
      store.upsertCapabilities(entries);
    } else {
      store.recomputeRatings("all");
    }
    okCounts[op] = (okCounts[op] ?? 0) + 1;
  } catch (err) {
    errors.push({ op, code: err.code ?? "NO_CODE", message: String(err.message).slice(0, 200) });
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  (lat[op] ??= []).push(ms);
}

const summarize = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { n: s.length, p50: +q(50).toFixed(2), p95: +q(95).toFixed(2), max: +s[s.length - 1].toFixed(2) };
};
const errorCounts = {};
for (const e of errors) errorCounts[e.code] = (errorCounts[e.code] ?? 0) + 1;

process.stdout.write(
  JSON.stringify({
    workerId: cfg.workerId,
    wallMs: Date.now() - wall0,
    okCounts,
    outcomeInserts,
    errorCounts,
    errors: errors.slice(0, 20),
    latMs: Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, summarize(v)])),
  }) + "\n",
);
