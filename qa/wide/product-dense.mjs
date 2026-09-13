import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const [root, evidence] = process.argv.slice(2);
assert(root && evidence);
assert.notEqual(process.getuid(), 0);
const project = path.join(root, "project");
const home = path.join(root, "home");
const rosterHome = path.join(home, ".roster");
const runtime = path.join(rosterHome, "runtime");
const bin = path.join(project, "node_modules/@npmmo/roster/bundle/bin.js");
const env = { PATH: [path.dirname(process.execPath), "/usr/local/bin", "/usr/bin", "/bin"].join(":"), HOME: home, USER: os.userInfo().username, LOGNAME: os.userInfo().username, LANG: "C.UTF-8", ROSTER_HOME: rosterHome, ROSTER_TEST_HOME: home };
const roster = (...args) => execFileSync(process.execPath, [bin, ...args], { cwd: project, env, encoding: "utf8", timeout: 120_000 });
const require = createRequire(path.join(project, "package.json"));
const runtimeRequire = createRequire(path.join(runtime, "package.json"));
const status = roster("dense", "status");
let nativeAvailable = false;
let nativeError;
try {
  await import(pathToFileURL(runtimeRequire.resolve("@huggingface/transformers")).href);
  nativeAvailable = true;
} catch (error) {
  nativeError = { code: error.code, message: error.message };
}
const configPath = path.join(rosterHome, "roster.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.embeddings = "auto";
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
const clientFile = path.join(home, ".cursor", "mcp.json");
const hash = () => crypto.createHash("sha256").update(fs.readFileSync(clientFile)).digest("hex");
const original = hash();
roster("sync", "--client", "cursor");
const entry = JSON.parse(fs.readFileSync(clientFile, "utf8")).mcpServers.roster;
const { Client } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/index.js")).href);
const { StdioClientTransport } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href);
const Database = require("better-sqlite3");
const db = new Database(path.join(rosterHome, "coach.db"), { readonly: true, fileMustExist: true });
const vectors = () => db.prepare("SELECT count(*) AS count FROM vec").get().count;
const before = vectors();
const client = new Client({ name: "dense-product-probe", version: "1" });
const transport = new StdioClientTransport({ command: entry.command, args: [...entry.args, "--five"], env, cwd: project, stderr: "pipe" });
let stderr = "";
transport.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
const latencies = [];
let calls = 0;
try {
  await client.connect(transport, { timeout: 30_000 });
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), ["call", "draft"]);
  const deadline = Date.now() + (nativeAvailable ? 120_000 : 15_000);
  do {
    const start = performance.now();
    const drafted = await client.callTool({ name: "draft", arguments: { need: "Reply with a local pong" } });
    latencies.push(performance.now() - start);
    const payload = JSON.parse(drafted.content[0].text);
    assert(payload.starters.some((starter) => starter.id === "fixture__ping"));
    const called = await client.callTool({ name: "call", arguments: { tool: "fixture__ping", args: {}, draft_id: payload.draft_id } });
    assert.deepEqual(JSON.parse(called.content.find((item) => item.type === "text").text), { reply: "pong", uid: process.getuid() });
    calls++;
    if (calls >= 10 && (!nativeAvailable || vectors() > before)) break;
    await new Promise((resolve) => setTimeout(resolve, nativeAvailable ? 1000 : 100));
  } while (Date.now() < deadline);
  assert(calls >= 10);
} finally {
  await client.close();
  fs.writeFileSync(path.join(evidence, "product-stderr.log"), stderr);
}
const after = vectors();
db.close();
roster("eject", "--client", "cursor");
assert.equal(hash(), original);
if (nativeAvailable) assert(after > before, "native runtime imports but product did not create embedding vectors");
else assert.equal(after, before, "unusable native runtime unexpectedly wrote vectors");
const result = { uid: process.getuid(), node: process.version, arch: process.arch, status: status.trim(), reportsOn: /semantic search: ON/.test(status), nativeAvailable, nativeError, calls, maxDraftLatencyMs: Math.max(...latencies), vectorsBefore: before, vectorsAfter: after, lexicalFallbackWorks: !nativeAvailable && calls >= 10 && after === before, restored: true };
result.statusTruthful = !(result.reportsOn && !nativeAvailable);
fs.writeFileSync(path.join(evidence, "product-dense.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
process.exitCode = result.statusTruthful ? 0 : 1;
