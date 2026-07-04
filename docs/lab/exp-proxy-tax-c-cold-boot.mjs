#!/usr/bin/env node
/**
 * Proxy-tax (c): cold boot -> first draft with 133 tools, via the REAL
 * `roster serve` binary fronting a REAL 133-tool MCP stdio backend
 * (exp-proxy-tax-corpus-server.mjs). Embedding models are ALREADY in the
 * transformers.js cache (download time excluded by design — stated in notes).
 *
 * Measured per boot: spawn->MCP-initialize, listTools, first draft (lexical
 * by design; dense warms in background). One boot additionally waits for the
 * dense rung to become ready (vec backfill complete) — on this 24GiB machine
 * selectModelId() picks GEMMA, i.e. the real default path. A warm-DB reboot
 * then shows whether backfill re-embeds everything each session.
 * Run: node docs/lab/exp-proxy-tax-c-cold-boot.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client, StdioClientTransport, Database, machine, repo } from "./exp-proxy-tax-lib.mjs";

const say = (s) => console.log(s);
const results = { experiment: "proxy-tax-c-cold-boot", ts: new Date().toISOString(), machine, boots: [] };
say(`# proxy-tax (c) cold boot — ${results.ts}`);

const scratch = path.join(repo, "docs/lab/tmp-proxy-tax");
const bin = path.join(repo, "packages/cli/dist/bin.js");
const corpusServer = path.join(repo, "docs/lab/exp-proxy-tax-corpus-server.mjs");

function makeHome(name, embeddings) {
  const home = path.join(scratch, `home-${name}`);
  const rosterHome = path.join(home, ".roster");
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(rosterHome, { recursive: true });
  fs.writeFileSync(
    path.join(rosterHome, "roster.json"),
    JSON.stringify({
      version: 1,
      mode: "five",
      servers: { corpus: { command: process.execPath, args: [corpusServer], importedFrom: ["proxy-tax"] } },
      skillSources: [],
      telemetry: { enabled: false },
      embeddings,
    }, null, 2),
  );
  return { home, rosterHome };
}

const rssKb = (pid) => {
  try { return +execFileSync("ps", ["-o", "rss=", "-p", String(pid)]).toString().trim(); } catch { return null; }
};

const vecCount = (dbPath, sinceMs) => {
  try {
    const db = new Database(dbPath);
    const row = sinceMs
      ? db.prepare("SELECT COUNT(*) c FROM vec WHERE updated_at >= ?").get(sinceMs)
      : db.prepare("SELECT COUNT(*) c FROM vec").get();
    db.close();
    return row.c;
  } catch { return -1; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot({ name, embeddings, reuseHome, waitDense }) {
  const { home, rosterHome } = reuseHome ?? makeHome(name, embeddings);
  const env = { ...process.env, ROSTER_TEST_HOME: home, ROSTER_HOME: rosterHome };
  const client = new Client({ name: `proxy-tax-boot-${name}`, version: "0.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [bin, "serve"], env, stderr: "ignore" });

  const wallStart = Date.now();
  const t0 = process.hrtime.bigint();
  const ms = () => +(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1);

  await client.connect(transport);
  const connectMs = ms();
  const tools = (await client.listTools()).tools;
  const listMs = ms();
  const draftRes = await client.callTool({ name: "draft", arguments: { need: "read the contents of a text file from disk" } });
  const firstDraftMs = ms();
  const starters = JSON.parse(draftRes.content[0].text).starters.map((s) => s.id);
  const rec = {
    name, embeddings, reusedHome: !!reuseHome, tools: tools.map((t) => t.name).sort().join(","),
    connectMs, listMs, firstDraftMs, firstDraftStarters: starters.slice(0, 3),
    serveRssKbAfterDraft: rssKb(transport.pid),
  };

  if (waitDense) {
    const dbPath = path.join(rosterHome, "coach.db");
    const since = reuseHome ? wallStart : undefined; // warm DB: count only re-written vecs
    const deadline = Date.now() + 300_000;
    let count = 0;
    while (Date.now() < deadline) {
      count = vecCount(dbPath, since);
      if (count >= 133) break;
      await sleep(1000);
    }
    rec.denseReadySec = count >= 133 ? +((Date.now() - wallStart) / 1000).toFixed(1) : null;
    rec.vecsBackfilled = count;
    rec.serveRssKbAfterDense = rssKb(transport.pid);
    if (count >= 133) {
      // hybrid wire drafts now that the model is resident
      const samples = [];
      for (let i = 0; i < 3; i++) await client.callTool({ name: "draft", arguments: { need: "remember a fact about the user for later" } });
      for (let i = 0; i < 15; i++) {
        const t1 = process.hrtime.bigint();
        await client.callTool({ name: "draft", arguments: { need: i % 2 ? "remember a fact about the user for later" : "open a pull request with my changes" } });
        samples.push(Number(process.hrtime.bigint() - t1) / 1e6);
      }
      samples.sort((a, b) => a - b);
      rec.hybridDraftWireP50Ms = +samples[Math.floor(samples.length / 2)].toFixed(1);
      rec.hybridDraftWireMaxMs = +samples[samples.length - 1].toFixed(1);
    }
  }

  await client.close();
  results.boots.push(rec);
  say(`${name}: connect ${connectMs}ms, listTools ${listMs}ms, first draft ${firstDraftMs}ms, RSS ${rec.serveRssKbAfterDraft}KB${rec.denseReadySec ? `, dense-ready ${rec.denseReadySec}s, RSS-after-dense ${rec.serveRssKbAfterDense}KB, hybrid draft p50 ${rec.hybridDraftWireP50Ms}ms` : ""}`);
  return { home, rosterHome };
}

// RSS baseline: embeddings off (router only, 133 tools)
await boot({ name: "off-1", embeddings: "off" });

// four cold boots, embeddings auto (real default); first is OS-coldest
await boot({ name: "auto-1", embeddings: "auto" });
const homes2 = await boot({ name: "auto-2-densewait", embeddings: "auto", waitDense: true });
await boot({ name: "auto-3", embeddings: "auto" });
await boot({ name: "auto-4", embeddings: "auto" });

// warm-DB reboot of auto-2's home: does backfill re-embed all 133?
await boot({ name: "auto-5-warmdb", embeddings: "auto", reuseHome: homes2, waitDense: true });

const out = path.join(repo, "docs/lab/tmp-proxy-tax/results-c.json");
fs.writeFileSync(out, JSON.stringify(results, null, 2));
say(`\nwrote ${out}`);
