#!/usr/bin/env node
/**
 * exp-e2e-realism-followup — two loose ends from the 40-call session, run
 * against REAL processes:
 *   A. Kill semantics, controlled (no FIFO confounder): StdioClientTransport.pid
 *      is the `npm exec` wrapper, not the server. What does the router
 *      experience when (A) the wrapper dies vs (B) the server dies? Which
 *      outcome class results, and does anything leak?
 *   B. Protocol fidelity completion: current server-memory turns bad args into
 *      an isError RESULT (nobody throws). Capture direct + transparent resolved
 *      bodies and byte-compare with the five-mode body from the main run.
 * Appends under `followup` in results-e2e-realism.json.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));

const coachPkg = await import(req.resolve("@rosterhq/coach"));
const routerPkg = await import(req.resolve("@rosterhq/router"));
const { Client } = await import(req.resolve("@modelcontextprotocol/sdk/client/index.js"));
const { StdioClientTransport } = await import(req.resolve("@modelcontextprotocol/sdk/client/stdio.js"));
const { InMemoryTransport } = await import(req.resolve("@modelcontextprotocol/sdk/inMemory.js"));
const { CoachStore, openCoachDb, classifyOutcome } = coachPkg;
const { BackendManager, RosterServer } = routerPkg;

const TMP = path.join(here, "tmp-e2e-realism");
fs.mkdirSync(TMP, { recursive: true });
const SANDBOX = fs.realpathSync(fs.mkdtempSync(path.join(TMP, "kill-sandbox-")));
fs.writeFileSync(path.join(SANDBOX, "a.txt"), "alpha\n");
const childEnv = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MEMORY_FILE_PATH: path.join(TMP, "mem-followup.json") };

const OUT = path.join(here, "results-e2e-realism.json");
const results = JSON.parse(fs.readFileSync(OUT, "utf8"));
const followup = { startedAt: new Date().toISOString() };
results.followup = followup;
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// process-tree helpers (real `ps` output)
function psSnapshot() {
  const out = execFileSync("ps", ["-Ao", "pid=,ppid=,command="], { encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((l) => {
    const m = l.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    return m ? { pid: +m[1], ppid: +m[2], cmd: m[3] } : null;
  }).filter(Boolean);
}
function descendants(rootPid) {
  const snap = psSnapshot();
  const kids = new Map();
  for (const p of snap) {
    if (!kids.has(p.ppid)) kids.set(p.ppid, []);
    kids.get(p.ppid).push(p);
  }
  const out = [];
  const walk = (pid) => {
    for (const c of kids.get(pid) ?? []) { out.push(c); walk(c.pid); }
  };
  walk(rootPid);
  return out;
}
const aliveWithSandbox = () => psSnapshot().filter((p) => p.cmd.includes(SANDBOX)).map((p) => ({ pid: p.pid, cmd: p.cmd.slice(0, 110) }));

async function spawnFsBackend(manager, name) {
  const transport = new StdioClientTransport({
    command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", SANDBOX], env: childEnv, stderr: "ignore",
  });
  await manager.connect({ name, transport });
  await sleep(300); // let the npx chain settle so the tree is complete
  const tree = descendants(transport.pid);
  const serverProc = tree.find((p) => p.cmd.includes("mcp-server-filesystem")) ?? null;
  return { transport, wrapperPid: transport.pid, serverPid: serverProc?.pid ?? null, tree: tree.map((p) => ({ pid: p.pid, cmd: p.cmd.slice(0, 110) })) };
}

async function measuredCall(manager, backend, toolName, args) {
  const t0 = Date.now();
  const outcome = await manager.call(backend, toolName, args);
  return {
    ms: Date.now() - t0,
    class: classifyOutcome(outcome.evidence),
    evidence: outcome.evidence,
    resultText: outcome.result?.content?.[0]?.text?.slice(0, 120) ?? null,
  };
}

// ── A1: kill the npm-exec WRAPPER (what transport.pid points at) ──────────
say("## A1: SIGKILL the npx wrapper only");
{
  const manager = new BackendManager();
  const b = await spawnFsBackend(manager, "fsa");
  const baseline = await measuredCall(manager, "fsa", "read_text_file", { path: path.join(SANDBOX, "a.txt") });
  process.kill(b.wrapperPid, "SIGKILL");
  await sleep(600);
  const call1 = await measuredCall(manager, "fsa", "read_text_file", { path: path.join(SANDBOX, "a.txt") });
  const call2 = await measuredCall(manager, "fsa", "get_file_info", { path: path.join(SANDBOX, "a.txt") });
  const survivors = aliveWithSandbox();
  followup.A1_wrapperKill = {
    wrapperPid: b.wrapperPid, serverPid: b.serverPid, treeAtBoot: b.tree,
    baseline, callAfterKill1: call1, callAfterKill2: call2,
    survivorsAfterKill: survivors,
    serverLeaked: survivors.some((p) => p.pid === b.serverPid),
  };
  say(`  baseline=${baseline.class}(${baseline.ms}ms) after-kill: ${call1.class}(${call1.ms}ms), ${call2.class}(${call2.ms}ms); server ${b.serverPid} leaked=${followup.A1_wrapperKill.serverLeaked}`);
  for (const p of survivors) { try { process.kill(p.pid, "SIGKILL"); } catch { /* gone */ } }
  await manager.close().catch(() => {});
  save();
}

// ── A2: kill the SERVER process itself (wrapper alive) ────────────────────
say("## A2: SIGKILL the real server (grandchild)");
{
  const manager = new BackendManager();
  const b = await spawnFsBackend(manager, "fsb");
  const baseline = await measuredCall(manager, "fsb", "read_text_file", { path: path.join(SANDBOX, "a.txt") });
  if (b.serverPid) process.kill(b.serverPid, "SIGKILL");
  await sleep(600);
  const call1 = await measuredCall(manager, "fsb", "read_text_file", { path: path.join(SANDBOX, "a.txt") });
  const call2 = await measuredCall(manager, "fsb", "get_file_info", { path: path.join(SANDBOX, "a.txt") });
  const survivors = aliveWithSandbox();
  followup.A2_serverKill = {
    wrapperPid: b.wrapperPid, serverPid: b.serverPid, baseline,
    callAfterKill1: call1, callAfterKill2: call2, survivorsAfterKill: survivors,
    sixthManEligible: ["hard_fail:transport", "tool_fail:timeout", "tool_fail:internal"].includes(call1.class),
  };
  say(`  baseline=${baseline.class}(${baseline.ms}ms) after-kill: ${call1.class}(${call1.ms}ms), ${call2.class}(${call2.ms}ms); survivors=${survivors.length}`);
  for (const p of survivors) { try { process.kill(p.pid, "SIGKILL"); } catch { /* gone */ } }
  await manager.close().catch(() => {});
  save();
}

// ── B: bad-args fidelity triangle (server-memory resolves, nobody throws) ─
say("## B: bad-args isError triangle (direct vs transparent vs five-from-main-run)");
{
  const badArgs = { entityNames: "not-an-array" };
  const direct = new Client({ name: "lab-direct-mem2", version: "0.0.0" });
  await direct.connect(new StdioClientTransport({ command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], env: childEnv, stderr: "ignore" }));
  let directRes = null; let directThrew = null;
  try { directRes = await direct.callTool({ name: "delete_entities", arguments: badArgs }); }
  catch (e) { directThrew = { code: e?.code ?? null, message: String(e?.message ?? e) }; }

  const manager = new BackendManager();
  await manager.connect({ name: "memory", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], env: childEnv });
  const roster = new RosterServer({ mode: "transparent", manager, store: new CoachStore(openCoachDb(":memory:")), skills: [] });
  const [aT, rT] = InMemoryTransport.createLinkedPair();
  await roster.server.connect(rT);
  const agent = new Client({ name: "lab-agent-f", version: "0.0.0" });
  await agent.connect(aT);
  let transparentRes = null; let transparentThrew = null;
  try { transparentRes = await agent.callTool({ name: "memory__delete_entities", arguments: badArgs }); }
  catch (e) { transparentThrew = { code: e?.code ?? null, message: String(e?.message ?? e) }; }

  // unknown-tool triangle (roster intercepts; backend never sees it)
  let unknownDirect = null;
  try { await direct.callTool({ name: "tool_that_does_not_exist", arguments: {} }); }
  catch (e) { unknownDirect = { code: e?.code ?? null, message: String(e?.message ?? e) }; }
  let unknownTransparent = null;
  try { await agent.callTool({ name: "memory__tool_that_does_not_exist", arguments: {} }); }
  catch (e) { unknownTransparent = { code: e?.code ?? null, message: String(e?.message ?? e) }; }

  const canon = (x) => JSON.stringify(x);
  const fiveRes = results.fidelity?.protocolError?.five?.res ?? null;
  followup.B_badArgsTriangle = {
    direct: directRes ?? directThrew,
    directResolved: directRes !== null,
    transparent: transparentRes ?? transparentThrew,
    transparentResolved: transparentRes !== null,
    fiveFromMainRun: fiveRes,
    transparentEqualsDirect: directRes && transparentRes ? canon(transparentRes) === canon(directRes) : null,
    fiveEqualsDirect: directRes && fiveRes ? canon(fiveRes) === canon(directRes) : null,
    unknownTool: { direct: unknownDirect, transparent: unknownTransparent, fiveFromMainRun: results.probes?.hallucinatedTool?.threw ?? null },
  };
  say(`  direct resolved=${followup.B_badArgsTriangle.directResolved}; transparent==direct ${followup.B_badArgsTriangle.transparentEqualsDirect}; five==direct ${followup.B_badArgsTriangle.fiveEqualsDirect}`);
  say(`  unknown-tool: direct code=${unknownDirect?.code} vs transparent code=${unknownTransparent?.code}`);
  await agent.close().catch(() => {});
  await direct.close().catch(() => {});
  await manager.close().catch(() => {});
  save();
}

// cleanup: reap the orphan this experiment family created in the MAIN run
{
  const strays = psSnapshot().filter((p) => p.cmd.includes("tmp-e2e-realism") && p.cmd.includes("mcp-server-filesystem"));
  followup.mainRunOrphansReaped = strays.map((p) => ({ pid: p.pid, cmd: p.cmd.slice(0, 110) }));
  for (const p of strays) { try { process.kill(p.pid, "SIGKILL"); } catch { /* gone */ } }
  // stale leaks from OTHER experiment families observed but left alone (evidence only)
  followup.unrelatedStaleServersObserved = psSnapshot()
    .filter((p) => /mcp-server-(filesystem|memory)|npm exec @modelcontextprotocol/.test(p.cmd) && !p.cmd.includes("tmp-e2e-realism"))
    .map((p) => ({ pid: p.pid, cmd: p.cmd.slice(0, 110) }));
}

followup.finishedAt = new Date().toISOString();
save();
fs.rmSync(TMP, { recursive: true, force: true });
say(`\nfollowup appended → ${OUT}`);
process.exit(0);
