#!/usr/bin/env node
/**
 * identity-fuzz E — the reserved-name rename + prune-protection mismatch with a
 * REAL production MCP server: npx -y @modelcontextprotocol/server-filesystem,
 * spawned as a real OS process over stdio, sandboxed to the lab tmp dir.
 * Proves the identity findings are transport-independent and reproduce against
 * real tool inventories (not just lab InMemory doubles).
 * Output: docs/lab/tmp-identity-fuzz/results-e.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliReq = createRequire(path.join(repo, "packages/cli/package.json"));
const { BackendManager } = await import(cliReq.resolve("@rosterhq/router"));
const { CoachStore, openCoachDb } = await import(cliReq.resolve("@rosterhq/coach"));
const { sanitizeSource } = await import(cliReq.resolve("@rosterhq/shared"));

const sandbox = path.join(repo, "docs/lab/tmp-identity-fuzz/fs-sandbox");
fs.mkdirSync(sandbox, { recursive: true });
fs.writeFileSync(path.join(sandbox, "probe.txt"), "identity-fuzz probe file\n");

const results = { experiment: "identity-fuzz-e-realserver", when: new Date().toISOString() };
const manager = new BackendManager(20000);

const t0 = Date.now();
// Configured name is the RESERVED word — exactly what a user naming their
// rosterfile entry "skill" would get.
const entries = await manager.connect({
  name: "skill",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", sandbox],
});
results.connectMs = Date.now() - t0;
results.toolCount = entries.length;
results.sampleIds = entries.slice(0, 6).map((e) => e.id);
results.allSourcesSeen = [...new Set(entries.map((e) => e.source))];
results.registryKeys = [...manager["backends"].keys()];

// real call through the renamed identity
const listTool = entries.find((e) => e.name === "list_directory") ?? entries[0];
const found = manager.lookup(listTool.id);
const call = await manager.call(found.backend, found.toolName, { path: sandbox });
results.realCall = {
  id: listTool.id,
  lookupBackend: found?.backend ?? null,
  outcomeEvidence: call.evidence,
  latencyMs: call.latencyMs,
  answeredWithProbe: JSON.stringify(call.result ?? {}).includes("probe.txt"),
};

// serve.ts prune bookkeeping on the next boot where this backend is DOWN:
const store = new CoachStore(openCoachDb(":memory:"));
store.upsertCapabilities(entries);
const storedSources = [...new Set(store.listCapabilities({ includeQuarantined: true }).map((e) => e.source))];
const unavailable = new Set([sanitizeSource("skill")]); // what serve.ts builds
const pruned = store.pruneMissing(new Set(), unavailable, { keepSeenSince: Date.now() + 60_000 });
results.pruneMismatch = {
  configuredName: "skill",
  serveProtects: [...unavailable],
  storedUnderSource: storedSources,
  prunedCount: pruned.length,
  ofStored: entries.length,
  prunedSample: pruned.slice(0, 5),
};

await manager.close();
const outPath = path.join(repo, "docs/lab/tmp-identity-fuzz/results-e.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
