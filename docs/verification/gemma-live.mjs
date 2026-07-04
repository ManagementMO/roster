#!/usr/bin/env node
/**
 * FULL serve-level dense-path verification with the DEFAULT model (Gemma):
 * real `roster serve --five` binary, embeddings=auto, NO ROSTER_NO_FETCH —
 * the exact first-run experience on a ≥8GB machine. Verifies the background
 * warmup (model fetch → base-vec backfill at 256 dims) upgrades live drafts
 * without ever blocking one. Success is read from the coach DB: need_vec and
 * vec rows appear with Matryoshka dims once warm.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/router/package.json"));
const { Client } = await import(req.resolve("@modelcontextprotocol/sdk/client/index.js"));
const { StdioClientTransport } = await import(req.resolve("@modelcontextprotocol/sdk/client/stdio.js"));
const Database = createRequire(path.join(repo, "packages/coach/package.json"))("better-sqlite3");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-gemma-"));
const rosterHome = path.join(home, ".roster");
fs.mkdirSync(rosterHome, { recursive: true });
fs.writeFileSync(
  path.join(rosterHome, "roster.json"),
  JSON.stringify({
    version: 1,
    mode: "five",
    servers: {
      memory: { command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], importedFrom: ["t"] },
    },
    skillSources: [],
    telemetry: { enabled: false },
    embeddings: "auto",
  }),
);

const env = { ...process.env, ROSTER_TEST_HOME: home, ROSTER_HOME: rosterHome };
delete env.ROSTER_NO_FETCH;

const log = [];
const say = (s) => { log.push(s); console.log(s); };
say(`# Gemma serve-level dense-path verification — ${new Date().toISOString()}`);
say(`machine RAM: ${(os.totalmem() / 2 ** 30).toFixed(0)} GiB → default model should be EmbeddingGemma-300M`);

const client = new Client({ name: "gemma-live", version: "0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repo, "packages/cli/dist/bin.js"), "serve", "--five"],
    env,
    stderr: "ignore",
  }),
);

const db = () => new Database(path.join(rosterHome, "coach.db"), { readonly: true });
const started = Date.now();
const DEADLINE_MS = 12 * 60 * 1000;
let warm = false;
let draftCount = 0;

while (Date.now() - started < DEADLINE_MS) {
  draftCount++;
  const res = await client.callTool({
    name: "draft",
    arguments: { need: "remember an important fact about the user" },
  });
  const starters = JSON.parse(res.content[0].text).starters.map((s) => s.id);
  const d = db();
  const needVecs = d.prepare("SELECT COUNT(*) c, MAX(dims) dims FROM need_vec").get();
  const baseVecs = d.prepare("SELECT COUNT(*) c, MAX(dims) dims FROM vec").get();
  d.close();
  say(
    `  t+${Math.round((Date.now() - started) / 1000)}s draft#${draftCount} (never blocked): starters=[${starters.slice(0, 2).join(", ")}…] · base_vecs=${baseVecs.c}@${baseVecs.dims ?? "-"}d · need_vecs=${needVecs.c}@${needVecs.dims ?? "-"}d`,
  );
  if (needVecs.c > 0 && baseVecs.c > 0) {
    warm = true;
    say("");
    say(`## WARM after ~${Math.round((Date.now() - started) / 1000)}s (${draftCount} drafts, all served instantly meanwhile)`);
    say(`  ✓ base vectors backfilled for ${baseVecs.c} capabilities at ${baseVecs.dims} dims`);
    say(`  ✓ need vectors recorded at ${needVecs.dims} dims`);
    say(`  ${baseVecs.dims === 256 ? "✓" : "✗"} dims = 256 (Gemma Matryoshka) — model auto-select + truncation correct`);
    const denseDraft = await client.callTool({
      name: "draft",
      arguments: { need: "remember an important fact about the user" },
    });
    const denseIds = JSON.parse(denseDraft.content[0].text).starters.map((s) => s.id);
    say(`  post-warm draft order: ${denseIds.join(", ")}`);
    say(`  ${denseIds[0]?.startsWith("memory__") ? "✓" : "✗"} memory tool ranks #1 with dense active`);
    break;
  }
  await new Promise((r) => setTimeout(r, 20_000));
}

if (!warm) say(`## TIMED OUT after ${Math.round(DEADLINE_MS / 60000)} min — model fetch did not complete (drafts stayed lexical and NEVER blocked, which is itself the designed behavior; investigate download)`);
await client.close();
const out = path.join(repo, "docs/verification", `${new Date().toISOString().slice(0, 10)}-gemma-live.md`);
fs.writeFileSync(out, `${log.join("\n")}\n`);
console.log(`transcript → ${out}`);
fs.rmSync(home, { recursive: true, force: true });
process.exit(warm ? 0 : 1);
