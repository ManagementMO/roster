#!/usr/bin/env node
/**
 * exp-e2e-realism — day-in-the-life: a scripted 40-call agent session through
 * the REAL router. Real RosterServer (wired as packages/cli/src/serve.ts wires
 * it), real @modelcontextprotocol/server-filesystem + server-memory via npx,
 * real MiniLM need embeddings, real SQLite file DB, MCP client over the SDK's
 * InMemoryTransport. Measures:
 *   (a) rank-of-used-tool in drafts, first 10 vs last 10 calls (+ day-2 probe
 *       drafts after the nightly maintenance actually runs);
 *   (b) Sixth Man: when suggestions fire, well-formedness, suggest-only law;
 *   (c) draft_id attribution audited straight from the outcome table;
 *   (d) protocol fidelity: direct vs roster(five) vs roster(transparent) for
 *       success / isError / backend protocol error / killed-server shapes.
 * Run from repo root: node docs/lab/exp-e2e-realism.mjs
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));

const shared = await import(req.resolve("@rosterhq/shared"));
const coachPkg = await import(req.resolve("@rosterhq/coach"));
const routerPkg = await import(req.resolve("@rosterhq/router"));
const playbookPkg = await import(req.resolve("@rosterhq/playbook"));
const { Client } = await import(req.resolve("@modelcontextprotocol/sdk/client/index.js"));
const { StdioClientTransport } = await import(req.resolve("@modelcontextprotocol/sdk/client/stdio.js"));
const { InMemoryTransport } = await import(req.resolve("@modelcontextprotocol/sdk/inMemory.js"));

const { parseNamespacedId } = shared;
const { CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL, hashNeed, cosine } = coachPkg;
const { BackendManager, RosterServer } = routerPkg;
const { defaultSkillSources, scanSkillSources } = playbookPkg;
const { mean, percentile } = await import(path.join(here, "metrics.mjs"));

// ── scratch ────────────────────────────────────────────────────────────────
const TMP = path.join(here, "tmp-e2e-realism");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
process.env.ROSTER_TEST_HOME = TMP; // never the real HOME
const SANDBOX = fs.realpathSync(fs.mkdtempSync(path.join(TMP, "fs-sandbox-")));
const MEMFILE = path.join(TMP, "memory.json");
const DBFILE = path.join(TMP, "coach.db");

const cfg = path.join(SANDBOX, "config.yaml");
const notes = path.join(SANDBOX, "notes.md");
fs.writeFileSync(cfg, "app:\n  theme: dark\n  version: 3\n");
fs.writeFileSync(notes, "# notes\n\n- first note\n");
fs.writeFileSync(path.join(SANDBOX, "report.txt"), "quarterly numbers\n");
fs.mkdirSync(path.join(SANDBOX, "logs"), { recursive: true });
fs.writeFileSync(path.join(SANDBOX, "logs", "app.log"), "line\n".repeat(40000)); // ~200KB
fs.mkdirSync(path.join(SANDBOX, "docs"), { recursive: true });
fs.writeFileSync(path.join(SANDBOX, "docs", "a.md"), "# a\n");
fs.writeFileSync(path.join(SANDBOX, "docs", "b.md"), "# b\n");
fs.mkdirSync(path.join(SANDBOX, "adir"), { recursive: true });
const FIFO = path.join(SANDBOX, "pipe.fifo");
execFileSync("mkfifo", [FIFO]);

const OUT = path.join(here, "results-e2e-realism.json");
const results = {
  meta: {
    startedAt: new Date().toISOString(),
    node: process.version,
    model: MINILM_MODEL,
    design:
      "40-call session, five mode, real npx fs+memory backends, real MiniLM need vectors, file SQLite. " +
      "Mix: 25 well-phrased (needs.mjs phrasings) / 7 vague / 2 wrong-args-then-corrected pairs (4 calls) / " +
      "4 genuine failures (3 bad-args + 1 blocking-IO timeout that doubles as the Sixth Man probe). " +
      "Deviation from serve.ts: embedder pre-warmed deterministically (serve warms it lazily in background); " +
      "same warmup code path otherwise (ensureEmbeddingModel + document-kind backfill).",
  },
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
const say = (s) => console.log(s);
const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
const snapshotSideEffects = () => ({
  memoryJson: fs.existsSync(MEMFILE) ? sha(fs.readFileSync(MEMFILE)) : "absent",
  sandbox: sha(
    JSON.stringify(
      fs
        .readdirSync(SANDBOX, { recursive: true })
        .sort()
        .map((f) => {
          const st = fs.statSync(path.join(SANDBOX, String(f)));
          return [String(f), st.isDirectory() ? "dir" : st.size];
        }),
    ),
  ),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── boot: wire exactly as serve.ts does (five mode) ───────────────────────
say("## boot (real serve.ts wiring, five mode)");
const bootStarted = Date.now();
const db = openCoachDb(DBFILE);
const store = new CoachStore(db);
const manager = new BackendManager(); // default 30s call timeout, as serve uses

const childEnv = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MEMORY_FILE_PATH: MEMFILE };
// fs via an explicit StdioClientTransport (same class/params BackendManager
// builds internally) so we can capture the REAL child pid for the kill probe.
const fsTransport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", SANDBOX],
  env: childEnv,
  stderr: "ignore",
});
await manager.connect({ name: "fs", transport: fsTransport });
await manager.connect({ name: "memory", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], env: childEnv });

const skills = scanSkillSources(defaultSkillSources({ home: TMP })); // none installed under test home

// dense rung: replicate makeLazyEmbedder's warm path deterministically
const provider = new TransformersEmbeddings(MINILM_MODEL);
const tWarm = Date.now();
await provider.embed(["roster warmup"]);
store.ensureEmbeddingModel(provider.modelId);
const embedNeed = async (need) => (await provider.embed([need], "query"))[0] ?? null;

const roster = new RosterServer({ mode: "five", manager, store, skills, embedNeed });
roster.syncCapabilities(new Set(), bootStarted);
const maint0 = store.runMaintenanceIfDue(); // serve.ts does this at boot

// warmup backfill exactly as makeLazyEmbedder.warmup does (batch 16, document kind)
const entries = store.listCapabilities({ includeQuarantined: true });
for (let i = 0; i < entries.length; i += 16) {
  const batch = entries.slice(i, i + 16);
  const vecs = await provider.embed(batch.map((e) => `${e.name}\n${e.description}\n${e.body ?? ""}`.slice(0, 2000)), "document");
  batch.forEach((e, j) => { if (vecs[j]) store.storeBaseVec(e.id, vecs[j]); });
}
say(`  warm+backfill ${entries.length} tools in ${Date.now() - tWarm}ms`);

const [agentT, rosterT] = InMemoryTransport.createLinkedPair();
await roster.server.connect(rosterT);
const agent = new Client({ name: "lab-agent", version: "0.0.0" });
await agent.connect(agentT);
const surface = (await agent.listTools()).tools.map((t) => t.name);

// transparent-mode twin over the SAME manager, throwaway store (fidelity probes only)
const transparentRoster = new RosterServer({ mode: "transparent", manager, store: new CoachStore(openCoachDb(":memory:")), skills });
const [tAgentT, tRosterT] = InMemoryTransport.createLinkedPair();
await transparentRoster.server.connect(tRosterT);
const tAgent = new Client({ name: "lab-agent-transparent", version: "0.0.0" });
await tAgent.connect(tAgentT);

// direct baselines: own npx instances, same config
const directFsTransport = new StdioClientTransport({
  command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", SANDBOX], env: childEnv, stderr: "ignore",
});
const directFs = new Client({ name: "lab-direct-fs", version: "0.0.0" });
await directFs.connect(directFsTransport);
const directMem = new Client({ name: "lab-direct-mem", version: "0.0.0" });
await directMem.connect(new StdioClientTransport({
  command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"],
  env: { ...childEnv, MEMORY_FILE_PATH: path.join(TMP, "memory-direct.json") }, stderr: "ignore",
}));

results.boot = {
  bootMs: Date.now() - bootStarted,
  tools: manager.allTools().length,
  skills: skills.length,
  surface,
  maintenanceAtBoot: maint0,
  serverVersions: { fsDirect: directFs.getServerVersion?.() ?? null, memDirect: directMem.getServerVersion?.() ?? null },
  fsPid: fsTransport.pid ?? null,
};
say(`  ${results.boot.tools} tools fronted; surface=[${surface.join(", ")}]; fs pid=${results.boot.fsPid}`);
save();

// ── helpers ────────────────────────────────────────────────────────────────
const toolEntry = (id) => store.getCapability(id);
const memObsKey = (() => {
  const sch = toolEntry("memory__add_observations")?.inputSchema;
  const items = sch?.properties?.observations?.items?.properties ?? {};
  return "contents" in items ? "contents" : "observations" in items ? "observations" : "contents";
})();

const FACTORY = {
  fs__read_text_file: () => ({ path: notes }),
  fs__read_file: () => ({ path: notes }),
  fs__read_multiple_files: () => ({ paths: [cfg] }),
  fs__list_directory: () => ({ path: SANDBOX }),
  fs__list_directory_with_sizes: () => ({ path: SANDBOX }),
  fs__directory_tree: () => ({ path: path.join(SANDBOX, "docs") }),
  fs__search_files: () => ({ path: SANDBOX, pattern: ".md" }),
  fs__get_file_info: () => ({ path: cfg }),
  fs__list_allowed_directories: () => ({}),
  fs__create_directory: () => ({ path: path.join(SANDBOX, "misc") }),
  fs__write_file: () => ({ path: path.join(SANDBOX, "scratch.txt"), content: "scratch\n" }),
  memory__read_graph: () => ({}),
  memory__search_nodes: () => ({ query: "user" }),
  memory__open_nodes: () => ({ names: ["user"] }),
  memory__create_entities: () => ({ entities: [{ name: `scratch-${Date.now() % 1000}`, entityType: "note", observations: ["vague note"] }] }),
  memory__add_observations: () => ({ observations: [{ entityName: "user", [memObsKey]: [`obs ${Date.now() % 1000}`] }] }),
  memory__create_relations: () => ({ relations: [{ from: "user", to: "preferences", relationType: "has" }] }),
};

async function draft(need, k) {
  const t0 = Date.now();
  const res = await agent.callTool({ name: "draft", arguments: k ? { need, k } : { need } });
  const ms = Date.now() - t0;
  const payload = JSON.parse(res.content[0].text);
  // dense-channel audit: replicate draftCandidates' cosVals from the DB
  let cosSpan = null;
  let denseGoverned = false;
  const nvRow = db.prepare("SELECT dims, vec FROM need_vec WHERE need_hash = ?").get(hashNeed(need));
  if (nvRow && nvRow.vec.byteLength === nvRow.dims * 4) {
    const c = Buffer.from(nvRow.vec);
    const needVec = new Float32Array(c.buffer, c.byteOffset, nvRow.dims);
    const vecs = store.loadVecs();
    const vals = [];
    for (const e of store.listCapabilities()) {
      const v = vecs.get(e.id);
      if (v && v.length === needVec.length) vals.push(cosine(needVec, v));
    }
    if (vals.length > 1) {
      cosSpan = +(Math.max(...vals) - Math.min(...vals)).toFixed(4);
      denseGoverned = cosSpan >= 0.15;
    }
  }
  return { draftId: payload.draft_id, ranked: payload.starters.map((s) => s.id), draftMs: ms, cosSpan, denseGoverned, wireChars: res.content[0].text.length };
}

const lastOutcome = () => db.prepare("SELECT * FROM outcome ORDER BY id DESC LIMIT 1").get();
const outcomeCount = () => db.prepare("SELECT COUNT(*) AS n FROM outcome").get().n;

function extractSuggestion(res) {
  for (const c of res.content ?? []) {
    if (c?.type === "text" && typeof c.text === "string" && c.text.includes("_roster")) {
      try { return JSON.parse(c.text)._roster?.suggested_alternate ?? null; } catch { /* not it */ }
    }
  }
  return null;
}

async function callTool(tool, args, draftId) {
  const t0 = Date.now();
  try {
    const res = await agent.callTool({ name: "call", arguments: { tool, args, ...(draftId ? { draft_id: draftId } : {}) } });
    return { res, clientMs: Date.now() - t0, threw: null };
  } catch (err) {
    return { res: null, clientMs: Date.now() - t0, threw: { code: err?.code ?? null, message: String(err?.message ?? err) } };
  }
}

// ── the 40-call session script ─────────────────────────────────────────────
// kind: W well-phrased (needs.mjs phrasing unless noted), V vague, R retry pair, F genuine failure, SM sixth-man
const NEED_READ_CFG = "show me what's inside config.yaml";
const NEED_DARK = "remember that the user prefers dark mode";
const NEED_MD = "find every markdown file in the project";
const NEED_KNOW = "what do we already know about this person";
const NEED_LOG = "how big is that log file";
const SCRIPT = [
  { i: 1, kind: "W", need: NEED_READ_CFG, tool: "fs__read_text_file", args: () => ({ path: cfg }) },
  { i: 2, kind: "W", need: NEED_DARK, tool: "memory__create_entities", args: () => ({ entities: [{ name: "user", entityType: "person", observations: ["prefers dark mode"] }] }) },
  { i: 3, kind: "W", need: "make a folder for the build artifacts", tool: "fs__create_directory", args: () => ({ path: path.join(SANDBOX, "build") }) },
  { i: 4, kind: "V", need: "save this for later" },
  { i: 5, kind: "W", need: NEED_MD, tool: "fs__search_files", args: () => ({ path: SANDBOX, pattern: ".md" }) },
  { i: 6, kind: "W", need: NEED_KNOW, tool: "memory__search_nodes", args: () => ({ query: "user" }) },
  { i: 7, kind: "R", need: NEED_READ_CFG, tool: "fs__read_text_file", args: () => ({ path: path.join(SANDBOX, "config.yml") }), note: "typo'd filename → isError" },
  { i: 8, kind: "R", reuseDraft: true, tool: "fs__read_text_file", args: () => ({ path: cfg }), note: "corrected retry, same draft → prior row must go soft_fail" },
  { i: 9, kind: "W", need: "save a fact about the user so future sessions can recall it", tool: "memory__create_entities", args: () => ({ entities: [{ name: "acme corp", entityType: "company", observations: ["employs the user"] }] }) },
  { i: 10, kind: "W", need: "rename report.txt to final-report.txt", tool: "fs__move_file", args: () => ({ source: path.join(SANDBOX, "report.txt"), destination: path.join(SANDBOX, "final-report.txt") }) },
  { i: 11, kind: "F", need: NEED_READ_CFG, tool: "fs__read_text_file", args: () => ({ path: "/etc/hosts" }), note: "outside sandbox → isError, stays failed" },
  { i: 12, kind: "W", need: "link these two concepts together in the knowledge base", tool: "memory__create_relations", args: () => ({ relations: [{ from: "user", to: "acme corp", relationType: "works_at" }] }) },
  { i: 13, kind: "W", need: NEED_LOG, tool: "fs__get_file_info", args: () => ({ path: path.join(SANDBOX, "logs", "app.log") }) },
  { i: 14, kind: "V", need: "note this down" },
  { i: 15, kind: "W", need: "append a line to my notes file", tool: "fs__edit_file", args: () => ({ path: notes, edits: [{ oldText: "- first note", newText: "- first note\n- second note" }] }) },
  { i: 16, kind: "W", need: "Persist the following durable preference so that any future conversation can retrieve it without the user restating it: the user's timezone is America/Toronto", tool: "memory__add_observations", args: () => ({ observations: [{ entityName: "user", [memObsKey]: ["timezone America/Toronto"] }] }) },
  { i: 17, kind: "W", need: "which directories am i allowed to touch", tool: "fs__list_allowed_directories", args: () => ({}) },
  { i: 18, kind: "V", need: "check what's going on" },
  { i: 19, kind: "W", need: "forget everything we stored about acme corp", tool: "memory__delete_entities", args: () => ({ entityNames: ["acme corp"] }) },
  { i: 20, kind: "W", need: NEED_READ_CFG, tool: "fs__read_text_file", args: () => ({ path: cfg }) },
  { i: 21, kind: "W", need: NEED_KNOW, tool: "memory__search_nodes", args: () => ({ query: "user" }) },
  { i: 22, kind: "W", need: NEED_MD, tool: "fs__search_files", args: () => ({ path: SANDBOX, pattern: ".md" }) },
  { i: 23, kind: "F", need: "forget everything we stored about acme corp", tool: "memory__delete_entities", args: () => ({ entityNames: "not-an-array" }), note: "bad args → backend protocol error (fidelity capture)" },
  { i: 24, kind: "V", need: "look at the user stuff" },
  { i: 25, kind: "W", need: NEED_LOG, tool: "fs__get_file_info", args: () => ({ path: path.join(SANDBOX, "logs", "app.log") }) },
  { i: 26, kind: "V", need: "dig up the earlier stuff" },
  { i: 27, kind: "R", need: "append a line to my notes file", tool: "fs__edit_file", args: () => ({ path: notes, edits: [{ oldText: "- missing line", newText: "- x" }] }), note: "oldText not present → isError" },
  { i: 28, kind: "R", reuseDraft: true, tool: "fs__edit_file", args: () => ({ path: notes, edits: [{ oldText: "- second note", newText: "- second note\n- third note" }] }) },
  { i: 29, kind: "F", need: "append a line to my notes file", tool: "fs__write_file", args: () => ({ path: path.join(SANDBOX, "adir"), content: "x" }), note: "target is a directory → isError" },
  { i: 30, kind: "V", need: "tidy up" },
  { i: 31, kind: "W", need: NEED_DARK, tool: "memory__add_observations", args: () => ({ observations: [{ entityName: "user", [memObsKey]: ["prefers dark mode everywhere"] }] }) },
  { i: 32, kind: "W", need: NEED_READ_CFG, tool: "fs__read_text_file", args: () => ({ path: cfg }) },
  { i: 33, kind: "W", need: NEED_KNOW, tool: "memory__search_nodes", args: () => ({ query: "user" }) },
  { i: 34, kind: "W", need: NEED_MD, tool: "fs__search_files", args: () => ({ path: SANDBOX, pattern: ".md" }) },
  { i: 35, kind: "V", need: "what's in there" },
  { i: 36, kind: "W", need: NEED_LOG, tool: "fs__get_file_info", args: () => ({ path: path.join(SANDBOX, "logs", "app.log") }) },
  { i: 37, kind: "SM", need: "read back everything we know about this project from the notes file and the knowledge graph", k: 10, tool: "fs__read_text_file", args: () => ({ path: FIFO }), note: "FIFO read blocks → real 30s backend timeout → Sixth Man window" },
  { i: 38, kind: "SM", reuseDraft: true, followSuggestion: true, note: "agent follows the suggested alternate (same draft)" },
  { i: 39, kind: "W", need: "link these two concepts together in the knowledge base", tool: "memory__create_relations", args: () => ({ relations: [{ from: "user", to: "preferences", relationType: "has" }] }) },
  { i: 40, kind: "W", need: NEED_KNOW, tool: "memory__search_nodes", args: () => ({ query: "user" }) },
];

say("\n## 40-call session");
const perCall = [];
results.perCall = perCall;
const fidelity = { captures: {} };
results.fidelity = fidelity;
let sixthMan = { fired: 0, detail: null };
results.sixthMan = sixthMan;
let currentDraft = null; // { draftId, need, ranked, ... }
const firstDraftRank = new Map(); // need -> {rank, tool} at first day-1 draft

for (const step of SCRIPT) {
  // 1. draft (unless retry/follow reuses the previous one)
  if (!step.reuseDraft) {
    const d = await draft(step.need, step.k);
    currentDraft = { ...d, need: step.need };
  }
  const { draftId, ranked, cosSpan, denseGoverned, draftMs } = currentDraft;

  // 2. pick like an agent
  let tool = step.tool;
  let args = step.args ? step.args() : undefined;
  if (step.kind === "V") {
    tool = ranked.find((id) => FACTORY[id]) ?? "memory__read_graph";
    args = (FACTORY[tool] ?? (() => ({})))();
  }
  if (step.followSuggestion) {
    const sug = sixthMan.detail?.suggestion;
    tool = sug?.tool ?? "memory__read_graph";
    args = (FACTORY[tool] ?? (() => ({})))();
  }

  // sixth-man side-effect snapshot just before the engineered failure
  const preSnap = step.kind === "SM" && !step.reuseDraft ? snapshotSideEffects() : null;
  const preCount = step.kind === "SM" && !step.reuseDraft ? outcomeCount() : null;

  // 3. call with draft_id (the flow under test)
  const { res, clientMs, threw } = await callTool(tool, args, draftId);
  const row = lastOutcome();
  const suggestion = res ? extractSuggestion(res) : null;

  if (suggestion && step.kind === "SM" && !step.reuseDraft) {
    const postSnap = snapshotSideEffects();
    const parsed = parseNamespacedId(suggestion.tool);
    sixthMan = {
      fired: 1,
      detail: {
        atCall: step.i,
        failedTool: tool,
        outcomeClass: row?.class,
        suggestion,
        wellFormedId: parsed !== null,
        existsInRoster: manager.lookup(suggestion.tool) !== null,
        crossSource: parsed?.source !== parseNamespacedId(tool)?.source,
        sideEffects: { before: preSnap, after: postSnap, unchanged: JSON.stringify(preSnap) === JSON.stringify(postSnap) },
        outcomeRowsDuringFailingCall: outcomeCount() - preCount, // must be exactly 1 (the failing call itself)
        suggestionRow: db.prepare("SELECT * FROM suggestion ORDER BY id DESC LIMIT 1").get() ?? null,
        baseContentPreserved: (res.content ?? []).length,
        fullResponse: res,
      },
    };
    results.sixthMan = sixthMan;
  } else if (suggestion) {
    results.sixthMan.spontaneous ??= [];
    results.sixthMan.spontaneous.push({ atCall: step.i, tool, suggestion });
  } else if (step.kind === "SM" && !step.reuseDraft) {
    results.sixthMan = sixthMan = {
      fired: 0,
      notFiredDiagnosis: {
        atCall: step.i,
        failedTool: tool,
        outcomeClass: row?.class,
        classInSuggestionSet: ["hard_fail:transport", "tool_fail:timeout", "tool_fail:internal"].includes(row?.class),
        ranked,
        crossSourceCandidatesInDraft: ranked.filter((id) => parseNamespacedId(id)?.source !== parseNamespacedId(tool)?.source),
        response: res ?? threw,
      },
    };
  }

  // fidelity captures from within the session
  if (step.i === 1) fidelity.captures.fiveSuccess = res;
  if (step.i === 11) fidelity.captures.fiveIsError = res;
  if (step.i === 23) fidelity.captures.fiveProtocolError = { res, threw };

  const rank = ranked.indexOf(tool);
  if (!step.reuseDraft && !firstDraftRank.has(step.need)) {
    firstDraftRank.set(step.need, { tool, rank: rank === -1 ? null : rank + 1 });
  }
  const rec = {
    i: step.i,
    kind: step.kind,
    need: currentDraft.need,
    newDraft: !step.reuseDraft,
    draftId,
    draftMs: step.reuseDraft ? null : draftMs,
    cosSpan,
    denseGoverned,
    top5: ranked.slice(0, 5),
    tool,
    rankInDraft: rank === -1 ? null : rank + 1,
    clientMs,
    threw,
    db: row
      ? { id: row.id, class: row.class, latencyMs: row.latency_ms, needHash: row.need_hash, argsHash: row.args_hash ? row.args_hash.slice(0, 12) : null, session: row.session }
      : null,
    needHashMatchesDraft: row ? row.need_hash === hashNeed(currentDraft.need) : null,
    suggestionFired: suggestion !== null,
    note: step.note ?? null,
  };
  perCall.push(rec);
  say(`  #${String(step.i).padStart(2)} ${step.kind} ${tool ?? "-"} rank=${rec.rankInDraft ?? "-"} class=${rec.db?.class ?? "THREW"} ${clientMs}ms${suggestion ? " [SIXTH MAN FIRED]" : ""}`);
  if (step.i % 5 === 0) save();

  // mid-session: the real maintenance, exactly the nightly body
  if (step.i === 20) {
    const t0 = Date.now();
    store.recomputeRatings("all");
    const oats = store.runOats();
    results.maintenanceMidSession = {
      afterCall: 20,
      oats,
      ms: Date.now() - t0,
      ratings: db.prepare("SELECT capability, n, successes, wilson_lb FROM rating ORDER BY wilson_lb DESC").all(),
      note: "production never runs this mid-session (runMaintenanceIfDue is debounced ~20h and only called at serve boot); forced here per charter",
    };
    say(`  -- mid-session maintenance: oats adjusted=${oats.adjusted} skipped=${oats.skipped}`);
    save();
  }
}
save();

// suggestion taken-flip audit (call 38 followed it)
if (results.sixthMan.detail) {
  results.sixthMan.detail.takenAfterFollow = db
    .prepare("SELECT id, failed_capability, suggested_capability, taken, session FROM suggestion ORDER BY id DESC LIMIT 1")
    .get();
}
results.suggestionRows = db.prepare("SELECT * FROM suggestion").all();

// ── probes 41-44: attribution edges + false soft-fail ─────────────────────
say("\n## probes: attribution edges");
const probes = {};
results.probes = probes;

// 41: explicit UNKNOWN draft_id must never inherit another draft's need
{
  const before = outcomeCount();
  const { res } = await callTool("memory__search_nodes", { query: "user" }, "d999");
  const row = lastOutcome();
  probes.unknownDraftId = {
    tool: "memory__search_nodes", draftId: "d999",
    rowAdded: outcomeCount() - before, needHash: row.need_hash, class: row.class,
    strictNullAttribution: row.need_hash === null,
  };
  say(`  d999 probe: need_hash=${row.need_hash} (strict null: ${probes.unknownDraftId.strictNullAttribution})`);
}

// 42: hallucinated tool id — does anything get recorded?
{
  const before = outcomeCount();
  const { threw } = await callTool("gh__create_issue", { title: "x" }, "d999");
  probes.hallucinatedTool = { threw, outcomeRowsAdded: outcomeCount() - before };
  say(`  hallucinated id: threw code=${threw?.code} rowsAdded=${probes.hallucinatedTool.outcomeRowsAdded}`);
}

// 43+44: benign same-tool different-args sequence — false soft-fail? Plus
// omitted-draft_id fallback attribution.
{
  const d43 = await draft("double check the config file");
  const r43 = await callTool("fs__read_text_file", { path: cfg }, d43.draftId);
  const row43 = lastOutcome();
  const r44 = await callTool("fs__read_text_file", { path: notes }, undefined); // draft_id omitted on purpose
  const row44 = lastOutcome();
  const row43after = db.prepare("SELECT * FROM outcome WHERE id = ?").get(row43.id);
  probes.falseSoftFail = {
    call43: { class: row43.class, softFailBefore: row43.soft_fail },
    call44: { class: row44.class, needHash: row44.need_hash, fallbackAttributedToLastDraft: row44.need_hash === hashNeed("double check the config file") },
    call43SoftFailAfter44: row43after.soft_fail,
    verdict: row43after.soft_fail === 1 ? "legitimate success RETRO-MARKED soft_fail by benign different-args reuse" : "no false soft-fail",
  };
  say(`  false-soft-fail probe: row43 soft_fail=${row43after.soft_fail}; 44 fallback-attributed=${probes.falseSoftFail.call44.fallbackAttributedToLastDraft}`);
}
save();

// ── fidelity: direct vs five vs transparent (live server) ─────────────────
say("\n## protocol fidelity (live backends)");
const canon = (x) => JSON.stringify(x);
{
  // success byte-shape
  const direct = await directFs.callTool({ name: "read_text_file", arguments: { path: cfg } });
  const transparent = await tAgent.callTool({ name: "fs__read_text_file", arguments: { path: cfg } });
  const five = fidelity.captures.fiveSuccess;
  fidelity.success = {
    direct, transparent, five,
    directBytes: canon(direct).length,
    transparentEqualsDirect: canon(transparent) === canon(direct),
    fiveEqualsDirect: canon(five) === canon(direct),
  };
  // isError byte-shape (path outside sandbox)
  const dErr = await directFs.callTool({ name: "read_text_file", arguments: { path: "/etc/hosts" } });
  const tErr = await tAgent.callTool({ name: "fs__read_text_file", arguments: { path: "/etc/hosts" } });
  fidelity.isError = {
    direct: dErr, transparent: tErr, five: fidelity.captures.fiveIsError,
    transparentEqualsDirect: canon(tErr) === canon(dErr),
    fiveEqualsDirect: canon(fidelity.captures.fiveIsError) === canon(dErr),
  };
  say(`  success: transparent==direct ${fidelity.success.transparentEqualsDirect}; five==direct ${fidelity.success.fiveEqualsDirect}`);
  say(`  isError: transparent==direct ${fidelity.isError.transparentEqualsDirect}; five==direct ${fidelity.isError.fiveEqualsDirect}`);

  // backend protocol error (zod/type failure inside server-memory)
  let directThrow = null;
  try { await directMem.callTool({ name: "delete_entities", arguments: { entityNames: "not-an-array" } }); } catch (e) { directThrow = { code: e?.code ?? null, message: String(e?.message ?? e) }; }
  let transparentThrow = null;
  try { await tAgent.callTool({ name: "memory__delete_entities", arguments: { entityNames: "not-an-array" } }); } catch (e) { transparentThrow = { code: e?.code ?? null, message: String(e?.message ?? e) }; }
  fidelity.protocolError = {
    direct: directThrow,
    transparent: transparentThrow,
    five: fidelity.captures.fiveProtocolError,
    codePreserved: directThrow?.code === transparentThrow?.code,
    messageComparison: { direct: directThrow?.message, transparent: transparentThrow?.message },
  };
  say(`  protocol: direct code=${directThrow?.code} vs transparent code=${transparentThrow?.code}`);
}
save();

// ── nightly maintenance #2 + day-2 probe drafts ────────────────────────────
say("\n## nightly maintenance + day-2 drafts");
store.recomputeRatings("all");
const oats2 = store.runOats();
results.maintenanceNightly = {
  oats: oats2,
  adjustedTools: db.prepare("SELECT capability FROM vec WHERE adj IS NOT NULL ORDER BY capability").all().map((r) => r.capability),
  ratings: db.prepare("SELECT capability, n, successes, wilson_lb, p50_ms FROM rating ORDER BY n DESC").all(),
};
say(`  oats#2 adjusted=${oats2.adjusted} [${results.maintenanceNightly.adjustedTools.join(", ")}]`);

const day2Probes = [
  { need: NEED_READ_CFG, tool: "fs__read_text_file" },
  { need: NEED_DARK, tool: "memory__add_observations" },
  { need: NEED_MD, tool: "fs__search_files" },
  { need: NEED_KNOW, tool: "memory__search_nodes" },
  { need: NEED_LOG, tool: "fs__get_file_info" },
  { need: "append a line to my notes file", tool: "fs__edit_file" },
  { need: "which directories am i allowed to touch", tool: "fs__list_allowed_directories" },
  { need: "link these two concepts together in the knowledge base", tool: "memory__create_relations" },
  { need: "retrieve saved facts from earlier sessions", tool: "memory__search_nodes", generalization: true },
  { need: "double-check the theme setting file", tool: "fs__read_text_file", generalization: true },
];
results.day2 = [];
for (const p of day2Probes) {
  const d = await draft(p.need);
  const rank = d.ranked.indexOf(p.tool);
  const day1 = firstDraftRank.get(p.need) ?? null;
  results.day2.push({
    need: p.need, tool: p.tool, generalization: p.generalization ?? false,
    day1Rank: day1?.rank ?? null, day2Rank: rank === -1 ? null : rank + 1,
    cosSpan: d.cosSpan, denseGoverned: d.denseGoverned, top5: d.ranked.slice(0, 5),
  });
  say(`  day2 "${p.need.slice(0, 44)}" ${p.tool}: day1=${day1?.rank ?? "-"} day2=${rank === -1 ? "-" : rank + 1} span=${d.cosSpan} governed=${d.denseGoverned}`);
}
save();

// ── kill the fs backend for real; classify + fidelity ─────────────────────
say("\n## kill probe (real SIGKILL on the fs backend)");
const kill = {};
results.killProbe = kill;
const fsPid = fsTransport.pid;
try {
  process.kill(fsPid, "SIGKILL");
  kill.killed = { pid: fsPid, signal: "SIGKILL" };
} catch (e) {
  kill.killed = { pid: fsPid, error: String(e) };
}
// immediate call (race window: EPIPE vs ConnectionClosed vs 30s timeout)
{
  const { res, threw, clientMs } = await callTool("fs__read_text_file", { path: cfg }, "d999");
  const row = lastOutcome();
  kill.immediateCall = { clientMs, threw, isErrorResult: res?.isError === true, resultText: res?.content?.[0]?.text ?? null, class: row.class, suggestionFired: res ? extractSuggestion(res) !== null : false, fullResult: res };
  say(`  immediate: class=${row.class} (${clientMs}ms) suggestion=${kill.immediateCall.suggestionFired}`);
}
await sleep(600);
{
  const { res, threw, clientMs } = await callTool("fs__get_file_info", { path: cfg }, "d999");
  const row = lastOutcome();
  kill.delayedCall = { clientMs, threw, isErrorResult: res?.isError === true, resultText: res?.content?.[0]?.text ?? null, class: row.class, suggestionFired: res ? extractSuggestion(res) !== null : false };
  say(`  delayed: class=${row.class} (${clientMs}ms)`);
}
// transparent-mode shape for the dead server
{
  let transparentThrow = null;
  try { await tAgent.callTool({ name: "fs__read_text_file", arguments: { path: cfg } }); } catch (e) { transparentThrow = { code: e?.code ?? null, message: String(e?.message ?? e) }; }
  kill.transparent = transparentThrow;
}
// direct-connection baseline for the same failure mode
{
  try { process.kill(directFsTransport.pid, "SIGKILL"); } catch { /* already dead */ }
  await sleep(600);
  let directThrow = null;
  try { await directFs.callTool({ name: "read_text_file", arguments: { path: cfg } }); } catch (e) { directThrow = { code: e?.code ?? null, message: String(e?.message ?? e) }; }
  kill.direct = directThrow;
  kill.comparison = {
    directCode: directThrow?.code, transparentCode: kill.transparent?.code,
    codePreserved: directThrow?.code === kill.transparent?.code,
  };
  say(`  dead-server: direct code=${directThrow?.code} vs transparent code=${kill.transparent?.code}`);
}
save();

// ── final DB audit ─────────────────────────────────────────────────────────
say("\n## DB audit");
const allRows = db.prepare("SELECT * FROM outcome ORDER BY id").all();
const sessions = [...new Set(allRows.map((r) => r.session))];
const softFails = allRows.filter((r) => r.soft_fail === 1);
const sessionRows = perCall.filter((c) => c.db).map((c) => c.db.id);
const attribution = {
  totalOutcomeRows: allRows.length,
  distinctSessions: sessions.length,
  sessionRowCount: sessionRows.length,
  needHashMismatches: perCall.filter((c) => c.needHashMatchesDraft === false).map((c) => c.i),
  softFailRows: softFails.map((r) => ({ id: r.id, capability: r.capability, class: r.class })),
  softFailOnSuccessRows: softFails.filter((r) => r.class === "success").length,
  classHistogram: Object.fromEntries(
    db.prepare("SELECT class, COUNT(*) n FROM outcome GROUP BY class ORDER BY n DESC").all().map((r) => [r.class, r.n]),
  ),
};
results.attribution = attribution;

// learning aggregates
const win = (lo, hi) => perCall.filter((c) => c.i >= lo && c.i <= hi);
const rankStats = (rows) => {
  const ranks = rows.filter((c) => c.rankInDraft !== null).map((c) => c.rankInDraft);
  return {
    n: rows.length,
    inDraftRate: +(ranks.length / rows.length).toFixed(3),
    meanRank: ranks.length ? +mean(ranks).toFixed(2) : null,
    mrr: +mean(rows.map((c) => (c.rankInDraft ? 1 / c.rankInDraft : 0))).toFixed(3),
  };
};
results.learning = {
  first10: rankStats(win(1, 10)),
  last10: rankStats(win(31, 40)),
  denseGovernedDrafts: perCall.filter((c) => c.newDraft && c.denseGoverned).length,
  totalNewDrafts: perCall.filter((c) => c.newDraft).length,
  cosSpanStats: (() => {
    const spans = perCall.filter((c) => c.newDraft && c.cosSpan !== null).map((c) => c.cosSpan);
    return { min: Math.min(...spans), p50: percentile(spans, 50), max: Math.max(...spans) };
  })(),
  repeatNeedTrajectories: [NEED_READ_CFG, NEED_KNOW, NEED_MD, NEED_LOG].map((need) => ({
    need,
    ranks: perCall.filter((c) => c.need === need && c.newDraft).map((c) => ({ call: c.i, tool: c.tool, rank: c.rankInDraft })),
  })),
  latency: {
    draftMs: { p50: percentile(perCall.filter((c) => c.draftMs).map((c) => c.draftMs), 50), p95: percentile(perCall.filter((c) => c.draftMs).map((c) => c.draftMs), 95) },
    callMs: { p50: percentile(perCall.map((c) => c.clientMs), 50), p95: percentile(perCall.map((c) => c.clientMs), 95) },
  },
};
say(`  first10 ${JSON.stringify(results.learning.first10)}`);
say(`  last10  ${JSON.stringify(results.learning.last10)}`);
say(`  soft_fail rows: ${attribution.softFailRows.length} (on success rows: ${attribution.softFailOnSuccessRows})`);
say(`  class histogram: ${JSON.stringify(attribution.classHistogram)}`);

results.meta.finishedAt = new Date().toISOString();
save();

// ── teardown ───────────────────────────────────────────────────────────────
await agent.close().catch(() => {});
await tAgent.close().catch(() => {});
await directFs.close().catch(() => {});
await directMem.close().catch(() => {});
await manager.close().catch(() => {});
await provider.dispose().catch(() => {});
db.close();
fs.rmSync(TMP, { recursive: true, force: true });
say(`\nresults → ${OUT}`);
process.exit(0);
