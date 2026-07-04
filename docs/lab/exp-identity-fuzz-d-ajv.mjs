#!/usr/bin/env node
/**
 * identity-fuzz D — the args_compatible Ajv path, unit + live.
 * Unit: Ajv2020({strict:false}) resolved from packages/router's own node_modules,
 * replicating rosterServer.sixthManSuggestion byte-for-byte (strip top-level
 * $schema, fresh destructured copy per call, try/catch → false).
 * Live: real RosterServer (five mode) + two real SDK backends over
 * InMemoryTransport + real CoachStore(:memory:) — reads args_compatible off the
 * wire, twice, to catch state poisoning. Plus transparent-mode cyclic-schema probe.
 * Output: docs/lab/tmp-identity-fuzz/results-d.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliReq = createRequire(path.join(repo, "packages/cli/package.json"));
const routerReq = createRequire(path.join(repo, "packages/router/package.json"));

const { BackendManager, RosterServer } = await import(cliReq.resolve("@rosterhq/router"));
const { CoachStore, openCoachDb } = await import(cliReq.resolve("@rosterhq/coach"));
const { Ajv2020 } = await import(routerReq.resolve("ajv/dist/2020.js"));
const { Server } = await import(routerReq.resolve("@modelcontextprotocol/sdk/server/index.js"));
const { Client } = await import(routerReq.resolve("@modelcontextprotocol/sdk/client/index.js"));
const { InMemoryTransport } = await import(routerReq.resolve("@modelcontextprotocol/sdk/inMemory.js"));
const { ListToolsRequestSchema, CallToolRequestSchema } = await import(
  routerReq.resolve("@modelcontextprotocol/sdk/types.js")
);

const results = { experiment: "identity-fuzz-d-ajv", when: new Date().toISOString() };

// ── exact rosterServer.ts logic, lifted verbatim ─────────────────────────────
const ajv = new Ajv2020({ strict: false });
function argsCompatible(inputSchema, args) {
  let compatible = false;
  let threw = null;
  const t0 = process.hrtime.bigint();
  try {
    if (inputSchema) {
      const { $schema: _dialect, ...schema } = inputSchema;
      compatible = ajv.validate(schema, args ?? {});
    }
  } catch (err) {
    compatible = false;
    threw = `${err?.constructor?.name}: ${err?.message}`.slice(0, 140);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { compatible, threw, ms: +ms.toFixed(3) };
}

// ── unit matrix ──────────────────────────────────────────────────────────────
const simpleProps = { properties: { width: { type: "number" }, height: { type: "number" } }, required: ["width"] };
const goodArgs = { width: 100, height: 50 };

const unit = [];
function U(name, schema, args, specSaysValid) {
  const r = argsCompatible(schema, args);
  unit.push({ case: name, specSaysValid, got: r.compatible, threw: r.threw, ms: r.ms, falseVerdict: specSaysValid !== r.compatible });
}

U("draft-07 $schema, valid args", { $schema: "http://json-schema.org/draft-07/schema#", type: "object", ...simpleProps }, goodArgs, true);
U("2020-12 $schema, valid args", { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", ...simpleProps }, goodArgs, true);
U("bogus $schema URI, valid args", { $schema: "https://bogus.example/not-a-dialect", type: "object", ...simpleProps }, goodArgs, true);
U("no $schema, INVALID args (missing required)", { type: "object", ...simpleProps }, { height: 9 }, false);
U(
  "draft-07 tuple items (array form), args valid per draft-07",
  { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { pair: { type: "array", items: [{ type: "string" }, { type: "number" }] } } },
  { pair: ["x", 1] },
  true,
);
U(
  "draft-04 boolean exclusiveMinimum, args valid per draft-04",
  { type: "object", properties: { n: { type: "number", minimum: 0, exclusiveMinimum: true } } },
  { n: 5 },
  true,
);
U(
  "draft-07 definitions + resolving $ref, valid args",
  { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { item: { $ref: "#/definitions/thing" } }, definitions: { thing: { type: "string" } } },
  { item: "ok" },
  true,
);
U(
  "unresolvable $ref, valid-shaped args",
  { type: "object", properties: { item: { $ref: "#/definitions/missing" } } },
  { item: "ok" },
  true,
);
U(
  "nested $schema inside property subschema, valid args",
  { type: "object", properties: { a: { $schema: "http://json-schema.org/draft-07/schema#", type: "string" } } },
  { a: "x" },
  true,
);
U("recursive $ref '#' (self), valid args", { type: "object", properties: { child: { $ref: "#" } } }, { child: {} }, true);

// the $id poisoning pair — SAME tool suggested twice (fresh destructured copy each time, as in prod)
const idSchema = { $id: "https://example.com/tool-args.json", type: "object", ...simpleProps };
const first = argsCompatible(idSchema, goodArgs);
const second = argsCompatible(idSchema, goodArgs);
const third = argsCompatible(idSchema, goodArgs);
results.idPoisoning = { first, second, third };

// two DIFFERENT tools sharing an $id (template-copied schemas)
const otherToolSameId = { $id: "https://example.com/tool-args.json", type: "object", properties: { url: { type: "string" } }, required: ["url"] };
results.crossToolSameId = argsCompatible(otherToolSameId, { url: "https://x" });

// pathological schemas from experiment C through the ajv path
let deep = { type: "string" };
for (let i = 0; i < 50; i++) deep = { type: "object", properties: { [`lvl${i}`]: deep } };
U("50-deep nesting, valid args", deep, { lvl49: {} }, true);

const props500 = {};
for (let i = 0; i < 500; i++) props500[`param_${i}`] = { type: "string" };
U("500 properties, valid args", { type: "object", properties: props500 }, { param_0: "x" }, true);

const enum1000 = Array.from({ length: 1000 }, (_, i) => `region-${i}`);
U("1000-entry enum, valid args", { type: "object", properties: { region: { type: "string", enum: enum1000 } } }, { region: "region-500" }, true);

function anyOfTower(depth) {
  if (depth === 0) return { type: "string" };
  return { anyOf: [anyOfTower(depth - 1), anyOfTower(depth - 1)] };
}
U("anyOf tower depth 12 (~123KB), string arg", { anyOf: [anyOfTower(11), anyOfTower(11)] }, "hello", true);

const cyc = { type: "object", properties: {} };
cyc.properties.self = cyc;
U("cyclic OBJECT graph (JS-level)", cyc, {}, true);

U("boolean schema true", true, goodArgs, true); // destructuring spread of true → {}
U("boolean schema false", false, goodArgs, false); // false is falsy → `if (entry.inputSchema)` skips → stays false
U("null schema", null, goodArgs, false); // falsy → skipped → false by default

results.unit = unit;

// ── ajv cache growth (fresh object per validate, as prod does) ──────────────
{
  const ajv2 = new Ajv2020({ strict: false });
  const baseSchema = { type: "object", properties: props500 }; // ~9KB, realistic fat tool
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = Date.now();
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const { $schema: _d, ...schema } = baseSchema; // fresh identity each call — prod pattern
    ajv2.validate(schema, goodArgs);
  }
  const elapsed = Date.now() - t0;
  const heap1 = process.memoryUsage().heapUsed;
  let cacheSize = null;
  for (const k of ["_cache", "cache"]) {
    const c = ajv2[k];
    if (c && typeof c.size === "number") { cacheSize = { key: k, size: c.size }; break; }
  }
  // baseline: same OBJECT reused (what a cached design would do)
  const ajv3 = new Ajv2020({ strict: false });
  const stable = { type: "object", properties: props500 };
  const t1 = Date.now();
  for (let i = 0; i < N; i++) ajv3.validate(stable, goodArgs);
  const elapsedStable = Date.now() - t1;
  results.cacheGrowth = {
    N,
    freshObjectPerCall: { totalMs: elapsed, msPerValidate: +(elapsed / N).toFixed(3), heapDeltaMB: +((heap1 - heap0) / 1048576).toFixed(1), ajvInternalCache: cacheSize },
    sameObjectReused: { totalMs: elapsedStable, msPerValidate: +(elapsedStable / N).toFixed(4) },
  };
}

// ── live e2e: RosterServer five mode, suggestion on the wire ────────────────
function makeBackend(physicalId, tools, behave) {
  const server = new Server({ name: physicalId, version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => behave(req));
  return server;
}

async function rig(mode, backends, skills = []) {
  const manager = new BackendManager(5000);
  for (const b of backends) {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await b.server.connect(serverT);
    await manager.connect({ name: b.name, transport: clientT });
  }
  const store = new CoachStore(openCoachDb(":memory:"));
  const roster = new RosterServer({ mode, manager, store, skills, sessionId: "identity-fuzz-d" });
  let syncError = null;
  try {
    roster.syncCapabilities();
  } catch (err) {
    syncError = `${err?.constructor?.name}: ${err?.message}`.slice(0, 200);
  }
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await roster.server.connect(serverT);
  const client = new Client({ name: "lab", version: "0.0.0" });
  await client.connect(clientT);
  return { client, manager, store, roster, syncError, close: async () => { await client.close(); await manager.close(); } };
}

{
  const alpha = makeBackend("ALPHA", [
    { name: "resize_fail", description: "resize an image to a given width and height (flaky)", inputSchema: { type: "object", properties: { width: { type: "number" } } } },
  ], () => ({ isError: true, content: [{ type: "text", text: "Internal Server Error: image engine crashed" }] }));
  const beta = makeBackend("BETA", [
    { name: "resize_image", description: "resize an image to a given width and height", inputSchema: { $id: "https://example.com/tool-args.json#live", $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { width: { type: "number" }, height: { type: "number" } }, required: ["width"] } },
  ], (req) => ({ content: [{ type: "text", text: `BETA::${req.params.name}` }] }));

  const r = await rig("five", [{ name: "alpha", server: alpha.server ?? alpha }, { name: "beta", server: beta.server ?? beta }].map((x) => ({ name: x.name, server: x.server })));

  const draftRes = await r.client.callTool({ name: "draft", arguments: { need: "resize an image to a given width and height" } });
  const draft = JSON.parse(draftRes.content[0].text);
  const starterIds = draft.starters.map((s) => s.id);

  async function failingCall() {
    const res = await r.client.callTool({
      name: "call",
      arguments: { tool: "alpha__resize_fail", args: { width: 100 }, draft_id: draft.draft_id },
    });
    const texts = (res.content ?? []).map((c) => c.text ?? "");
    const rosterNote = texts.map((t) => { try { return JSON.parse(t)?._roster; } catch { return null; } }).find(Boolean);
    return rosterNote?.suggested_alternate ?? null;
  }
  const s1 = await failingCall();
  const s2 = await failingCall();
  const s3 = await failingCall();

  // server-alive proof: draft again and call the healthy tool
  const draft2Res = await r.client.callTool({ name: "draft", arguments: { need: "resize an image again" } });
  const okCall = await r.client.callTool({ name: "call", arguments: { tool: "beta__resize_image", args: { width: 5 } } });

  results.liveFive = {
    starterIds,
    suggestion1: s1, suggestion2: s2, suggestion3: s3,
    argsCompatibleSequence: [s1?.args_compatible ?? null, s2?.args_compatible ?? null, s3?.args_compatible ?? null],
    serverAliveAfter: Boolean(draft2Res.content) && okCall.content?.[0]?.text === "BETA::resize_image",
    syncError: r.syncError,
  };
  await r.close();
}

// ── live transparent mode with a cyclic schema (embedding-hook reachability) ─
{
  const cursedEnum = ["a", "b"]; cursedEnum.push(cursedEnum);
  const gamma = makeBackend("GAMMA", [
    { name: "cursed", description: "tool with a cyclic enum in its schema", inputSchema: { type: "object", properties: { mode: { type: "string", enum: cursedEnum } } } },
    { name: "fine", description: "a perfectly healthy tool", inputSchema: { type: "object" } },
  ], (req) => ({ content: [{ type: "text", text: `GAMMA::${req.params.name}` }] }));

  let listError = null, callFineAfter = null, syncError = null, connectError = null;
  try {
    const r = await rig("transparent", [{ name: "gamma", server: gamma }]);
    syncError = r.syncError;
    try {
      const listed = await r.client.listTools();
      listError = `no error — listed ${listed.tools.length} tools`;
    } catch (err) {
      listError = `${err?.constructor?.name}: ${err?.message}`.slice(0, 200);
    }
    try {
      const res = await r.client.callTool({ name: "gamma__fine", arguments: {} });
      callFineAfter = res.content?.[0]?.text ?? null;
    } catch (err) {
      callFineAfter = `THREW ${err?.message}`.slice(0, 120);
    }
    await r.close();
  } catch (err) {
    connectError = `${err?.constructor?.name}: ${err?.message}`.slice(0, 200);
  }
  results.liveTransparentCyclic = { connectError, syncError, listError, callFineAfter };
}

const outPath = path.join(repo, "docs/lab/tmp-identity-fuzz/results-d.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

console.log("── unit matrix ──");
for (const u of results.unit)
  console.log(`${u.falseVerdict ? "FALSE-VERDICT" : "ok           "} ${u.case.padEnd(52)} spec=${u.specSaysValid} got=${u.got} ms=${u.ms}${u.threw ? " threw=" + u.threw : ""}`);
console.log("idPoisoning:", JSON.stringify(results.idPoisoning));
console.log("crossToolSameId:", JSON.stringify(results.crossToolSameId));
console.log("cacheGrowth:", JSON.stringify(results.cacheGrowth));
console.log("liveFive:", JSON.stringify(results.liveFive, null, 1));
console.log("liveTransparentCyclic:", JSON.stringify(results.liveTransparentCyclic));
console.log(`wrote ${outPath}`);
