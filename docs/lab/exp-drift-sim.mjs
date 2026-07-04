#!/usr/bin/env node
/**
 * exp-drift-sim — Drift/quarantine lifecycle vs spec over 30 simulated days
 * of one server (github) evolving, against the REAL CoachStore on a REAL
 * SQLite file, with REAL MiniLM inference for every vector, and the REAL CLI
 * (`roster unquarantine`) as a subprocess.
 *
 * Spec under test:
 *  - ROSTER-BUILD-HANDOFF.md §7  "Drift detection: hash (name, inputSchema,
 *    description) per connect; change → drift event → quarantine from default
 *    rosters pending re-Combine → dashboard alarm"
 *  - ROSTER-BUILD-HANDOFF.md §6.2 classifier rule 3: output violates declared
 *    output schema → schema_drift_suspect (ALSO raises a drift event)
 *  - docs/methodology.md §6: same hash rule; "quarantined ... pending a re-run
 *    of its Combine suite; the event enters the server's public drift history"
 *  - STATUS-FOR-MO.md (shipped design): 24h dwell + stable-re-sight auto-clear
 *    + `roster unquarantine`
 *
 * Every timestamp goes through the store's public `now` parameters — the real
 * code path (no column surgery needed). Run from repo root:
 *   node docs/lab/exp-drift-sim.mjs
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const coach = await import(
  createRequire(path.join(repo, "packages/cli/package.json")).resolve("@rosterhq/coach")
);
const {
  CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL,
  defHash, hashNeed, cosine,
} = coach;
const { TOOLS } = await import(path.join(repo, "docs/lab/corpus.mjs"));

// ── harness ────────────────────────────────────────────────────────────────
const HOME = path.join(repo, "docs/lab/tmp-drift-sim/home");
const DB = path.join(HOME, ".roster/coach.db");
fs.rmSync(path.join(repo, "docs/lab/tmp-drift-sim"), { recursive: true, force: true });
fs.mkdirSync(path.dirname(DB), { recursive: true });

const store = new CoachStore(openCoachDb(DB));
const insp = openCoachDb(DB); // second connection, inspection only (reads + none of the store's logic)

const H = 3600_000, D = 24 * H;
const T0 = Date.parse("2026-06-01T00:00:00Z");
const day = (d, h = 0) => T0 + d * D + h * H;

const assertions = [];
let aFail = 0;
const check = (id, desc, cond, detail = "") => {
  const pass = Boolean(cond);
  if (!pass) aFail++;
  assertions.push({ id, desc, pass, detail: String(detail) });
  console.log(`  ${pass ? "PASS" : "FAIL"} [${id}] ${desc}${detail ? ` — ${detail}` : ""}`);
  return pass;
};
const events = [];
const note = (dayN, label, extra = {}) => {
  events.push({ day: dayN, label, ...extra });
  console.log(`\n== day ${dayN}: ${label}`);
};
const measurements = {};

// inspection helpers (read-only SQL on the same file)
const qFlag = (id) =>
  insp.prepare("SELECT quarantined FROM capability WHERE id=?").get(id)?.quarantined;
const capRow = (id) => insp.prepare("SELECT * FROM capability WHERE id=?").get(id);
const driftCount = (id) =>
  insp.prepare(id ? "SELECT COUNT(*) c FROM drift_event WHERE capability=?" : "SELECT COUNT(*) c FROM drift_event")
    .get(...(id ? [id] : [])).c;
const vecRow = (id) => insp.prepare("SELECT dims, base, adj FROM vec WHERE capability=?").get(id);
const toVec = (buf, dims) => {
  const c = Buffer.from(buf); // copy for alignment; honor pool byteOffset (same rule as util.ts blobToVec)
  return new Float32Array(c.buffer, c.byteOffset, dims);
};
const inDraft = (need, id, k = 10, needVec = null) =>
  store.draftCandidates(need, k, needVec).some((c) => c.entry.id === id);
const draftRank = (need, id, k, needVec = null) => {
  const cs = store.draftCandidates(need, k, needVec);
  const i = cs.findIndex((c) => c.entry.id === id);
  return { rank: i === -1 ? null : i + 1, span: spanOf(cs), ids: cs.map((c) => c.entry.id) };
};
const spanOf = (cs) => {
  const vals = cs.map((c) => c.cosScore).filter((v) => v !== null && v !== undefined);
  return vals.length ? Math.max(...vals) - Math.min(...vals) : null;
};

// ── the evolving roster ────────────────────────────────────────────────────
// Full 133-tool shared corpus is the ambient roster; the "github" server evolves.
const roster = new Map(TOOLS.map((t) => [t.id, structuredClone(t)]));
const T = {
  t1: "github__create_issue",        // day 1 benign description tweak; day 18 re-drift
  t2: "github__search_repositories", // day 3 schema field added; day 21 output-schema-only change
  t3: "github__get_file_contents",   // day 6 full signature change (OATS adj seeded first)
  t4: "github__push_files",          // day 8 flap A→B→A within dwell
  t5: "github__create_repository",   // day 10 removed; day 14 re-added CHANGED
  t6: "github__fork_repository",     // day 13 drift→quarantine, removed 2h later; day 14 re-added with drifted def
  t7: "github__create_branch",       // day 16 same-day 3-change; manual store.clearQuarantine
  t8: "github__list_commits",        // day 16 same-day 3-change; REAL CLI unquarantine
  t9: "github__list_issues",         // day 16 same-day 3-change; left for auto-clear
};
const origDef = Object.fromEntries(Object.values(T).map((id) => [id, structuredClone(roster.get(id))]));

/** One "connect": upsert current roster + prune ghosts, exactly like RosterServer.syncCapabilities. */
const connect = (now) => {
  const entries = [...roster.values()];
  const res = store.upsertCapabilities(entries, now);
  const pruned = store.pruneMissing(new Set(entries.map((e) => e.id)));
  return { ...res, pruned };
};

// ── day 0: first connect, real embeddings, ratings/OATS seed ──────────────
note(0, "initial connect: 133-tool corpus, real MiniLM warmup, outcome seeding");
const r0 = connect(day(0));
check("A01", "first connect adds all 133 corpus tools, zero drift events",
  r0.added.length === 133 && r0.driftEvents === 0 && driftCount() === 0,
  `added=${r0.added.length} drift=${r0.driftEvents}`);

const provider = new TransformersEmbeddings(MINILM_MODEL);
const embedT0 = Date.now();
const all = [...roster.values()];
const BATCH = 16; // serve.ts warmup batch size
const embedAll = async (entries, now) => {
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const texts = batch.map((e) => `${e.name}\n${e.description}\n${e.body ?? ""}`.slice(0, 2000));
    const vecs = await provider.embed(texts, "document");
    batch.forEach((e, j) => { if (vecs[j]) store.storeBaseVec(e.id, vecs[j], now); });
  }
};
await embedAll(all, day(0));
measurements.warmupMs = Date.now() - embedT0;
check("A02", "real MiniLM embedded all 133 tools into vec table (384-d)",
  insp.prepare("SELECT COUNT(*) c FROM vec").get().c === 133 && vecRow(T.t3).dims === 384,
  `${measurements.warmupMs}ms incl. model load`);

// ratings seed: t1 6/6, t3 4/4 (with real need vecs → OATS), t5 4/5, search_code 2/4
const seedOutcome = (capId, cls, i, needHash = null) =>
  store.recordOutcome({
    session: `seed${i}`, source: capId.split("__")[0], capability: capId,
    outcomeClass: cls, latencyMs: 40 + i, needHash, ts: day(0, 1) + i * 1000,
  });
for (let i = 0; i < 6; i++) seedOutcome(T.t1, "success", i);
for (let i = 0; i < 4; i++) seedOutcome(T.t5, "success", 10 + i);
seedOutcome(T.t5, "tool_fail:internal", 14);
for (let i = 0; i < 2; i++) seedOutcome("github__search_code", "success", 20 + i);
for (let i = 0; i < 2; i++) seedOutcome("github__search_code", "tool_fail:internal", 22 + i);
// t3 OLD-semantics needs (real inference, real need_vec rows)
const t3OldNeeds = [
  "read the contents of a file stored in a github repository",
  "fetch the raw README file from a remote repo",
  "download a source file from a repository",
  "get a file's text out of a github repo",
];
const t3OldVecs = await provider.embed(t3OldNeeds, "query");
t3OldNeeds.forEach((n, i) => {
  const nh = hashNeed(n);
  store.storeNeedVec(nh, t3OldVecs[i], day(0, 2));
  seedOutcome(T.t3, "success", 30 + i, nh);
});
store.recomputeRatings("all", day(0, 3));
const oats0 = store.runOats(day(0, 3));
check("A03", "OATS adjusted t3 from 4 real success need-vectors (adj vector exists)",
  oats0.adjusted >= 1 && vecRow(T.t3).adj !== null, JSON.stringify(oats0));
const rat = (id) => store.getRating(id) ?? {};
measurements.seedRatings = {
  [T.t1]: rat(T.t1), [T.t3]: rat(T.t3), [T.t5]: rat(T.t5), github__search_code: rat("github__search_code"),
};
check("A04", "seed ratings landed (t1 6/6 wilson highest of seeded set)",
  rat(T.t1).n === 6 && rat(T.t1).successes === 6 && rat(T.t3).n === 4 &&
  rat(T.t1).wilsonLb > rat(T.t3).wilsonLb && rat(T.t3).wilsonLb > rat(T.t5).wilsonLb,
  JSON.stringify(measurements.seedRatings));

const needT1 = "create a new issue in a github repository";
check("A05", "pre-drift baseline: t1 drafted for its need (lexical, real FTS5)",
  inDraft(needT1, T.t1), draftRank(needT1, T.t1, 10).ids.slice(0, 3).join(","));

// ── day 1: EVENT benign description tweak on t1 ───────────────────────────
note(1, "benign description tweak on t1 (github__create_issue)");
const t1Before = { rating: rat(T.t1), hash: capRow(T.t1).def_hash };
roster.get(T.t1).description += " (supports labels, assignees and milestones)";
const r1 = connect(day(1));
check("B01", "description-only change raises exactly one drift event and quarantines t1",
  r1.driftEvents === 1 && r1.changed.length === 1 && r1.changed[0] === T.t1 &&
  qFlag(T.t1) === 1 && driftCount(T.t1) === 1,
  `changed=${r1.changed} flag=${qFlag(T.t1)}`);
const dRow1 = insp.prepare("SELECT * FROM drift_event WHERE capability=? ORDER BY id DESC LIMIT 1").get(T.t1);
check("B02", "drift_event row carries old/new hash; old matches pre-drift stored hash, new matches defHash(new def)",
  dRow1.old_hash === t1Before.hash && dRow1.new_hash === defHash(roster.get(T.t1)),
  `ts=${dRow1.ts}`);
check("B03", "quarantined t1 excluded from draftCandidates for the need it won pre-drift",
  !inDraft(needT1, T.t1));
check("B04", "quarantined t1 hidden from listCapabilities() but visible with includeQuarantined",
  !store.listCapabilities().some((e) => e.id === T.t1) &&
  store.listCapabilities({ includeQuarantined: true }).some((e) => e.id === T.t1));
check("B05", "rating continuity across benign drift: t1 rating row untouched",
  JSON.stringify(rat(T.t1)) === JSON.stringify(t1Before.rating), JSON.stringify(rat(T.t1)));

// dwell probes: stable re-sights inside 24h must NOT clear
const dwellProbes = [];
for (const [h, lbl] of [[1, "+1h"], [6, "+6h"], [23, "+23h"]]) {
  connect(day(1, h));
  dwellProbes.push({ at: lbl, quarantined: qFlag(T.t1) });
}
check("B06", "24h dwell honored: stable re-sights at +1h/+6h/+23h leave t1 quarantined",
  dwellProbes.every((p) => p.quarantined === 1), JSON.stringify(dwellProbes));
connect(day(2, 1)); // 25h after the drift event
check("B07", "stable-re-sight auto-clear fires at +25h (first re-sight past dwell)",
  qFlag(T.t1) === 0 && inDraft(needT1, T.t1));
measurements.dwellProbesT1 = dwellProbes;

// ── day 3: EVENT schema field added on t2 ─────────────────────────────────
note(3, "inputSchema field added on t2 (github__search_repositories)");
roster.get(T.t2).inputSchema = { type: "object", properties: { per_page: { type: "number" } } };
const r3 = connect(day(3));
check("C01", "schema-field add raises drift event and quarantines t2",
  r3.driftEvents === 1 && qFlag(T.t2) === 1 && driftCount(T.t2) === 1);
// no re-sight at all until 48h later
connect(day(5));
check("C02", "dwell measured from the drift EVENT: first re-sight 48h later clears immediately",
  qFlag(T.t2) === 0);

// ── day 6: EVENT full signature change on t3 (OATS adj already learned) ───
note(6, "full signature change on t3 (github__get_file_contents becomes a deploy-dispatch tool)");
const t3Before = { rating: rat(T.t3) };
const t3Old = structuredClone(roster.get(T.t3));
Object.assign(roster.get(T.t3), {
  description: "Trigger a repository_dispatch event to launch a deployment workflow run",
  inputSchema: { type: "object", properties: { event_type: { type: "string" }, client_payload: { type: "object" } }, required: ["event_type"] },
  outputSchema: { type: "object", properties: { dispatched: { type: "boolean" } } },
});
const r6 = connect(day(6));
check("D01", "full signature change raises drift event and quarantines t3",
  r6.driftEvents === 1 && qFlag(T.t3) === 1 && driftCount(T.t3) === 1);
check("D02", "rating continuity across signature drift: old-semantics 4/4 rating survives unchanged",
  JSON.stringify(rat(T.t3)) === JSON.stringify(t3Before.rating), JSON.stringify(rat(T.t3)));

// vec-level truth (real inference): what does the draft-facing vector encode now?
const [eOld] = await provider.embed([`${t3Old.name}\n${t3Old.description}\n`], "document");
const [eNew] = await provider.embed([`${roster.get(T.t3).name}\n${roster.get(T.t3).description}\n`], "document");
const served = (id) => store.loadVecs().get(id);
const vecStage = (stage) => {
  const v = served(T.t3);
  const row = vecRow(T.t3);
  const base = toVec(row.base, row.dims);
  return {
    stage,
    servedIsAdj: row.adj !== null,
    cos_served_oldDesc: +cosine(v, eOld).toFixed(4),
    cos_served_newDesc: +cosine(v, eNew).toFixed(4),
    cos_base_oldDesc: +cosine(base, eOld).toFixed(4),
    cos_base_newDesc: +cosine(base, eNew).toFixed(4),
  };
};
measurements.t3VecLifecycle = [vecStage("after-drift-before-warmup")];
// next boot (day 7): serve.ts warmup re-embeds ALL capabilities incl. quarantined
await embedAll([roster.get(T.t3)], day(7));
measurements.t3VecLifecycle.push(vecStage("after-warmup-reembed"));
// nightly OATS after re-embed: positives are still the OLD-semantics needs
const oats7 = store.runOats(day(7, 2));
measurements.t3VecLifecycle.push(vecStage("after-next-nightly-oats"));
const [s0, s1, s2] = measurements.t3VecLifecycle;
check("D03", "before next warmup, draft-facing vector still encodes the OLD signature",
  s0.cos_served_oldDesc > s0.cos_served_newDesc, JSON.stringify(s0));
check("D04", "warmup re-embeds base to NEW signature, but served vector (adj) still the old-semantics OATS blend",
  s1.cos_base_newDesc > 0.99 && s1.servedIsAdj &&
  s1.cos_served_oldDesc === s0.cos_served_oldDesc,
  JSON.stringify(s1));
measurements.oatsAfterSignatureChange = { ...oats7, stage: s2 };
connect(day(7, 1)); // 25h post drift → auto-clear
check("D05", "t3 auto-clears after dwell despite the signature being semantically different",
  qFlag(T.t3) === 0);
// draft-level probe with real query vectors, old-need vs new-need
const [probeOldVec] = await provider.embed([t3OldNeeds[0]], "query");
const [probeNewVec] = await provider.embed(["trigger a deployment workflow dispatch for my repository"], "query");
measurements.t3DraftRanks = {
  oldNeed: draftRank(t3OldNeeds[0], T.t3, 10, probeOldVec),
  newNeed: draftRank("trigger a deployment workflow dispatch for my repository", T.t3, 10, probeNewVec),
};
console.log(`  t3 rank for OLD-semantics need: ${measurements.t3DraftRanks.oldNeed.rank} (cos span ${measurements.t3DraftRanks.oldNeed.span?.toFixed(3)})`);
console.log(`  t3 rank for NEW-semantics need: ${measurements.t3DraftRanks.newNeed.rank} (cos span ${measurements.t3DraftRanks.newNeed.span?.toFixed(3)})`);

// ── day 8: EVENT flap A→B→A on t4 within dwell ────────────────────────────
note(8, "flap on t4 (github__push_files): A→B at +0h, B→A at +6h");
const hashA = capRow(T.t4).def_hash;
roster.get(T.t4).description = "Push multiple files atomically in one commit (v2 batching)";
connect(day(8));
const hashB = capRow(T.t4).def_hash;
check("E01", "A→B: drift event #1, quarantined", qFlag(T.t4) === 1 && driftCount(T.t4) === 1);
roster.get(T.t4).description = origDef[T.t4].description; // flap back within dwell
connect(day(8, 6));
check("E02", "B→A flap-back is itself a drift event (#2), still quarantined",
  driftCount(T.t4) === 2 && qFlag(T.t4) === 1);
const t4Events = insp.prepare("SELECT old_hash, new_hash FROM drift_event WHERE capability=? ORDER BY id").all(T.t4);
check("E03", "hash chain: e1 A→B, e2 B→A (new_hash of e2 = original hash)",
  t4Events[0].old_hash === hashA && t4Events[0].new_hash === hashB &&
  t4Events[1].old_hash === hashB && t4Events[1].new_hash === hashA);
connect(day(8, 12));
const flapProbe1 = qFlag(T.t4); // 6h after flap-back
connect(day(9, 5)); // 23h after flap-back
const flapProbe2 = qFlag(T.t4);
connect(day(9, 7)); // 25h after flap-back
measurements.flapDwell = { "+6h_after_flapback": flapProbe1, "+23h_after_flapback": flapProbe2, "+25h_after_flapback": qFlag(T.t4) };
check("E04", "flap restarts the dwell: still quarantined 23h after flap-back, clears at 25h",
  flapProbe1 === 1 && flapProbe2 === 1 && qFlag(T.t4) === 0, JSON.stringify(measurements.flapDwell));

// ── day 10: EVENT t5 removed ───────────────────────────────────────────────
note(10, "t5 (github__create_repository) removed from the server");
const t5Rating = rat(T.t5);
roster.delete(T.t5);
const r10 = connect(day(10));
check("F01", "prune removes capability+vec rows for t5",
  r10.pruned.includes(T.t5) && capRow(T.t5) === undefined && vecRow(T.t5) === undefined);
check("F02", "prune keeps outcome history and rating row (per design comment)",
  insp.prepare("SELECT COUNT(*) c FROM outcome WHERE capability=?").get(T.t5).c === 5 &&
  rat(T.t5) !== null && rat(T.t5).n === 5, JSON.stringify(rat(T.t5)));

// background steady days
connect(day(11)); connect(day(12));

// ── day 13: EVENT t6 drifts, then is removed WHILE quarantined ────────────
note(13, "t6 (github__fork_repository) drifts at +0h, removed at +2h (mid-dwell)");
roster.get(T.t6).description = "Fork a repository and optionally clone it into a codespace";
const t6DriftedDef = structuredClone(roster.get(T.t6));
connect(day(13));
check("G01", "t6 quarantined on drift", qFlag(T.t6) === 1 && driftCount(T.t6) === 1);
roster.delete(T.t6);
connect(day(13, 2));
check("G02", "t6 pruned while quarantined (row gone, drift history kept)",
  capRow(T.t6) === undefined && driftCount(T.t6) === 1);

// ── day 14: EVENTS t5 re-added CHANGED; t6 re-added with the drifted def ──
note(14, "t5 re-added with a CHANGED definition; t6 re-added mid-dwell with its drifted definition");
roster.set(T.t5, { ...origDef[T.t5], description: "Create a new repository under any org with template support" });
roster.set(T.t6, t6DriftedDef); // 22h after t6's drift event — inside what the dwell would have been
const r14 = connect(day(14));
check("H01", "QUARANTINE ESCAPE (remove/re-add): t5 returns with a different definition as a fresh add — NO drift event, NOT quarantined",
  r14.added.includes(T.t5) && r14.driftEvents === 0 && driftCount(T.t5) === 0 && qFlag(T.t5) === 0,
  `added=${r14.added.join(",")}`);
check("H02", "QUARANTINE ESCAPE (mid-dwell): t6 re-added 22h into its dwell comes back active immediately",
  r14.added.includes(T.t6) && qFlag(T.t6) === 0 && driftCount(T.t6) === 1);
check("H03", "old rating rides the new t5 definition (5-call history attached to changed tool)",
  rat(T.t5).n === t5Rating.n && rat(T.t5).wilsonLb === t5Rating.wilsonLb, JSON.stringify(rat(T.t5)));

connect(day(15));

// ── day 16: EVENT 3 tools change the same day + unquarantine paths ────────
note(16, "t7/t8/t9 all change in one connect; manual unquarantine via store call AND real CLI");
roster.get(T.t7).description = "Create a branch from any ref with protection rules applied";
roster.get(T.t8).inputSchema = { type: "object", properties: { sha: { type: "string" }, per_page: { type: "number" } } };
roster.get(T.t9).description = "List and filter repository issues (state, labels, assignee, sort)";
const r16 = connect(day(16));
const trio = [T.t7, T.t8, T.t9];
check("I01", "one connect, three drift events, all three quarantined",
  r16.driftEvents === 3 && trio.every((id) => qFlag(id) === 1) &&
  insp.prepare("SELECT COUNT(*) c FROM drift_event WHERE ts=?").get(day(16)).c === 3);
const githubActive = store.listCapabilities().filter((e) => e.source === "github").length;
const githubAll = store.listCapabilities({ includeQuarantined: true }).filter((e) => e.source === "github").length;
check("I02", "quarantine is per-TOOL: the server's other tools stay active (spec text says 'tool/server')",
  githubActive === githubAll - 3, `active=${githubActive} total=${githubAll}`);
check("I03", "all three excluded from drafts",
  !inDraft("create a new branch in a github repository", T.t7) &&
  !inDraft("list commits of a branch", T.t8) &&
  !inDraft("list issues in a repository with filtering", T.t9));

// manual unquarantine DURING dwell (that's its purpose)
store.clearQuarantine(T.t7);
check("I04", "store.clearQuarantine(t7) clears mid-dwell and t7 drafts again",
  qFlag(T.t7) === 0 && inDraft("create a new branch in a github repository", T.t7));
// REAL CLI subprocess against the same real DB file
const cli = spawnSync(process.execPath, [path.join(repo, "packages/cli/dist/bin.js"), "unquarantine", T.t8], {
  env: { ...process.env, ROSTER_TEST_HOME: HOME },
  encoding: "utf8", timeout: 30_000,
});
measurements.cliUnquarantine = { status: cli.status, stdout: cli.stdout?.trim(), stderr: cli.stderr?.trim() };
check("I05", "REAL CLI `roster unquarantine` (subprocess, ROSTER_TEST_HOME) exits 0 and clears t8 in the shared DB",
  cli.status === 0 && qFlag(T.t8) === 0 && inDraft("list commits of a branch", T.t8),
  JSON.stringify(measurements.cliUnquarantine));
// stable re-sight within dwell must NOT re-quarantine manually cleared tools
connect(day(16, 23));
check("I06", "re-sight 23h post-drift: manual clears survive (t7,t8 stay 0), untouched t9 still quarantined",
  qFlag(T.t7) === 0 && qFlag(T.t8) === 0 && qFlag(T.t9) === 1);
connect(day(17, 1));
check("I07", "t9 auto-clears at 25h", qFlag(T.t9) === 0);

// ── day 18: rated-fallback under quarantine ────────────────────────────────
note(18, "rated-fallback probe: no-token-overlap need, then quarantine the top-rated tool");
const gibberish = "zzqx unfindable blorp glomp"; // zero FTS hits → pure ratedFallback path
const fb0 = store.draftCandidates(gibberish, 5).map((c) => c.entry.id);
check("J01", "empty lexical result falls back to rated order: t1 (wilson .61) first, then t3 (.51), then t5 (.38)",
  fb0[0] === T.t1 && fb0[1] === T.t3 && fb0[2] === T.t5, fb0.join(","));
roster.get(T.t1).description += " Now with sub-issues.";
connect(day(18));
const fb1 = store.draftCandidates(gibberish, 5).map((c) => c.entry.id);
check("J02", "after t1 drifts again, rated fallback skips the quarantined leader; t3 promoted to head",
  qFlag(T.t1) === 1 && !fb1.includes(T.t1) && fb1[0] === T.t3, fb1.join(","));
measurements.ratedFallback = { before: fb0, after: fb1 };
connect(day(19, 1));
check("J03", "t1 second lifecycle auto-clear at +25h", qFlag(T.t1) === 0);

// ── day 21: output-schema-only change + schema_drift_suspect runtime path ──
note(21, "output-schema-only change on t2; then a schema_drift_suspect outcome through the real classifier");
connect(day(20));
const preOutDrift = driftCount();
roster.get(T.t2).outputSchema = { type: "object", properties: { total_count: { type: "number" } } };
const r21 = connect(day(21));
const t2Row = capRow(T.t2);
check("K01", "outputSchema change is INVISIBLE to connect-time drift: no event, no quarantine (defHash omits outputSchema)",
  r21.driftEvents === 0 && qFlag(T.t2) === 0 && driftCount() === preOutDrift);
check("K02", "and the new outputSchema is NOT persisted either (stable-hash branch never updates the row)",
  t2Row.output_schema === null, `stored=${JSON.stringify(t2Row.output_schema)}`);
// runtime: output violates declared schema → schema_drift_suspect. Handoff §6.2
// rule 3 says this "also raises a drift event". Real classifier + real store:
const cls = coach.classifyOutcome({ outputSchemaViolation: true });
store.recordOutcome({
  session: "rt1", source: "github", capability: T.t2, outcomeClass: cls,
  latencyMs: 55, ts: day(21, 2),
});
check("K03", `classifier yields '${cls}' but NO drift event and NO quarantine follow (handoff §6.2 rule 3 divergence)`,
  cls === "schema_drift_suspect" && driftCount() === preOutDrift && qFlag(T.t2) === 0,
  `drift_events still ${driftCount()}`);

// ── days 22-29 steady; day 30 final ledger ────────────────────────────────
for (let d = 22; d <= 29; d++) {
  connect(day(d));
  store.runMaintenanceIfDue(20 * H, day(d, 1));
}
note(30, "final ledger");
const ledger = store.driftEvents();
const expected = { [T.t1]: 2, [T.t2]: 1, [T.t3]: 1, [T.t4]: 2, [T.t6]: 1, [T.t7]: 1, [T.t8]: 1, [T.t9]: 1 };
const perCap = {};
for (const e of ledger) perCap[e.capability] = (perCap[e.capability] ?? 0) + 1;
const distributionMatches =
  Object.keys(expected).length === Object.keys(perCap).length &&
  Object.entries(expected).every(([k, v]) => perCap[k] === v);
check("L01", "exactly 10 drift events over 30 days, distributed as scripted",
  ledger.length === 10 && distributionMatches,
  JSON.stringify(perCap));
check("L02", "driftEvents() returns newest-first (public drift history ordering)",
  ledger.every((e, i) => i === 0 || ledger[i - 1].ts >= e.ts));
const quarantinedNow = insp.prepare("SELECT COUNT(*) c FROM capability WHERE quarantined=1").get().c;
check("L03", "day 30: zero tools quarantined; roster back to 133 active",
  quarantinedNow === 0 && store.listCapabilities().length === 133);
// hash-chain integrity per capability across the whole month
let chainOk = true;
for (const capId of Object.keys(expected)) {
  const evs = insp.prepare("SELECT old_hash, new_hash FROM drift_event WHERE capability=? ORDER BY id").all(capId);
  for (let i = 1; i < evs.length; i++) if (evs[i].old_hash !== evs[i - 1].new_hash) chainOk = false;
}
check("L04", "hash chains contiguous for every capability (old_hash of event N+1 = new_hash of event N)", chainOk);
check("L05", "ratings survived the whole month (outcome history never dropped)",
  rat(T.t1).n === 6 && rat(T.t3).n === 4 && rat(T.t5).n === 5);

await provider.dispose();

// ── write results ──────────────────────────────────────────────────────────
const results = {
  meta: {
    experiment: "drift-sim", date: new Date().toISOString(), node: process.version,
    model: MINILM_MODEL, db: DB, virtualT0: new Date(T0).toISOString(),
    corpusSize: TOOLS.length, dwellMsInCode: 24 * 3600 * 1000,
  },
  events, assertions, measurements,
  driftLedger: ledger,
  finals: { quarantinedNow, activeCapabilities: store.listCapabilities().length, perCapDriftCounts: perCap },
  failures: aFail,
};
fs.writeFileSync(path.join(repo, "docs/lab/results-drift-sim.json"), JSON.stringify(results, null, 2));
console.log(`\n${assertions.length} assertions, ${aFail} failures → docs/lab/results-drift-sim.json`);
process.exit(aFail > 0 ? 1 : 0);
