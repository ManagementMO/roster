#!/usr/bin/env node
/**
 * M0-grade end-to-end verification: the REAL `roster` binary fronting REAL
 * official MCP servers, driven over real stdio. Produces a transcript that
 * docs/verification/*.md records. Run from repo root: node docs/verification/e2e.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(path.join(repo, "packages/coach/package.json"));
const Database = require_("better-sqlite3");
const sdkRequire = createRequire(path.join(repo, "packages/router/package.json"));
const { Client } = await import(
  sdkRequire.resolve("@modelcontextprotocol/sdk/client/index.js")
);
const { StdioClientTransport } = await import(
  sdkRequire.resolve("@modelcontextprotocol/sdk/client/stdio.js")
);

const log = [];
const say = (s) => {
  log.push(s);
  console.log(s);
};
const assert = (cond, label) => {
  if (!cond) {
    say(`  ✗ FAIL: ${label}`);
    throw new Error(`E2E assertion failed: ${label}`);
  }
  say(`  ✓ ${label}`);
};

const home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-e2e-home-"));
// realpath: the filesystem server resolves symlinks when validating allowed
// dirs (macOS /var → /private/var), so hand it the resolved form up front.
const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "roster-e2e-fs-")));
const rosterHome = path.join(home, ".roster");
fs.mkdirSync(rosterHome, { recursive: true });
fs.writeFileSync(
  path.join(rosterHome, "roster.json"),
  JSON.stringify(
    {
      version: 1,
      mode: "transparent",
      servers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", sandbox],
          importedFrom: ["e2e"],
        },
        memory: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-memory"],
          importedFrom: ["e2e"],
        },
      },
      skillSources: [],
      telemetry: { enabled: false },
      embeddings: "off",
    },
    null,
    2,
  ),
);

const env = {
  ...process.env,
  ROSTER_TEST_HOME: home,
  ROSTER_HOME: rosterHome,
  ROSTER_NO_FETCH: "1",
};
const bin = path.join(repo, "packages/cli/dist/bin.js");

async function connect(args) {
  const client = new Client({ name: "e2e", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [bin, ...args], env, stderr: "ignore" }),
  );
  return client;
}

say(`# Roster M0 end-to-end verification — ${new Date().toISOString()}`);
say(`repo: ${repo}`);
say(`node: ${process.version} · platform: ${os.platform()}/${os.arch()}`);
say("");

// ── Phase A: parity — direct server vs through Roster ──────────────────────
say("## Phase A — transparent parity vs direct connection");
const direct = new Client({ name: "e2e-direct", version: "0.0.0" });
await direct.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", sandbox],
    stderr: "ignore",
  }),
);
const directTools = (await direct.listTools()).tools.map((t) => t.name).sort();
say(`  direct filesystem tools (${directTools.length}): ${directTools.join(", ")}`);

const roster = await connect(["serve"]);
const rosterTools = (await roster.listTools()).tools.map((t) => t.name).sort();
say(`  roster-fronted tools (${rosterTools.length}): ${rosterTools.join(", ")}`);
for (const name of directTools) {
  assert(rosterTools.includes(`filesystem__${name}`), `filesystem__${name} re-exported`);
}
assert(
  rosterTools.some((t) => t.startsWith("memory__")),
  "memory server tools present alongside filesystem",
);

// ── Phase B: transparent calls + outcome logging + privacy ────────────────
say("");
say("## Phase B — transparent calls, outcomes, privacy");
const secret = `e2e-secret-${Date.now()}`;
const writeRes = await roster.callTool({
  name: "filesystem__write_file",
  arguments: { path: path.join(sandbox, "e2e.txt"), content: secret },
});
if (writeRes.isError === true) say(`  write_file error payload: ${JSON.stringify(writeRes.content)}`);
assert(writeRes.isError !== true, "write_file through roster succeeds");
assert(fs.readFileSync(path.join(sandbox, "e2e.txt"), "utf8") === secret, "bytes really on disk");

const readRes = await roster.callTool({
  name: "filesystem__read_text_file",
  arguments: { path: path.join(sandbox, "e2e.txt") },
});
const readText = (readRes.content ?? []).map((c) => c.text ?? "").join("");
assert(readText.includes(secret), "read_text_file returns the written content");

const db = new Database(path.join(rosterHome, "coach.db"));
const outcomes = db.prepare("SELECT capability, class, args_hash FROM outcome ORDER BY id").all();
say(`  outcomes recorded: ${outcomes.map((o) => `${o.capability}:${o.class}`).join(" · ")}`);
assert(outcomes.length >= 2, "outcomes recorded in coach.db");
assert(outcomes.every((o) => o.class === "success"), "both calls classified success");
const dbDump = JSON.stringify(db.prepare("SELECT * FROM outcome").all());
assert(!dbDump.includes(secret), "raw args/content never persisted (privacy law)");
await roster.close();

// ── Phase C: five mode — draft/call, skills-free run ───────────────────────
say("");
say("## Phase C — five mode: draft → call");
const five = await connect(["serve", "--five"]);
const fiveTools = (await five.listTools()).tools.map((t) => t.name).sort();
assert(fiveTools.join(",") === "call,draft", "five mode exposes exactly draft+call");

const draftRes = await five.callTool({
  name: "draft",
  arguments: { need: "read the contents of a text file from disk" },
});
const draftPayload = JSON.parse(draftRes.content[0].text);
const starterIds = draftPayload.starters.map((s) => s.id);
say(`  starters: ${starterIds.join(", ")}`);
assert(starterIds.includes("filesystem__read_text_file"), "draft ranks read_text_file for the need");

const fiveCall = await five.callTool({
  name: "call",
  arguments: { tool: "filesystem__read_text_file", args: { path: path.join(sandbox, "e2e.txt") } },
});
assert(
  (fiveCall.content ?? []).map((c) => c.text ?? "").join("").includes(secret),
  "five-mode call executes the drafted tool",
);

const memDraft = await five.callTool({
  name: "draft",
  arguments: { need: "store an entity in the knowledge graph memory" },
});
const memIds = JSON.parse(memDraft.content[0].text).starters.map((s) => s.id);
say(`  memory-need starters: ${memIds.join(", ")}`);
assert(memIds.some((id) => id.startsWith("memory__")), "draft crosses servers by need");

const lastOutcome = db
  .prepare("SELECT need_hash, class FROM outcome WHERE need_hash IS NOT NULL ORDER BY id DESC LIMIT 1")
  .get();
assert(lastOutcome && /^[0-9a-f]{64}$/.test(lastOutcome.need_hash), "five-mode outcomes carry need hashes");
await five.close();
await direct.close();

say("");
say("## Result: ALL ASSERTIONS PASSED");

const out = path.join(repo, "docs/verification", `${new Date().toISOString().slice(0, 10)}-m0-e2e.md`);
fs.writeFileSync(out, `${log.join("\n")}\n`);
console.log(`\ntranscript → ${out}`);
process.exit(0);
