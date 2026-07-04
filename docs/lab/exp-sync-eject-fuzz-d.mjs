/**
 * EXP D v2 — crash windows (SIGKILL semantics via process.exit inside the fs op
 * interceptor) + fs-error injection (throw semantics) for sync and eject.
 * Recovery probes run IN PLACE (manifest.sourcePath is absolute, so probing a
 * copied home is invalid — learned from v1); the home is restored from a
 * pre-probe snapshot between strategies.
 *   probe E : plain eject  -> force if needed
 *   probe S : re-run sync, then eject (force if needed)   ["it crashed, run it again"]
 * recoverable = some probe ends with config == C0 byte-for-byte.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { repo, LAB, SCRATCH, configPathFor, saveSection } from "./exp-sync-eject-fuzz-lib.mjs";

const CHILD = path.join(LAB, "exp-sync-eject-fuzz-crash-child.mjs");
const C0 = Buffer.from(`{\n  "mcpServers": {\n    "memory": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"]}\n  },\n  "theme": "dark"\n}\n`);

let homeN = 0;
function mkHome(tag) {
  const home = path.join(SCRATCH, `d2-${tag}-${homeN++}`);
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true });
  const cfg = configPathFor("claude-code", home);
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  fs.writeFileSync(cfg, C0);
  return { home, cfg };
}

function child(home, env) {
  const opLogFile = path.join(home, "..", `oplog-${path.basename(home)}.json`);
  try {
    const out = execFileSync(process.execPath, [CHILD], {
      env: { ...process.env, ROSTER_TEST_HOME: home, REPO: repo, OPLOG: opLogFile, ...env },
      cwd: home, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(out.trim().split("\n").pop());
    return { code: 0, ...parsed };
  } catch (e) {
    let parsed = {};
    const line = (e.stdout ?? "").trim().split("\n").pop();
    try { parsed = JSON.parse(line); } catch {}
    if (!parsed.opLog && fs.existsSync(opLogFile)) {
      try { parsed.opLog = JSON.parse(fs.readFileSync(opLogFile, "utf8")); } catch {}
    }
    return { code: e.status, ...parsed, stderr: (e.stderr ?? "").slice(0, 150) };
  } finally {
    fs.rmSync(opLogFile, { force: true });
  }
}

function inspect(home, cfg) {
  const root = path.join(home, ".roster", "backups", "claude-code");
  const cfgBytes = fs.existsSync(cfg) ? fs.readFileSync(cfg) : null;
  const st = {
    config: cfgBytes === null ? "MISSING" : cfgBytes.equals(C0) ? "C0" : "rewritten",
    tmpLitter: fs.existsSync(`${cfg}.roster-tmp`) || fs.existsSync(path.join(home, ".roster", "roster.json.tmp")),
    rosterJson: (() => {
      const p = path.join(home, ".roster", "roster.json");
      if (!fs.existsSync(p)) return "absent";
      try { return JSON.parse(fs.readFileSync(p, "utf8")).servers?.memory ? "has-imported-server" : "valid-but-missing-import"; }
      catch { return "CORRUPT"; }
    })(),
    backups: [],
  };
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root).filter((x) => fs.statSync(path.join(root, x)).isDirectory()).sort()) {
      const b = { dir: d };
      const mP = path.join(root, d, "manifest.json");
      const oP = path.join(root, d, "original");
      b.manifest = fs.existsSync(mP) ? (() => { try { JSON.parse(fs.readFileSync(mP, "utf8")); return "valid"; } catch { return "CORRUPT"; } })() : "absent";
      b.original = fs.existsSync(oP) ? (fs.readFileSync(oP).equals(C0) ? "C0" : "other") : "absent";
      st.backups.push(b);
    }
  }
  return st;
}

/** In-place recovery probes with snapshot/restore between strategies. */
function recoveryProbes(home, cfg) {
  const snap = `${home}.snap`;
  fs.rmSync(snap, { recursive: true, force: true });
  fs.cpSync(home, snap, { recursive: true });
  const restore = () => { fs.rmSync(home, { recursive: true, force: true }); fs.cpSync(snap, home, { recursive: true }); };
  const atC0 = () => fs.existsSync(cfg) && fs.readFileSync(cfg).equals(C0);
  const probes = {};

  // E: plain eject (in place), force if needed
  let r = child(home, { MODE: "eject" });
  probes.E = { eject: r.action ?? r.err };
  if (!atC0()) { const rf = child(home, { MODE: "eject", FORCE: "1" }); probes.E.force = rf.action ?? rf.err; }
  probes.E.endsAtC0 = atC0();

  // S: re-sync then eject, force if needed
  restore();
  const rs = child(home, { MODE: "sync", SYNC_TS: "2026-07-04T12:00:05.000Z" });
  const re = child(home, { MODE: "eject" });
  probes.S = { resync: rs.action ?? rs.err, eject: re.action ?? re.err };
  if (!atC0()) { const rf = child(home, { MODE: "eject", FORCE: "1" }); probes.S.force = rf.action ?? rf.err; }
  probes.S.endsAtC0 = atC0();

  restore();
  fs.rmSync(snap, { recursive: true, force: true });
  probes.recoverable = probes.E.endsAtC0 || probes.S.endsAtC0;
  return probes;
}

// ---- clean run: enumerate ops ----
const probeHome = mkHome("clean");
const clean = child(probeHome.home, { MODE: "sync" });
console.log(`clean sync: ${clean.ops} mutating ops (completed=${clean.completed}, imported=${clean.imported})`);
clean.opLog.forEach((o, i) => console.log(`  op${i + 1}: ${o}`));
const N = clean.ops;

// ---- KILL windows (exit semantics) ----
const syncWindows = [];
for (let k = 1; k <= N; k++) {
  const { home, cfg } = mkHome(`kill-k${k}`);
  const run = child(home, { MODE: "sync", CRASH_AFTER: String(k), CRASH_STYLE: "exit" });
  const state = inspect(home, cfg);
  const rec = recoveryProbes(home, cfg);
  syncWindows.push({ k, killedInsteadOf: clean.opLog[k - 1], exit: run.code, state, recovery: rec });
  console.log(`\n== KILL instead of op${k} ${clean.opLog[k - 1]} (exit=${run.code}) ==`);
  console.log(`   state: cfg=${state.config} rosterJson=${state.rosterJson} backups=${JSON.stringify(state.backups)} litter=${state.tmpLitter}`);
  console.log(`   recovery: E=${JSON.stringify(rec.E)} S=${JSON.stringify(rec.S)} recoverable=${rec.recoverable}`);
}

// ---- TORN-write kills ----
const tornWindows = [];
for (let k = 1; k <= N; k++) {
  if (!clean.opLog[k - 1].startsWith("writeFileSync")) continue;
  const { home, cfg } = mkHome(`torn-k${k}`);
  const run = child(home, { MODE: "sync", CRASH_AFTER: String(k), CRASH_STYLE: "exit", TORN: "1" });
  const state = inspect(home, cfg);
  const rec = recoveryProbes(home, cfg);
  tornWindows.push({ k, tornOp: clean.opLog[k - 1], state, recovery: rec });
  console.log(`\n== KILL mid-write op${k} ${clean.opLog[k - 1]} ==`);
  console.log(`   state: cfg=${state.config} rosterJson=${state.rosterJson} backups=${JSON.stringify(state.backups)} litter=${state.tmpLitter}`);
  console.log(`   recovery: E=${JSON.stringify(rec.E)} S=${JSON.stringify(rec.S)} recoverable=${rec.recoverable}`);
}

// ---- fs-ERROR injection (throw semantics): does the CLI swallow failures? ----
const throwWindows = [];
for (let k = 1; k <= N; k++) {
  const { home, cfg } = mkHome(`throw-k${k}`);
  const run = child(home, { MODE: "sync", CRASH_AFTER: String(k), CRASH_STYLE: "throw" });
  const state = inspect(home, cfg);
  throwWindows.push({
    k, failingOp: clean.opLog[k - 1],
    syncOutcome: run.completed ? `completed:${run.action} imported=${run.imported}` : `errored:${(run.err ?? "").slice(0, 60)}`,
    swallowed: run.completed === true,
    state,
  });
  console.log(`== fs error at op${k} ${clean.opLog[k - 1]} -> ${throwWindows[throwWindows.length - 1].syncOutcome} | cfg=${state.config} rosterJson=${state.rosterJson}`);
}

// ---- eject KILL windows ----
const ejHome = mkHome("ej-count");
child(ejHome.home, { MODE: "sync" });
const ejClean = child(ejHome.home, { MODE: "eject" });
console.log(`\nclean eject: ${ejClean.ops} mutating ops`);
ejClean.opLog.forEach((o, i) => console.log(`  op${i + 1}: ${o}`));

const ejectWindows = [];
for (let k = 1; k <= ejClean.ops; k++) {
  const { home, cfg } = mkHome(`ejkill-k${k}`);
  child(home, { MODE: "sync" });
  const run = child(home, { MODE: "eject", CRASH_AFTER: String(k), CRASH_STYLE: "exit" });
  const afterCrash = fs.readFileSync(cfg).equals(C0) ? "C0(restored)" : "roster-state";
  const eraArchived = !fs.existsSync(path.join(home, ".roster", "backups", "claude-code"));
  let re = child(home, { MODE: "eject" });
  let reF = null;
  let endsAtC0 = fs.readFileSync(cfg).equals(C0);
  if (!endsAtC0) { reF = child(home, { MODE: "eject", FORCE: "1" }); endsAtC0 = fs.readFileSync(cfg).equals(C0); }
  const w = { k, killedInsteadOf: ejClean.opLog[k - 1], afterCrash, eraArchived, reEject: re.action ?? re.err, reEjectForce: reF ? (reF.action ?? reF.err) : undefined, endsAtC0 };
  ejectWindows.push(w);
  console.log(`== eject KILL instead of op${k} ${w.killedInsteadOf}: cfg=${afterCrash} eraArchived=${eraArchived} reEject=${w.reEject}${w.reEjectForce ? `/force=${w.reEjectForce}` : ""} endsAtC0=${endsAtC0}`);
}

const unrecoverable = [...syncWindows, ...tornWindows].filter((w) => !w.recovery.recoverable);
const swallowed = throwWindows.filter((w) => w.swallowed);
console.log(`\n==== SUMMARY ====`);
console.log(`KILL windows: ${syncWindows.length} + torn ${tornWindows.length} + eject ${ejectWindows.length}`);
console.log(`UNRECOVERABLE kill states: ${unrecoverable.length}${unrecoverable.length ? " -> " + unrecoverable.map((w) => `k${w.k}${w.tornOp ? "(torn)" : ""}`).join(",") : ""}`);
console.log(`fs errors SWALLOWED by sync (completed anyway): ${swallowed.length}/${throwWindows.length} -> ops ${swallowed.map((w) => w.k).join(",")}`);
console.log(`eject kill windows not ending at C0: ${ejectWindows.filter((w) => !w.endsAtC0).length}`);

saveSection("d", { cleanOps: clean.opLog, syncWindows, tornWindows, throwWindows, ejectOps: ejClean.opLog, ejectWindows });
