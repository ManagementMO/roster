#!/usr/bin/env node
/**
 * Proxy-tax (b): per-call overhead of the roster middleman.
 * Baseline: MCP client -> real @modelcontextprotocol/server-filesystem (npx).
 * Vs: client -> REAL `roster serve` (packages/cli/dist/bin.js, spawned over
 * stdio exactly like a client would) -> same filesystem server, in BOTH
 * transparent mode and five mode. 120 timed read_text_file calls per
 * condition (10 warmup excluded), 1KiB payload; plus a 64KiB payload probe
 * and wire-draft latency in five mode. embeddings:"off" + ROSTER_NO_FETCH so
 * the tax measured is the router itself, not background model warmup.
 * Run: node docs/lab/exp-proxy-tax-b-call-overhead.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client, StdioClientTransport, statsMs, timeAsyncUs, machine, repo } from "./exp-proxy-tax-lib.mjs";
import { NEEDS } from "./needs.mjs";

const say = (s) => console.log(s);
const results = { experiment: "proxy-tax-b-call-overhead", ts: new Date().toISOString(), machine, conditions: {} };
say(`# proxy-tax (b) CALL_TOOL overhead — ${results.ts}`);

const scratch = path.join(repo, "docs/lab/tmp-proxy-tax");
const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "roster-proxytax-fs-")));
const smallFile = path.join(sandbox, "small.txt");
const bigFile = path.join(sandbox, "big.txt");
fs.writeFileSync(smallFile, "x".repeat(1024));
fs.writeFileSync(bigFile, "y".repeat(64 * 1024));

const bin = path.join(repo, "packages/cli/dist/bin.js");
const FS_ARGS = ["-y", "@modelcontextprotocol/server-filesystem", sandbox];

function makeHome(name, mode) {
  const home = path.join(scratch, `home-${name}`);
  const rosterHome = path.join(home, ".roster");
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(rosterHome, { recursive: true });
  fs.writeFileSync(
    path.join(rosterHome, "roster.json"),
    JSON.stringify({
      version: 1,
      mode,
      servers: { filesystem: { command: "npx", args: FS_ARGS, importedFrom: ["proxy-tax"] } },
      skillSources: [],
      telemetry: { enabled: false },
      embeddings: "off",
    }, null, 2),
  );
  return { home, rosterHome };
}

async function connectDirect() {
  const client = new Client({ name: "proxy-tax-direct", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: "npx", args: FS_ARGS, stderr: "ignore" }));
  return client;
}

async function connectRoster(name, mode, flag) {
  const { home, rosterHome } = makeHome(name, mode);
  const env = { ...process.env, ROSTER_TEST_HOME: home, ROSTER_HOME: rosterHome, ROSTER_NO_FETCH: "1" };
  const client = new Client({ name: `proxy-tax-${name}`, version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [bin, "serve", flag], env, stderr: "ignore" }),
  );
  return client;
}

const WARMUP = 10;
const ITERS = 120;
const BIG_ITERS = 40;

async function timeCalls(client, toolName, wrap, file, iters) {
  const args = { path: file };
  const call = () =>
    wrap === "five"
      ? client.callTool({ name: "call", arguments: { tool: toolName, args } })
      : client.callTool({ name: toolName, arguments: args });
  for (let i = 0; i < WARMUP; i++) {
    const r = await call();
    if (r.isError === true) throw new Error(`warmup call failed: ${JSON.stringify(r.content).slice(0, 300)}`);
  }
  const samples = [];
  for (let i = 0; i < iters; i++) {
    const { us, out } = await timeAsyncUs(call);
    if (out.isError === true) throw new Error("timed call failed");
    samples.push(us);
  }
  return statsMs(samples);
}

// serve child RSS (KB) — real process, found by its home path in argv
function rssOfServe() {
  try {
    const pid = execFileSync("pgrep", ["-f", "dist/bin.js serve"]).toString().trim().split("\n")[0];
    if (!pid || !/^\d+$/.test(pid)) return null;
    return +execFileSync("ps", ["-o", "rss=", "-p", pid]).toString().trim();
  } catch { return null; }
}

// ── condition 1: direct (run first; npx cache warms during connect) ────────
{
  const direct = await connectDirect();
  const tools = (await direct.listTools()).tools.length;
  results.conditions.direct1 = {
    tools,
    small: await timeCalls(direct, "read_text_file", "plain", smallFile, ITERS),
    big: await timeCalls(direct, "read_text_file", "plain", bigFile, BIG_ITERS),
  };
  say(`direct#1 (${tools} tools): small p50 ${results.conditions.direct1.small.p50_ms}ms p95 ${results.conditions.direct1.small.p95_ms}ms | 64KiB p50 ${results.conditions.direct1.big.p50_ms}ms`);
  await direct.close();
}

// ── condition 2: roster transparent ────────────────────────────────────────
{
  const roster = await connectRoster("transparent", "transparent", "--transparent");
  const tools = (await roster.listTools()).tools.length;
  const rssKb = rssOfServe();
  results.conditions.transparent = {
    tools,
    serveRssKb: rssKb,
    small: await timeCalls(roster, "filesystem__read_text_file", "plain", smallFile, ITERS),
    big: await timeCalls(roster, "filesystem__read_text_file", "plain", bigFile, BIG_ITERS),
  };
  say(`transparent (${tools} tools, serve RSS ${rssKb}KB): small p50 ${results.conditions.transparent.small.p50_ms}ms p95 ${results.conditions.transparent.small.p95_ms}ms | 64KiB p50 ${results.conditions.transparent.big.p50_ms}ms`);
  await roster.close();
}

// ── condition 3: roster five mode ──────────────────────────────────────────
{
  const roster = await connectRoster("five", "five", "--five");
  const tools = (await roster.listTools()).tools.map((t) => t.name).sort().join(",");
  const rssKb = rssOfServe();

  // wire-draft latency (lexical; embeddings off), cycling real needs
  const draftSamples = [];
  for (let i = 0; i < WARMUP; i++) await roster.callTool({ name: "draft", arguments: { need: NEEDS[i % NEEDS.length].need } });
  for (let i = 0; i < ITERS; i++) {
    const { us } = await timeAsyncUs(() =>
      roster.callTool({ name: "draft", arguments: { need: NEEDS[i % NEEDS.length].need } }),
    );
    draftSamples.push(us);
  }

  // draft once for attribution, then timed calls through `call`
  await roster.callTool({ name: "draft", arguments: { need: "read the contents of a text file from disk" } });
  results.conditions.five = {
    tools,
    serveRssKb: rssKb,
    draftWire: statsMs(draftSamples),
    small: await timeCalls(roster, "filesystem__read_text_file", "five", smallFile, ITERS),
    big: await timeCalls(roster, "filesystem__read_text_file", "five", bigFile, BIG_ITERS),
  };
  say(`five (tools: ${tools}; serve RSS ${rssKb}KB): draft p50 ${results.conditions.five.draftWire.p50_ms}ms | call small p50 ${results.conditions.five.small.p50_ms}ms p95 ${results.conditions.five.small.p95_ms}ms | 64KiB p50 ${results.conditions.five.big.p50_ms}ms`);
  await roster.close();
}

// ── condition 4: direct again (drift check) ────────────────────────────────
{
  const direct = await connectDirect();
  results.conditions.direct2 = {
    small: await timeCalls(direct, "read_text_file", "plain", smallFile, ITERS),
    big: await timeCalls(direct, "read_text_file", "plain", bigFile, BIG_ITERS),
  };
  say(`direct#2: small p50 ${results.conditions.direct2.small.p50_ms}ms p95 ${results.conditions.direct2.small.p95_ms}ms | 64KiB p50 ${results.conditions.direct2.big.p50_ms}ms`);
  await direct.close();
}

const d = results.conditions;
const base50 = Math.min(d.direct1.small.p50_ms, d.direct2.small.p50_ms);
const base95 = Math.min(d.direct1.small.p95_ms, d.direct2.small.p95_ms);
results.addedMs = {
  note: "added = condition minus best-of-two direct baselines",
  transparent_small: { p50: +(d.transparent.small.p50_ms - base50).toFixed(3), p95: +(d.transparent.small.p95_ms - base95).toFixed(3) },
  five_small: { p50: +(d.five.small.p50_ms - base50).toFixed(3), p95: +(d.five.small.p95_ms - base95).toFixed(3) },
  transparent_big: { p50: +(d.transparent.big.p50_ms - Math.min(d.direct1.big.p50_ms, d.direct2.big.p50_ms)).toFixed(3) },
  five_big: { p50: +(d.five.big.p50_ms - Math.min(d.direct1.big.p50_ms, d.direct2.big.p50_ms)).toFixed(3) },
};
say(`ADDED ms (small): transparent p50 +${results.addedMs.transparent_small.p50} p95 +${results.addedMs.transparent_small.p95} | five p50 +${results.addedMs.five_small.p50} p95 +${results.addedMs.five_small.p95}`);
say(`ADDED ms (64KiB): transparent p50 +${results.addedMs.transparent_big.p50} | five p50 +${results.addedMs.five_big.p50}`);

fs.rmSync(sandbox, { recursive: true, force: true });
const out = path.join(repo, "docs/lab/tmp-proxy-tax/results-b.json");
fs.writeFileSync(out, JSON.stringify(results, null, 2));
say(`\nwrote ${out}`);
