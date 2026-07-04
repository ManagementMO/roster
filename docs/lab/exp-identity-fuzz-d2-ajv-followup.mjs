#!/usr/bin/env node
/**
 * identity-fuzz D2 — follow-ups: (i) why the live first suggestion was already
 * false ($id fragment?), (ii) live wire sequence with a clean $id, (iii) leak
 * rate for a TYPICAL small schema (not just the fat one).
 * Output: docs/lab/tmp-identity-fuzz/results-d2.json
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

const results = { experiment: "identity-fuzz-d2-ajv-followup", when: new Date().toISOString() };

const ajv = new Ajv2020({ strict: false });
function argsCompatible(inputSchema, args) {
  let compatible = false; let threw = null;
  try {
    if (inputSchema) {
      const { $schema: _dialect, ...schema } = inputSchema;
      compatible = ajv.validate(schema, args ?? {});
    }
  } catch (err) { compatible = false; threw = `${err?.constructor?.name}: ${err?.message}`.slice(0, 140); }
  return { compatible, threw };
}

// (i) $id WITH fragment — repeated
const fragSchema = { $id: "https://example.com/x.json#frag", type: "object", properties: { width: { type: "number" } }, required: ["width"] };
results.idWithFragment = [argsCompatible(fragSchema, { width: 1 }), argsCompatible(fragSchema, { width: 1 })];

// (ii) live wire with CLEAN $id
function makeBackend(physicalId, tools, behave) {
  const server = new Server({ name: physicalId, version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => behave(req));
  return server;
}
{
  const alpha = makeBackend("ALPHA", [
    { name: "resize_fail", description: "resize an image to a given width and height (flaky)", inputSchema: { type: "object", properties: { width: { type: "number" } } } },
  ], () => ({ isError: true, content: [{ type: "text", text: "Internal Server Error: image engine crashed" }] }));
  const beta = makeBackend("BETA", [
    { name: "resize_image", description: "resize an image to a given width and height", inputSchema: { $id: "https://example.com/clean-args.json", $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { width: { type: "number" }, height: { type: "number" } }, required: ["width"] } },
  ], (req) => ({ content: [{ type: "text", text: `BETA::${req.params.name}` }] }));

  const manager = new BackendManager(5000);
  for (const [name, srv] of [["alpha", alpha], ["beta", beta]]) {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await srv.connect(serverT);
    await manager.connect({ name, transport: clientT });
  }
  const store = new CoachStore(openCoachDb(":memory:"));
  const roster = new RosterServer({ mode: "five", manager, store, skills: [], sessionId: "identity-fuzz-d2" });
  roster.syncCapabilities();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await roster.server.connect(serverT);
  const client = new Client({ name: "lab", version: "0.0.0" });
  await client.connect(clientT);

  const draftRes = await client.callTool({ name: "draft", arguments: { need: "resize an image to a given width and height" } });
  const draft = JSON.parse(draftRes.content[0].text);
  const seq = [];
  for (let i = 0; i < 3; i++) {
    const res = await client.callTool({ name: "call", arguments: { tool: "alpha__resize_fail", args: { width: 100 }, draft_id: draft.draft_id } });
    const texts = (res.content ?? []).map((c) => c.text ?? "");
    const note = texts.map((t) => { try { return JSON.parse(t)?._roster; } catch { return null; } }).find(Boolean);
    seq.push(note?.suggested_alternate?.args_compatible ?? null);
  }
  results.liveCleanIdSequence = seq;
  await client.close();
  await manager.close();
}

// (iii) typical small schema leak rate, N=2000 (prod destructure pattern)
{
  const ajv2 = new Ajv2020({ strict: false });
  const small = { type: "object", properties: { width: { type: "number" }, height: { type: "number" }, quality: { type: "string", enum: ["low", "high"] } }, required: ["width"] };
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = Date.now();
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const { $schema: _d, ...schema } = small;
    ajv2.validate(schema, { width: 10 });
  }
  const elapsed = Date.now() - t0;
  const heap1 = process.memoryUsage().heapUsed;
  results.smallSchemaLeak = {
    N,
    totalMs: elapsed,
    msPerValidate: +(elapsed / N).toFixed(3),
    heapDeltaMB: +((heap1 - heap0) / 1048576).toFixed(1),
    ajvCacheSize: ajv2._cache?.size ?? null,
    kbPerValidate: +(((heap1 - heap0) / 1024) / N).toFixed(1),
  };
}

const outPath = path.join(repo, "docs/lab/tmp-identity-fuzz/results-d2.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
