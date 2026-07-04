#!/usr/bin/env node
/**
 * identity-fuzz B — BackendManager registry under colliding config names.
 * REAL MCP servers (@modelcontextprotocol/sdk Server) over InMemoryTransport
 * (the router's own TransportBackendConfig hook), real BackendManager from
 * built @rosterhq/router, real CoachStore on a real in-memory SQLite db.
 * Output: docs/lab/tmp-identity-fuzz/results-b.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliReq = createRequire(path.join(repo, "packages/cli/package.json"));
const routerReq = createRequire(path.join(repo, "packages/router/package.json"));

const { BackendManager } = await import(cliReq.resolve("@rosterhq/router"));
const { CoachStore, openCoachDb } = await import(cliReq.resolve("@rosterhq/coach"));
const { sanitizeSource } = await import(cliReq.resolve("@rosterhq/shared"));
const { Server } = await import(routerReq.resolve("@modelcontextprotocol/sdk/server/index.js"));
const { InMemoryTransport } = await import(routerReq.resolve("@modelcontextprotocol/sdk/inMemory.js"));
const { ListToolsRequestSchema, CallToolRequestSchema } = await import(
  routerReq.resolve("@modelcontextprotocol/sdk/types.js")
);

/** Real MCP server whose tools answer with a physical-identity marker. */
function makeBackend(physicalId, toolNames) {
  const server = new Server({ name: physicalId, version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolNames.map((name) => ({
      name,
      description: `tool ${name} of physical server ${physicalId}`,
      inputSchema: { type: "object", properties: { q: { type: "string" } } },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => ({
    content: [{ type: "text", text: `${physicalId}::${req.params.name}` }],
  }));
  return server;
}

async function connectBackend(manager, configName, physicalId, toolNames) {
  const server = makeBackend(physicalId, toolNames);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const entries = await manager.connect({ name: configName, transport: clientT });
  return { configName, physicalId, entries };
}

const results = { experiment: "identity-fuzz-b-registry", when: new Date().toISOString() };

// ── Phase 1: sanitization/suffix/reserved-word registry behavior ────────────
{
  const manager = new BackendManager(5000);
  const plan = [
    { config: "my-server", phys: "P1", tools: ["run"] },
    { config: "my_server", phys: "P2", tools: ["run"] },
    { config: "MY SERVER", phys: "P3", tools: ["run"] },
    { config: "my server", phys: "P4", tools: ["run"] },
    { config: "skill", phys: "P5", tools: ["lookup_docs"] },
    { config: "skill-server", phys: "P6", tools: ["lookup_docs"] },
    { config: "a_", phys: "P7", tools: ["b"] },
    { config: "a", phys: "P8", tools: ["_b"] },
  ];
  const connected = [];
  for (const p of plan) connected.push(await connectBackend(manager, p.config, p.phys, p.tools));

  const registryKeys = [...manager["backends"].keys()]; // TS-private, runtime-visible; read-only reflection
  const all = manager.allTools();
  const idCounts = new Map();
  for (const e of all) idCounts.set(e.id, (idCounts.get(e.id) ?? 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, c]) => c > 1).map(([id, c]) => ({ id, count: c }));

  // Route every entry each backend BELIEVES it owns; check the marker that answers.
  const routing = [];
  for (const c of connected) {
    for (const e of c.entries) {
      const found = manager.lookup(e.id);
      let got = null;
      if (found) {
        const outcome = await manager.call(found.backend, found.toolName, {});
        got = outcome.result?.content?.[0]?.text ?? null;
      }
      const expected = `${c.physicalId}::${e.name}`;
      routing.push({
        config: c.configName, physical: c.physicalId, id: e.id,
        lookupBackend: found?.backend ?? null, answered: got, expected,
        misrouted: got !== expected,
      });
    }
  }
  results.phase1 = {
    plan: plan.map((p) => ({ config: p.config, physical: p.phys })),
    registryKeys,
    perConfigIds: connected.map((c) => ({ config: c.configName, ids: c.entries.map((e) => e.id) })),
    totalTools: all.length,
    distinctIds: idCounts.size,
    duplicateIds,
    routing,
    misrouteCount: routing.filter((r) => r.misrouted).length,
  };
  await manager.close();
}

// ── Phase 2: boot-order identity swap for post-sanitization duplicate names ──
{
  // Boot 1: config order ["my server" (physical A), "my-server" (physical B)]
  const m1 = new BackendManager(5000);
  const b1a = await connectBackend(m1, "my server", "PHYS-A", ["run"]);
  const b1b = await connectBackend(m1, "my-server", "PHYS-B", ["run"]);
  const boot1 = [];
  for (const e of m1.allTools()) {
    const found = m1.lookup(e.id);
    const outcome = await m1.call(found.backend, found.toolName, {});
    boot1.push({ id: e.id, backendKey: found.backend, answeredBy: outcome.result?.content?.[0]?.text });
  }
  await m1.close();

  // Boot 2: same config, but "my server" (PHYS-A) fails to connect (serve.ts catch path).
  const m2 = new BackendManager(5000);
  const b2b = await connectBackend(m2, "my-server", "PHYS-B", ["run"]);
  const boot2 = [];
  for (const e of m2.allTools()) {
    const found = m2.lookup(e.id);
    const outcome = await m2.call(found.backend, found.toolName, {});
    boot2.push({ id: e.id, backendKey: found.backend, answeredBy: outcome.result?.content?.[0]?.text });
  }
  await m2.close();

  const swap = boot1
    .map((r1) => {
      const r2 = boot2.find((r) => r.id === r1.id);
      return r2 && r2.answeredBy !== r1.answeredBy
        ? { id: r1.id, boot1: r1.answeredBy, boot2: r2.answeredBy }
        : null;
    })
    .filter(Boolean);
  results.phase2 = { boot1, boot2, identitySwaps: swap };
}

// ── Phase 3: serve.ts unavailable-name vs stored-source mismatch on prune ───
{
  // Boot 1: three configured servers; "skill" gets renamed, "my server" gets suffixed.
  const db = openCoachDb(":memory:");
  const store = new CoachStore(db);
  const m = new BackendManager(5000);
  await connectBackend(m, "skill", "P-SKILL", ["lookup_docs"]);
  await connectBackend(m, "my server", "P-MSA", ["run"]);
  await connectBackend(m, "my-server", "P-MSB", ["run"]);
  const entries = m.allTools();
  store.upsertCapabilities(entries);
  const before = store.listCapabilities({ includeQuarantined: true }).map((e) => ({ id: e.id, source: e.source }));
  await m.close();

  // Boot 2 (simulated): ALL three backends fail to connect. serve.ts builds
  // unavailable = sanitizeSource(configName) for each — exactly this:
  const unavailable = new Set(["skill", "my server", "my-server"].map((n) => sanitizeSource(n)));
  const pruned = store.pruneMissing(new Set(), unavailable, { keepSeenSince: Date.now() + 60_000 });
  const after = store.listCapabilities({ includeQuarantined: true }).map((e) => ({ id: e.id, source: e.source }));

  // Counterfactual: protecting the names the capabilities were ACTUALLY stored under.
  const db2 = openCoachDb(":memory:");
  const store2 = new CoachStore(db2);
  store2.upsertCapabilities(entries);
  const prunedCF = store2.pruneMissing(
    new Set(),
    new Set(entries.map((e) => e.source)),
    { keepSeenSince: Date.now() + 60_000 },
  );
  results.phase3 = {
    stderrClaim: 'serve.ts prints: roster: backend "<name>" failed to connect (its learned state is preserved)',
    storedBefore: before,
    unavailableSetServeBuilds: [...unavailable],
    prunedDespiteProtection: pruned,
    survivingAfter: after,
    counterfactualProtectingActualSources: { pruned: prunedCF },
  };
}

const outPath = path.join(repo, "docs/lab/tmp-identity-fuzz/results-b.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log("phase1 keys:", results.phase1.registryKeys.join(", "));
console.log("phase1 duplicates:", JSON.stringify(results.phase1.duplicateIds), "misroutes:", results.phase1.misrouteCount);
for (const r of results.phase1.routing.filter((x) => x.misrouted)) console.log("  MISROUTE", JSON.stringify(r));
console.log("phase2 identity swaps:", JSON.stringify(results.phase2.identitySwaps));
console.log("phase3 pruned despite 'preserved' promise:", JSON.stringify(results.phase3.prunedDespiteProtection));
console.log("phase3 counterfactual pruned:", JSON.stringify(results.phase3.counterfactualProtectingActualSources.pruned));
console.log(`wrote ${outPath}`);
