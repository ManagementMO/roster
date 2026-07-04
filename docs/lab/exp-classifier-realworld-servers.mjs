#!/usr/bin/env node
/**
 * exp-classifier-realworld part (a): force REAL failures from REAL MCP servers
 * over real stdio, capture the exact wire shape (raw SDK client), then run the
 * identical call through @rosterhq/router BackendManager (exactly as
 * rosterServer does, outputSchema included) and classify with the real
 * @rosterhq/coach classifyOutcome. No mocks anywhere.
 *
 * Scenarios: filesystem server (nonexistent read / trigger-word filename /
 * write outside sandbox / chmod-000 read), memory server (malformed +
 * missing args, unknown tool), lab fail-server (kill mid-call, hang → call
 * timeout, output-schema drift ×3, success control), hanging non-MCP process
 * (connect timeout, bounded + unbounded), nonexistent command (spawn failure).
 *
 * Output: docs/lab/tmp-classifier-realworld/out-scenarios.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { BackendManager } = await import(req.resolve("@rosterhq/router"));
const { classifyOutcome, isAttributable } = await import(req.resolve("@rosterhq/coach"));
const { Client } = await import(req.resolve("@modelcontextprotocol/sdk/client/index.js"));
const { StdioClientTransport } = await import(
  req.resolve("@modelcontextprotocol/sdk/client/stdio.js"),
);

const TMP = path.join(repo, "docs/lab/tmp-classifier-realworld");
const SANDBOX = path.join(TMP, "sandbox");
fs.mkdirSync(SANDBOX, { recursive: true });
const FAILSERVER = path.join(repo, "docs/lab/exp-classifier-realworld-failserver.mjs");
const OUTSIDE = path.join(TMP, "outside-root"); // exists but NOT under the fs server's allowed root
fs.mkdirSync(OUTSIDE, { recursive: true });

const rows = [];
const say = (s) => console.log(s);

function errShape(e) {
  return {
    ctor: e?.constructor?.name ?? null,
    name: e?.name ?? null,
    code: typeof e?.code === "number" || typeof e?.code === "string" ? e.code : null,
    message: String(e?.message ?? "").slice(0, 400),
  };
}
function resultShape(r) {
  if (!r || typeof r !== "object") return r ?? null;
  const content = Array.isArray(r.content)
    ? r.content.map((c) => ({
        type: c?.type,
        text: typeof c?.text === "string" ? c.text.slice(0, 400) : undefined,
      }))
    : undefined;
  return {
    isError: r.isError === true,
    hasStructuredContent: r.structuredContent !== undefined,
    structuredContent: r.structuredContent,
    content,
  };
}

/** Raw SDK client capture — the literal wire outcome before ROSTER touches it. */
async function rawCapture(command, args, toolName, toolArgs, timeoutMs = 10_000) {
  const client = new Client({ name: "lab-raw", version: "0" });
  const transport = new StdioClientTransport({ command, args, stderr: "ignore" });
  try {
    await client.connect(transport);
    await client.listTools({}); // mirrors BackendManager: primes SDK output-schema validators
    const result = await client.callTool(
      { name: toolName, arguments: toolArgs },
      undefined,
      { timeout: timeoutMs },
    );
    return { via: "result", result: resultShape(result) };
  } catch (e) {
    return { via: "throw", error: errShape(e) };
  } finally {
    await client.close().catch(() => {});
  }
}

/** Run through the REAL router path: BackendManager.call → evidence → classifyOutcome. */
function classifyRow(id, scenario, wire, outcome, specIntent) {
  const cls = classifyOutcome(outcome.evidence);
  const row = {
    id,
    scenario,
    wire,
    evidence: outcome.evidence,
    latencyMs: outcome.latencyMs,
    class: cls,
    attributable: isAttributable(cls),
    specIntent,
    verdict: specIntent.expectedClass === cls ? "MATCHES-SPEC" : "DIVERGES-FROM-SPEC",
  };
  rows.push(row);
  say(
    `  [${row.verdict === "MATCHES-SPEC" ? "ok" : "!!"}] ${id}: class=${cls} (spec intends ${specIntent.expectedClass}) evidence=${JSON.stringify(outcome.evidence).slice(0, 160)}`,
  );
  return row;
}

const t0 = Date.now();
say("# classifier-realworld part (a) — real servers, real failures");

// ── S8b (started FIRST, runs in the background): unbounded BackendManager.connect
//     to a live process that is not an MCP server. Measures how long the real
//     router-side connect() blocks before failing (SDK default initialize timeout).
const hangMgr = new BackendManager();
const hangStart = Date.now();
const hangPromise = hangMgr
  .connect({ name: "hangsrv", command: "node", args: ["-e", "setInterval(()=>{},1e6)"] })
  .then(
    () => ({ settled: "resolved", ms: Date.now() - hangStart }),
    (e) => ({ settled: "rejected", ms: Date.now() - hangStart, error: errShape(e) }),
  );

// ── filesystem server scenarios ─────────────────────────────────────────────
say("\n## filesystem server (npx -y @modelcontextprotocol/server-filesystem)");
const fsMgr = new BackendManager();
const fsTools = await fsMgr.connect({
  name: "fs",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", SANDBOX],
});
const fsBackend = fsTools[0].source;
const readTool = fsTools.find((t) => t.name === "read_text_file") ?? fsTools.find((t) => t.name === "read_file");
const writeTool = fsTools.find((t) => t.name === "write_file");
say(`  connected: ${fsTools.length} tools; read=${readTool?.name} write=${writeTool?.name}`);

// S1: read a nonexistent path
{
  const args = { path: path.join(SANDBOX, "does-not-exist.txt") };
  const wire = await rawCapture("npx", ["-y", "@modelcontextprotocol/server-filesystem", SANDBOX], readTool.name, args);
  const outcome = await fsMgr.call(fsBackend, readTool.name, args, readTool.outputSchema);
  classifyRow("S1-fs-read-nonexistent", "fs: read nonexistent path", wire, outcome, {
    expectedClass: "tool_fail:other",
    why: "not-found has no ToolFailKind; handoff 6.2 rule 2 catch-all",
  });
}

// S1b: read a nonexistent path whose FILENAME contains a classifier trigger word
{
  const args = { path: path.join(SANDBOX, "auth-tokens.txt") };
  const outcome = await fsMgr.call(fsBackend, readTool.name, args, readTool.outputSchema);
  classifyRow(
    "S1b-fs-read-nonexistent-token-filename",
    "fs: read nonexistent file named auth-tokens.txt (trigger word inside path echoed into error text)",
    { via: "manager-only", note: "same wire as S1, different filename" },
    outcome,
    {
      expectedClass: "tool_fail:other",
      why: "still a not-found; the filename should not change the kind",
    },
  );
}

// S2: write outside the sandbox root
{
  const args = { path: path.join(OUTSIDE, "escape.txt"), content: "should be denied" };
  const wire = await rawCapture("npx", ["-y", "@modelcontextprotocol/server-filesystem", SANDBOX], writeTool.name, args);
  const outcome = await fsMgr.call(fsBackend, writeTool.name, args, writeTool.outputSchema);
  classifyRow("S2-fs-write-outside-sandbox", "fs: write to path outside allowed root", wire, outcome, {
    expectedClass: "tool_fail:auth",
    why: "permission/access-denied family; classifier comment says auth covers permission-denied",
  });
}

// S3: chmod-000 file read (real EACCES from the OS)
{
  const locked = path.join(SANDBOX, "locked.txt");
  fs.writeFileSync(locked, "secret");
  fs.chmodSync(locked, 0o000);
  const args = { path: locked };
  const wire = await rawCapture("npx", ["-y", "@modelcontextprotocol/server-filesystem", SANDBOX], readTool.name, args);
  const outcome = await fsMgr.call(fsBackend, readTool.name, args, readTool.outputSchema);
  fs.chmodSync(locked, 0o644);
  classifyRow("S3-fs-chmod000-read", "fs: read chmod-000 file (EACCES)", wire, outcome, {
    expectedClass: "tool_fail:auth",
    why: "EACCES permission denied → auth per classifier's own auth-covers-permission rule",
  });
}
await fsMgr.close();

// ── memory server scenarios ─────────────────────────────────────────────────
say("\n## memory server (npx -y @modelcontextprotocol/server-memory)");
const memEnv = { MEMORY_FILE_PATH: path.join(TMP, "memory.json") };
const memMgr = new BackendManager();
const memTools = await memMgr.connect({
  name: "memory",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-memory"],
  env: { ...process.env, ...memEnv },
});
const memBackend = memTools[0].source;
say(`  connected: ${memTools.length} tools`);

// S4: malformed args (entities is a string, not an array)
{
  const args = { entities: "banana" };
  const wire = await rawCapture("npx", ["-y", "@modelcontextprotocol/server-memory"], "create_entities", args);
  const outcome = await memMgr.call(memBackend, "create_entities", args, undefined);
  classifyRow("S4-memory-malformed-args", "memory: create_entities with wrong-shape args", wire, outcome, {
    expectedClass: "AGENT-FAULT(see methodology-8)",
    why: "methodology 8: caller's bad args must not punish the tool; whatever class lands here is attributable and will",
  });
}

// S4b: missing required args entirely
{
  const args = {};
  const outcome = await memMgr.call(memBackend, "create_entities", args, undefined);
  classifyRow(
    "S4b-memory-missing-args",
    "memory: create_entities with {} (required key absent)",
    { via: "manager-only" },
    outcome,
    {
      expectedClass: "AGENT-FAULT(see methodology-8)",
      why: "same as S4",
    },
  );
}

// S5: unknown tool name on a live backend
{
  const wire = await rawCapture("npx", ["-y", "@modelcontextprotocol/server-memory"], "tool_that_does_not_exist", {});
  const outcome = await memMgr.call(memBackend, "tool_that_does_not_exist", {}, undefined);
  classifyRow("S5-memory-unknown-tool", "memory: call a tool the server does not have", wire, outcome, {
    expectedClass: "hard_fail:protocol",
    why: "JSON-RPC method/tool-not-found is a protocol error per handoff 6.2 rule 1",
  });
}
await memMgr.close();

// ── lab fail-server scenarios (repo's own SDK, exact payloads) ──────────────
say("\n## lab fail-server (real stdio server built with the repo's @modelcontextprotocol/sdk)");
const labSpawn = ["node", [FAILSERVER]];

// S6: kill the server process mid-call (real transport death)
{
  const wire = await rawCapture(...labSpawn, "die", {});
  const dieMgr = new BackendManager();
  const dieTools = await dieMgr.connect({ name: "lab", command: labSpawn[0], args: labSpawn[1] });
  const outcome = await dieMgr.call(dieTools[0].source, "die", {}, undefined);
  await dieMgr.close().catch(() => {});
  classifyRow("S6-kill-mid-call", "lab: server process exits while the call is pending", wire, outcome, {
    expectedClass: "hard_fail:transport",
    why: "handoff 6.2 rule 1 + CallEvidence doc: 'connection died / stream broke' is transportError",
  });
}

// Shared lab connection for the rest
const labMgr = new BackendManager(2500); // short real call timeout for the hang scenario
const labTools = await labMgr.connect({ name: "lab", command: labSpawn[0], args: labSpawn[1] });
const labBackend = labTools[0].source;
const entry = (n) => labTools.find((t) => t.name === n);

// S7: hang during call → client-side deadline
{
  const wire = await rawCapture(...labSpawn, "hang", {}, 2500);
  const outcome = await labMgr.call(labBackend, "hang", {}, undefined);
  classifyRow("S7-hang-call-timeout", "lab: tool never responds; router deadline 2500ms", wire, outcome, {
    expectedClass: "tool_fail:timeout",
    why: "call exceeded its deadline → timedOut evidence",
  });
}

// S10a-c: output schema drift, exactly as rosterServer calls it (outputSchema passed)
for (const [id, tool] of [
  ["S10a-drift-missing-key", "drift_missing_key"],
  ["S10b-drift-no-structured", "drift_no_structured"],
  ["S10c-drift-wrong-type", "drift_wrong_type"],
]) {
  const e = entry(tool);
  const wire = await rawCapture(...labSpawn, tool, {});
  const outcome = await labMgr.call(labBackend, tool, {}, e.outputSchema);
  classifyRow(id, `lab: ${tool} — declared outputSchema violated by real result`, wire, outcome, {
    expectedClass: "schema_drift_suspect",
    why: "handoff 6.2 rule 3: output violates declared output schema → schema_drift_suspect + drift event",
  });
}

// S10d: same drift call but WITHOUT passing outputSchema to BackendManager.call —
// isolates whether the SDK client itself intervenes before violatesOutputSchema.
{
  const outcome = await labMgr.call(labBackend, "drift_missing_key", {}, undefined);
  classifyRow(
    "S10d-drift-schema-not-passed",
    "lab: drift_missing_key with outputSchema arg omitted (isolation probe)",
    { via: "manager-only" },
    outcome,
    {
      expectedClass: "schema_drift_suspect",
      why: "if drift detection lived in backends.ts alone this would need the schema; shows where the throw actually happens",
    },
  );
}

// S11: success control
{
  const outcome = await labMgr.call(labBackend, "ok", {}, undefined);
  classifyRow("S11-success-control", "lab: normal success", { via: "manager-only" }, outcome, {
    expectedClass: "success",
    why: "control",
  });
}
await labMgr.close();

// ── connect-path scenarios ──────────────────────────────────────────────────
say("\n## connect path (no MCP handshake / no such command)");

// S8: hanging non-MCP process, BOUNDED raw connect to capture the shape fast
{
  const client = new Client({ name: "lab-raw", version: "0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["-e", "setInterval(()=>{},1e6)"],
    stderr: "ignore",
  });
  let wire;
  const t = Date.now();
  try {
    await client.connect(transport, { timeout: 3000 });
    wire = { via: "connected?!", ms: Date.now() - t };
  } catch (e) {
    wire = { via: "throw", ms: Date.now() - t, error: errShape(e) };
  }
  await client.close().catch(() => {});
  rows.push({
    id: "S8-hanging-server-bounded-connect",
    scenario: "connect to live process that never speaks MCP, explicit 3s timeout",
    wire,
    evidence: null,
    class: "NO-OUTCOME-ROW (connect-path failure, classifier never runs)",
    attributable: null,
    specIntent: { expectedClass: "n/a", why: "connect failures precede any call; charter asks what actually happens" },
    verdict: "OBSERVATION",
  });
  say(`  [obs] S8 bounded connect: ${JSON.stringify(wire).slice(0, 200)}`);
}

// S9: command that does not exist
{
  const badMgr = new BackendManager();
  const t = Date.now();
  let wire;
  try {
    await badMgr.connect({ name: "ghost", command: "roster-lab-no-such-cmd-xyz", args: [] });
    wire = { via: "connected?!" };
  } catch (e) {
    wire = { via: "throw", ms: Date.now() - t, error: errShape(e) };
  }
  rows.push({
    id: "S9-spawn-nonexistent-command",
    scenario: "BackendManager.connect with a command that does not exist",
    wire,
    evidence: null,
    class: "NO-OUTCOME-ROW (connect-path failure, classifier never runs)",
    attributable: null,
    specIntent: { expectedClass: "n/a", why: "spawn failure surfaces before any call" },
    verdict: "OBSERVATION",
  });
  say(`  [obs] S9 spawn missing cmd: ${JSON.stringify(wire).slice(0, 200)}`);
}

// S8b: now await the unbounded connect started at the top (cap 75s)
{
  const capped = await Promise.race([
    hangPromise,
    new Promise((r) => setTimeout(() => r({ settled: "still-pending-at-cap", ms: 75_000 }), 75_000)),
  ]);
  rows.push({
    id: "S8b-hanging-server-unbounded-connect",
    scenario: "BackendManager.connect (production path, no timeout arg) to a live non-MCP process",
    wire: capped,
    evidence: null,
    class: "NO-OUTCOME-ROW (connect-path failure, classifier never runs)",
    attributable: null,
    specIntent: {
      expectedClass: "n/a",
      why: "measures how long the real router-side connect blocks (SDK default initialize timeout)",
    },
    verdict: "OBSERVATION",
  });
  say(`  [obs] S8b unbounded connect settled: ${JSON.stringify(capped).slice(0, 200)}`);
}

const out = {
  experiment: "classifier-realworld part (a) — real wire shapes vs classifyOutcome",
  when: new Date().toISOString(),
  node: process.version,
  wallMs: Date.now() - t0,
  rows,
};
fs.writeFileSync(path.join(TMP, "out-scenarios.json"), JSON.stringify(out, null, 2));
say(`\nwrote ${path.join(TMP, "out-scenarios.json")} (${rows.length} rows, ${out.wallMs}ms)`);
process.exit(0);
