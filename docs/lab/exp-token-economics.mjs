#!/usr/bin/env node
/**
 * exp-token-economics — measure the receipt/marketing numbers for REAL.
 *
 * A. Spawn REAL @modelcontextprotocol/server-filesystem + server-memory via
 *    npx, capture actual tools/list JSON; tokens for: direct list vs roster
 *    transparent list vs five-mode static surface vs an actual wire-captured
 *    5-card draft response (real RosterServer, real CoachStore, real MiniLM).
 * B. Same arithmetic for the 133-tool lab corpus across all 66 ground-truthed
 *    needs (docs/lab/corpus.mjs + needs.mjs).
 * C. estimateTokensFromChars honesty: real MiniLM WordPiece tokenizer counts
 *    for the same payloads (+ optional legacy Xenova/claude-tokenizer).
 * D. trimSchema depth study on the real captured schemas + 3 pathological
 *    synthetics; census of semantically load-bearing keys dropped at depth 1.
 *
 * Every number in results-token-economics.json comes from code executed here.
 * Run from repo root: node docs/lab/exp-token-economics.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));

const shared = await import(req.resolve("@rosterhq/shared"));
const coachPkg = await import(req.resolve("@rosterhq/coach"));
const routerPkg = await import(req.resolve("@rosterhq/router"));
const { Client } = await import(req.resolve("@modelcontextprotocol/sdk/client/index.js"));
const { StdioClientTransport } = await import(req.resolve("@modelcontextprotocol/sdk/client/stdio.js"));
const { InMemoryTransport } = await import(req.resolve("@modelcontextprotocol/sdk/inMemory.js"));

const { estimateTokensFromChars, namespacedId } = shared;
const { CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL, stableStringify } = coachPkg;
const { BackendManager, RosterServer, toCard, trimSchema } = routerPkg;

const { TOOLS } = await import(path.join(here, "corpus.mjs"));
const { NEEDS } = await import(path.join(here, "needs.mjs"));
const { hitAtK, rankedIds, mean, percentile } = await import(path.join(here, "metrics.mjs"));

const TMP = path.join(here, "tmp-token-economics");
fs.mkdirSync(TMP, { recursive: true });
const SANDBOX = fs.realpathSync(fs.mkdtempSync(path.join(TMP, "fs-sandbox-")));
fs.writeFileSync(path.join(SANDBOX, "hello.txt"), "hello from the token-economics lab\n");

const results = {
  meta: {
    startedAt: new Date().toISOString(),
    node: process.version,
    model: MINILM_MODEL,
    tokenDefinition:
      "estTokens = estimateTokensFromChars(chars) = ceil(chars/4) on the serialized payload. " +
      "Lists are serialized as compact JSON.stringify of the tools array (conservative — favors the direct baseline). " +
      "Draft responses are measured as the ACTUAL text served on the wire (roster pretty-prints them).",
  },
  A_live: {},
  B_corpus: {},
  C_tokenizer: {},
  D_trimDepth: {},
};
const OUT = path.join(here, "results-token-economics.json");
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
const say = (s) => console.log(s);
const jchars = (x) => JSON.stringify(x).length;
const est = (chars) => estimateTokensFromChars(chars);

// ───────────────────────────────────────────────────────────────────────────
// A. REAL SERVERS
// ───────────────────────────────────────────────────────────────────────────
say("## A. real fs + memory servers via npx");

const childEnv = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  MEMORY_FILE_PATH: path.join(TMP, "memory.json"), // sandbox: memory server must not write outside tmp
};

const SERVER_SPECS = [
  { name: "fs", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", SANDBOX] },
  { name: "memory", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
];

// A1: raw direct capture — exactly what a client connecting straight to each
// server receives from tools/list, no roster in the path.
const directCaptures = {};
for (const spec of SERVER_SPECS) {
  const t0 = Date.now();
  const client = new Client({ name: "lab-direct", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({ command: spec.command, args: spec.args, env: childEnv, stderr: "ignore" }),
  );
  const tools = [];
  let cursor;
  do {
    const page = await client.listTools({ cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  await client.close();
  directCaptures[spec.name] = tools;
  say(`  ${spec.name}: ${tools.length} tools captured direct in ${Date.now() - t0}ms`);
}
fs.writeFileSync(path.join(TMP, "captured-tools-list.json"), JSON.stringify(directCaptures, null, 2));

const directAllTools = [...directCaptures.fs, ...directCaptures.memory];
const directChars = jchars(directAllTools);

// A2: roster path — real BackendManager against the same real servers,
// real CoachStore, real MiniLM vectors, two real RosterServers over real
// MCP client connections (InMemoryTransport pairs).
const manager = new BackendManager();
for (const spec of SERVER_SPECS) {
  await manager.connect({ name: spec.name, command: spec.command, args: spec.args, env: childEnv });
}
const liveEntries = manager.allTools();

const store = new CoachStore(openCoachDb(":memory:"));
const provider = new TransformersEmbeddings(MINILM_MODEL);
const tEmb0 = Date.now();
const liveVecs = await provider.embed(liveEntries.map((e) => `${e.name}\n${e.description}`));
liveEntries.forEach((e, i) => store.storeBaseVec(e.id, liveVecs[i]));
say(`  embedded ${liveEntries.length} live tool texts in ${Date.now() - tEmb0}ms (real MiniLM inference)`);

const embedNeed = async (need) => (await provider.embed([need], "query"))[0] ?? null;

async function connectRoster(mode) {
  const roster = new RosterServer({ mode, manager, store, embedNeed, sessionId: `lab-${mode}` });
  roster.syncCapabilities();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await roster.server.connect(serverT);
  const client = new Client({ name: "lab-agent", version: "0.0.0" });
  await client.connect(clientT);
  return client;
}

const transparentClient = await connectRoster("transparent");
const fiveClient = await connectRoster("five");

const transparentTools = (await transparentClient.listTools()).tools;
const fiveTools = (await fiveClient.listTools()).tools;
const transparentChars = jchars(transparentTools);
const fiveStaticChars = jchars(fiveTools);

// A3: real wire-captured draft responses for every fs/memory-scoped need in
// the shared needs fixture (primary ids all within these two servers).
const liveIds = new Set(liveEntries.map((e) => e.id));
const liveNeeds = NEEDS.filter((n) => n.primary.every((id) => liveIds.has(id)));
const liveDrafts = [];
const liveWireTexts = [];
for (const n of liveNeeds) {
  const res = await fiveClient.callTool({ name: "draft", arguments: { need: n.need } });
  const text = res.content?.[0]?.text ?? "";
  const payload = JSON.parse(text);
  const compact = JSON.stringify(payload);
  liveWireTexts.push({ need: n.need, text });
  liveDrafts.push({
    need: n.need,
    style: n.style,
    starters: payload.starters.map((s) => s.id),
    hit5: hitAtK(payload.starters.map((s) => s.id), n.acceptable, 5),
    wireChars: text.length,
    wireTokens: est(text.length),
    compactChars: compact.length,
    compactTokens: est(compact.length),
  });
}
fs.writeFileSync(path.join(TMP, "live-draft-wires.json"), JSON.stringify(liveWireTexts, null, 2));
const liveWire = liveDrafts.map((d) => d.wireTokens);
const liveCompact = liveDrafts.map((d) => d.compactTokens);

// transparent-list faithfulness: which fields of the direct tools/list does
// RosterServer.listTools() drop? (it maps to name/description/inputSchema/outputSchema)
const KEPT_KEYS = new Set(["name", "description", "inputSchema", "outputSchema"]);
const droppedFieldStats = {};
for (const tool of directAllTools) {
  for (const [k, v] of Object.entries(tool)) {
    if (KEPT_KEYS.has(k)) continue;
    droppedFieldStats[k] ??= { toolsWithField: 0, chars: 0 };
    droppedFieldStats[k].toolsWithField++;
    droppedFieldStats[k].chars += JSON.stringify({ [k]: v }).length - 2;
  }
}

const A = {
  servers: SERVER_SPECS.map((s) => ({ name: s.name, args: s.args.slice(0, 2).join(" ") })),
  toolCounts: { fs: directCaptures.fs.length, memory: directCaptures.memory.length, total: directAllTools.length },
  directList: { chars: directChars, estTokens: est(directChars) },
  transparentList: {
    chars: transparentChars,
    estTokens: est(transparentChars),
    overheadVsDirectPct: +((transparentChars / directChars - 1) * 100).toFixed(2),
    fieldsDroppedFromDirect: droppedFieldStats,
  },
  fiveStaticSurface: { toolCount: fiveTools.length, chars: fiveStaticChars, estTokens: est(fiveStaticChars) },
  draftResponses: {
    n: liveDrafts.length,
    wireTokens: { mean: +mean(liveWire).toFixed(1), p50: percentile(liveWire, 50), p95: percentile(liveWire, 95), min: Math.min(...liveWire), max: Math.max(...liveWire) },
    compactTokens: { mean: +mean(liveCompact).toFixed(1), p50: percentile(liveCompact, 50) },
    prettyPrintOverheadPct: +((mean(liveWire) / mean(liveCompact) - 1) * 100).toFixed(1),
    hit5Mean: +mean(liveDrafts.map((d) => d.hit5)).toFixed(3),
    perNeed: liveDrafts,
  },
};
const oneDraftSession = A.fiveStaticSurface.estTokens + A.draftResponses.wireTokens.mean;
A.headline = {
  nTools: directAllTools.length,
  directTokens: A.directList.estTokens,
  fiveModeOneDraftTokens: Math.round(oneDraftSession),
  savedPct: +((1 - oneDraftSession / A.directList.estTokens) * 100).toFixed(1),
  breakEvenDrafts: +((A.directList.estTokens - A.fiveStaticSurface.estTokens) / A.draftResponses.wireTokens.mean).toFixed(1),
};
results.A_live = A;
save();
say(`  direct ${A.directList.estTokens}t vs transparent ${A.transparentList.estTokens}t vs five-static ${A.fiveStaticSurface.estTokens}t + draft ~${A.draftResponses.wireTokens.mean}t`);
say(`  headline: ${A.headline.nTools} tools, ${A.headline.directTokens}t direct vs ${A.headline.fiveModeOneDraftTokens}t via draft (−${A.headline.savedPct}%); break-even ${A.headline.breakEvenDrafts} drafts`);

// keep the real schemas for parts B/D before shutting backends down
const realSchemas = liveEntries.map((e) => ({ id: e.id, name: e.name, schema: e.inputSchema }));

await transparentClient.close();
await fiveClient.close();
await manager.close();

// ───────────────────────────────────────────────────────────────────────────
// B. 133-TOOL CORPUS
// ───────────────────────────────────────────────────────────────────────────
say("\n## B. 133-tool corpus (docs/lab/corpus.mjs), 66 needs");

const storeB = new CoachStore(openCoachDb(":memory:"));
storeB.upsertCapabilities(TOOLS);
const tEmbB = Date.now();
const corpusVecs = await provider.embed(TOOLS.map((t) => `${t.name}\n${t.description}`));
TOOLS.forEach((t, i) => storeB.storeBaseVec(t.id, corpusVecs[i]));
say(`  embedded ${TOOLS.length} corpus tool texts in ${Date.now() - tEmbB}ms`);

// transparent-list shape exactly as RosterServer.listTools() builds it
const corpusListShape = TOOLS.map((t) => ({ name: t.id, description: t.description, inputSchema: t.inputSchema ?? { type: "object" } }));
const corpusListChars = jchars(corpusListShape);

// hybrid-real variant: the 23 fs/memory corpus tools carry the REAL schemas
// captured in part A (measured, not invented); the other 110 keep the
// corpus's {type:"object"} stubs → still a LOWER BOUND on a real 133-tool list.
const realSchemaById = new Map(realSchemas.map((r) => [r.id, r.schema]));
const corpusHybrid = TOOLS.map((t) => ({
  name: t.id,
  description: t.description,
  inputSchema: realSchemaById.get(t.id) ?? t.inputSchema ?? { type: "object" },
}));
const corpusHybridChars = jchars(corpusHybrid);
const realizedCount = corpusHybrid.filter((t) => realSchemaById.has(t.name)).length;

// per-tool average schema weight measured on the real servers (context for the caveat)
const realAvgToolChars = directChars / directAllTools.length;
const stubAvgToolChars = corpusListChars / TOOLS.length;

// drafts across all 66 needs, real MiniLM need vectors, exact handleDraft payload shape
const draftsB = [];
const corpusWireTexts = [];
const needVecs = await provider.embed(NEEDS.map((n) => n.need), "query");
NEEDS.forEach((n, i) => {
  const candidates = storeB.draftCandidates(n.need, 5, needVecs[i]);
  const starters = candidates.map((c) => toCard(c.entry));
  const payload = {
    need: n.need,
    draft_id: `d${i + 1}`,
    starters,
    usage: "Invoke with call({tool: <id>, args: {…}, draft_id}). Re-draft when your need changes.",
  };
  const wire = JSON.stringify(payload, null, 2); // exactly what handleDraft serves
  corpusWireTexts.push({ need: n.need, text: wire });
  const ranked = rankedIds(candidates);
  draftsB.push({
    need: n.need,
    style: n.style,
    hit5: hitAtK(ranked, n.acceptable, 5),
    wireChars: wire.length,
    wireTokens: est(wire.length),
    compactTokens: est(JSON.stringify(payload).length),
  });
});
const wireB = draftsB.map((d) => d.wireTokens);
const compactB = draftsB.map((d) => d.compactTokens);

const fiveStaticTokens = results.A_live.fiveStaticSurface.estTokens; // same static surface in any deployment
const B = {
  caveat:
    "corpus.mjs ships stub inputSchemas ({type:'object'}), so corpusList is a LOWER BOUND on a real 133-tool surface. " +
    `Measured real-schema weight (part A): ${Math.round(realAvgToolChars)} chars/tool vs ${Math.round(stubAvgToolChars)} chars/tool for the stub corpus. ` +
    "hybridList replaces the 23 fs/memory stubs with the real schemas captured in this run; the other 110 remain stubs.",
  corpusList: { nTools: TOOLS.length, chars: corpusListChars, estTokens: est(corpusListChars) },
  hybridList: { nTools: TOOLS.length, realSchemas: realizedCount, chars: corpusHybridChars, estTokens: est(corpusHybridChars) },
  measuredCharsPerTool: { realServers: +realAvgToolChars.toFixed(1), corpusStub: +stubAvgToolChars.toFixed(1) },
  draftResponses: {
    n: draftsB.length,
    wireTokens: { mean: +mean(wireB).toFixed(1), p50: percentile(wireB, 50), p95: percentile(wireB, 95), min: Math.min(...wireB), max: Math.max(...wireB) },
    compactTokens: { mean: +mean(compactB).toFixed(1), p50: percentile(compactB, 50) },
    prettyPrintOverheadPct: +((mean(wireB) / mean(compactB) - 1) * 100).toFixed(1),
    hit5Mean: +mean(draftsB.map((d) => d.hit5)).toFixed(3),
  },
  perNeed: draftsB,
};
const oneDraftB = fiveStaticTokens + B.draftResponses.wireTokens.mean;
B.headline = {
  nTools: TOOLS.length,
  directTokensLowerBound: B.corpusList.estTokens,
  fiveModeOneDraftTokens: Math.round(oneDraftB),
  savedPctVsStubList: +((1 - oneDraftB / B.corpusList.estTokens) * 100).toFixed(1),
  savedPctVsHybridList: +((1 - oneDraftB / B.hybridList.estTokens) * 100).toFixed(1),
  breakEvenDraftsVsStub: +((B.corpusList.estTokens - fiveStaticTokens) / B.draftResponses.wireTokens.mean).toFixed(1),
  breakEvenDraftsVsHybrid: +((B.hybridList.estTokens - fiveStaticTokens) / B.draftResponses.wireTokens.mean).toFixed(1),
};
results.B_corpus = B;
save();
say(`  corpus list ${B.corpusList.estTokens}t (stub schemas) / ${B.hybridList.estTokens}t (23 real schemas grafted)`);
say(`  draft mean ${B.draftResponses.wireTokens.mean}t → saved ${B.headline.savedPctVsStubList}% vs stub, ${B.headline.savedPctVsHybridList}% vs hybrid; hit@5 ${B.draftResponses.hit5Mean}`);

// ───────────────────────────────────────────────────────────────────────────
// C. REAL TOKENIZER CROSS-CHECK
// ───────────────────────────────────────────────────────────────────────────
say("\n## C. estimateTokensFromChars vs real tokenizers");

const coachReq = createRequire(path.join(repo, "packages/coach/package.json"));
const transformers = await import(coachReq.resolve("@huggingface/transformers"));
const { AutoTokenizer } = transformers;

async function countWith(tok, text) {
  // chunk long payloads: encode() on some models applies model_max_length behavior;
  // chunking at 4000 chars keeps us safe and bias from boundaries is measured below.
  const CHUNK = 4000;
  if (text.length <= CHUNK) return (await tok.encode(text)).length - specialsOf(tok);
  let total = 0;
  for (let i = 0; i < text.length; i += CHUNK) {
    total += (await tok.encode(text.slice(i, i + CHUNK))).length - specialsOf(tok);
  }
  return total;
}
const specialsCache = new Map();
function specialsOf(tok) {
  if (!specialsCache.has(tok)) {
    // measured, not assumed: specials = tokens added to an empty encode
    specialsCache.set(tok, tok.encode("").length);
  }
  return specialsCache.get(tok);
}

const miniTok = await AutoTokenizer.from_pretrained(MINILM_MODEL);
// chunking-bias sanity: direct vs chunked on a mid-size payload
const sanityText = JSON.stringify(directCaptures.memory);
const directCount = (await miniTok.encode(sanityText)).length - specialsOf(miniTok);
const chunkedCount = await countWith(miniTok, sanityText);
const chunkBiasPct = +((chunkedCount / directCount - 1) * 100).toFixed(2);

let claudeTok = null;
let claudeNote = "not attempted";
try {
  claudeTok = await AutoTokenizer.from_pretrained("Xenova/claude-tokenizer");
  claudeNote = "Xenova/claude-tokenizer = the LEGACY public Anthropic BPE (Claude 1.x era). NOT the current Claude tokenizer — indicative of BPE-family behavior only.";
} catch (e) {
  claudeNote = `load failed (${String(e).slice(0, 120)}) — no legacy-Claude numbers this run`;
}

const largestLiveWire = [...liveWireTexts].sort((a, b) => b.text.length - a.text.length)[0];
const payloads = [
  { name: "fs direct tools/list", text: JSON.stringify(directCaptures.fs) },
  { name: "memory direct tools/list", text: JSON.stringify(directCaptures.memory) },
  { name: "fs+memory direct list", text: JSON.stringify(directAllTools) },
  { name: "five static surface (draft+call defs)", text: JSON.stringify(fiveTools) },
  { name: "largest live draft response (actual wire text)", text: largestLiveWire.text },
  { name: "corpus 133 list (stub schemas)", text: JSON.stringify(corpusListShape) },
  { name: "corpus 133 hybrid list (23 real schemas)", text: JSON.stringify(corpusHybrid) },
  { name: "plain English prose control", text: "Roster is a local-first tool router for agents. It watches which tools succeed for which needs and serves a small, learned starting five instead of every schema at once. The receipt is honest: counts are real, token figures are labeled estimates." },
];
const C = { payloads: [], chunkBiasPct, claudeNote };
for (const p of payloads) {
  const chars = p.text.length;
  const heuristic = est(chars);
  const mini = await countWith(miniTok, p.text);
  const row = {
    name: p.name,
    chars,
    heuristicTokens: heuristic,
    minilmTokens: mini,
    heuristicVsMinilmPct: +((heuristic / mini - 1) * 100).toFixed(1),
  };
  if (claudeTok) {
    row.claudeLegacyTokens = await countWith(claudeTok, p.text);
    row.heuristicVsClaudeLegacyPct = +((heuristic / row.claudeLegacyTokens - 1) * 100).toFixed(1);
  }
  C.payloads.push(row);
  say(`  ${p.name}: ${chars}c → heur ${heuristic} | minilm ${mini}${row.claudeLegacyTokens ? ` | claude-legacy ${row.claudeLegacyTokens}` : ""} (heur bias vs minilm ${row.heuristicVsMinilmPct}%)`);
}
// aggregate real-tokenizer counts over EVERY captured/served draft wire
async function aggregateWires(wires, tok) {
  const counts = [];
  for (const w of wires) counts.push(await countWith(tok, w.text));
  return { n: counts.length, mean: +mean(counts).toFixed(1), p50: percentile(counts, 50), max: Math.max(...counts) };
}
C.draftWireAggregates = {
  live13: {
    minilm: await aggregateWires(liveWireTexts, miniTok),
    ...(claudeTok ? { claudeLegacy: await aggregateWires(liveWireTexts, claudeTok) } : {}),
  },
  corpus66: {
    minilm: await aggregateWires(corpusWireTexts, miniTok),
    ...(claudeTok ? { claudeLegacy: await aggregateWires(corpusWireTexts, claudeTok) } : {}),
  },
};
fs.writeFileSync(path.join(TMP, "corpus-draft-wires.json"), JSON.stringify(corpusWireTexts.slice(0, 3), null, 2));

// the A headline recomputed inside each real tokenizer's arithmetic — measured end to end
async function headlineFor(tokName, tok) {
  const direct = await countWith(tok, JSON.stringify(directAllTools));
  const stat = await countWith(tok, JSON.stringify(fiveTools));
  const draftMean = C.draftWireAggregates.live13[tokName].mean;
  const oneDraft = stat + draftMean;
  return {
    directTokens: direct,
    fiveStaticTokens: stat,
    draftMeanTokens: draftMean,
    oneDraftSessionTokens: Math.round(oneDraft),
    savedPct: +((1 - oneDraft / direct) * 100).toFixed(1),
    breakEvenDrafts: +((direct - stat) / draftMean).toFixed(1),
  };
}
C.headlineByTokenizer = {
  heuristicChars4: results.A_live.headline,
  minilm: await headlineFor("minilm", miniTok),
  ...(claudeTok ? { claudeLegacy: await headlineFor("claudeLegacy", claudeTok) } : {}),
};

C.verdict = {
  receiptClaim: "±15% (receipt methodology string)",
  minilmBiasRangePct: [Math.min(...C.payloads.map((r) => r.heuristicVsMinilmPct)), Math.max(...C.payloads.map((r) => r.heuristicVsMinilmPct))],
  ...(claudeTok
    ? { claudeLegacyBiasRangePct: [Math.min(...C.payloads.map((r) => r.heuristicVsClaudeLegacyPct)), Math.max(...C.payloads.map((r) => r.heuristicVsClaudeLegacyPct))] }
    : {}),
  caveat:
    "MiniLM is WordPiece and claude-legacy is 2023-era BPE; neither is Claude's or GPT's current tokenizer. " +
    "JSON-heavy payloads tokenize denser than prose on modern BPEs, so treat these as brackets, not truth for any specific model.",
};
results.C_tokenizer = C;
save();
say(`  savedPct by tokenizer: heur ${C.headlineByTokenizer.heuristicChars4.savedPct}% | minilm ${C.headlineByTokenizer.minilm.savedPct}%${claudeTok ? ` | claude-legacy ${C.headlineByTokenizer.claudeLegacy.savedPct}%` : ""}`);

// ───────────────────────────────────────────────────────────────────────────
// D. trimSchema DEPTH STUDY
// ───────────────────────────────────────────────────────────────────────────
say("\n## D. trimSchema depth study");

// generalized ladder; depth 1 must reproduce the shipped trimSchema EXACTLY
function trimAtDepth(schema, depth) {
  const out = { type: schema.type ?? "object" };
  if (depth >= 1) {
    const props = schema.properties;
    if (props && typeof props === "object") {
      const trimmed = {};
      for (const [key, value] of Object.entries(props)) {
        trimmed[key] = trimProp(value, depth);
      }
      out.properties = trimmed;
    }
    if (Array.isArray(schema.required) && schema.required.length > 0) out.required = schema.required;
  }
  return out;
}
function trimProp(value, depth) {
  if (!value || typeof value !== "object") return { type: "any" };
  const v = value;
  if (depth >= 2) {
    if (v.type === "object" || v.properties) {
      const inner = trimAtDepth(v, depth - 1);
      if (v.enum) inner.enum = v.enum;
      return inner;
    }
    if (v.type === "array" && v.items && typeof v.items === "object") {
      return { type: "array", items: trimProp(v.items, depth - 1) };
    }
    if (Array.isArray(v.anyOf)) return { anyOf: v.anyOf.map((b) => trimProp(b, depth - 1)) };
    if (Array.isArray(v.oneOf)) return { oneOf: v.oneOf.map((b) => trimProp(b, depth - 1)) };
  }
  return { type: v.type ?? "any", ...(v.enum ? { enum: v.enum } : {}) };
}

// verify depth-1 == shipped trimSchema on every real schema
let d1Matches = 0;
for (const r of realSchemas) {
  if (stableStringify(trimAtDepth(r.schema, 1)) === stableStringify(trimSchema(r.schema))) d1Matches++;
}
say(`  depth-1 ladder reproduces shipped trimSchema on ${d1Matches}/${realSchemas.length} real schemas`);

// census of dropped keys at shipped depth (walk original, classify)
const LOAD_BEARING = ["required", "enum", "default", "items", "properties", "anyOf", "oneOf", "allOf", "description", "format", "additionalProperties"];
function censusSchema(schema) {
  const counts = Object.fromEntries(LOAD_BEARING.map((k) => [k, { total: 0, keptAtD1: 0 }]));
  const walk = (node, depth, inProp) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const key of LOAD_BEARING) {
      if (key in node) {
        counts[key].total++;
        const kept =
          (key === "required" && depth === 0) ||
          (key === "enum" && depth === 1 && inProp) ||
          (key === "properties" && depth === 0);
        if (kept) counts[key].keptAtD1++;
      }
    }
    if (node.properties && typeof node.properties === "object") {
      for (const v of Object.values(node.properties)) walk(v, depth + 1, true);
    }
    if (node.items && typeof node.items === "object") walk(node.items, depth + 1, false);
    for (const comb of ["anyOf", "oneOf", "allOf"]) {
      if (Array.isArray(node[comb])) for (const b of node[comb]) walk(b, depth + 1, false);
    }
  };
  walk(schema, 0, false);
  return counts;
}
const censusTotal = Object.fromEntries(LOAD_BEARING.map((k) => [k, { total: 0, keptAtD1: 0 }]));
const lossyTools = [];
for (const r of realSchemas) {
  const c = censusSchema(r.schema);
  let arrayPropsLosingItems = 0;
  let nestedObjectPropsFlattened = 0;
  const props = r.schema.properties ?? {};
  for (const v of Object.values(props)) {
    if (v && typeof v === "object") {
      if (v.type === "array" && v.items && typeof v.items === "object") arrayPropsLosingItems++;
      if ((v.type === "object" || v.properties) && v.properties) nestedObjectPropsFlattened++;
    }
  }
  if (arrayPropsLosingItems + nestedObjectPropsFlattened > 0) {
    lossyTools.push({ id: r.id, arrayPropsLosingItems, nestedObjectPropsFlattened });
  }
  for (const k of LOAD_BEARING) {
    censusTotal[k].total += c[k].total;
    censusTotal[k].keptAtD1 += c[k].keptAtD1;
  }
}

// pathological synthetics
function deepSchema(levels) {
  let node = {
    type: "object",
    properties: {
      value: { type: "string", description: "leaf value", default: "x" },
      mode: { type: "string", enum: ["fast", "safe"], default: "safe" },
    },
    required: ["value"],
  };
  for (let i = levels - 1; i >= 1; i--) {
    node = {
      type: "object",
      properties: {
        [`level${i}`]: node,
        [`note${i}`]: { type: "string", description: `annotation for level ${i}` },
      },
      required: [`level${i}`],
    };
  }
  return node;
}
function wideSchema(n) {
  const properties = {};
  const required = [];
  for (let i = 0; i < n; i++) {
    const key = `param_${String(i).padStart(3, "0")}`;
    properties[key] = {
      type: i % 3 === 0 ? "string" : i % 3 === 1 ? "number" : "boolean",
      description: `parameter ${i} controls behavior facet ${i % 7}`,
      ...(i % 5 === 0 ? { default: i } : {}),
      ...(i % 11 === 0 ? { enum: ["a", "b", "c"] } : {}),
    };
    if (i % 4 === 0) required.push(key);
  }
  return { type: "object", properties, required };
}
function anyOfForest(branches, depth) {
  const leaf = (tag) => ({
    type: "object",
    properties: {
      kind: { type: "string", enum: [tag] },
      payload: { type: "string", description: `payload for ${tag}` },
    },
    required: ["kind"],
  });
  let branch = (i) => leaf(`b${i}`);
  for (let d = 1; d < depth; d++) {
    const prev = branch;
    branch = (i) => ({ anyOf: Array.from({ length: branches }, (_, j) => prev(`${i}.${j}`)) });
  }
  return {
    type: "object",
    properties: {
      target: { anyOf: Array.from({ length: branches }, (_, i) => branch(i)) },
      dry_run: { type: "boolean", default: false },
    },
    required: ["target"],
  };
}

const synthetics = [
  { id: "synthetic__deep6", name: "deep6", schema: deepSchema(6) },
  { id: "synthetic__wide200", name: "wide200", schema: wideSchema(200) },
  { id: "synthetic__anyof_forest", name: "anyOfForest(4 branches × 3 deep)", schema: anyOfForest(4, 3) },
];

const DEPTHS = [0, 1, 2, 3, 6];
const depthTable = [];
for (const subject of [...realSchemas, ...synthetics]) {
  const desc = `lab card for ${subject.name}`;
  const row = { id: subject.id, fullSchemaTokens: est(jchars(subject.schema)) };
  for (const d of DEPTHS) {
    const card = { id: subject.id, kind: "tool", description: desc, input: trimAtDepth(subject.schema, d) };
    row[`d${d}`] = est(jchars(card));
  }
  const fullCard = { id: subject.id, kind: "tool", description: desc, input: subject.schema };
  row.dFull = est(jchars(fullCard));
  depthTable.push(row);
}
const realRows = depthTable.slice(0, realSchemas.length);
const aggByDepth = {};
for (const d of [...DEPTHS.map((x) => `d${x}`), "dFull"]) {
  aggByDepth[d] = {
    realMeanTokens: +mean(realRows.map((r) => r[d])).toFixed(1),
    realMaxTokens: Math.max(...realRows.map((r) => r[d])),
  };
}

// what restoring structure costs, on exactly the tools that lose it at d1
const lossyIds = new Set(lossyTools.map((t) => t.id));
const lossyRows = realRows.filter((r) => lossyIds.has(r.id));
const lossyCost = {
  n: lossyRows.length,
  meanD1: +mean(lossyRows.map((r) => r.d1)).toFixed(1),
  meanD2: +mean(lossyRows.map((r) => r.d2)).toFixed(1),
  meanDFull: +mean(lossyRows.map((r) => r.dFull)).toFixed(1),
  d2OverD1Pct: +((mean(lossyRows.map((r) => r.d2)) / mean(lossyRows.map((r) => r.d1)) - 1) * 100).toFixed(1),
};

results.D_trimDepth = {
  d1ReproducesShipped: `${d1Matches}/${realSchemas.length}`,
  lossyToolsRestoreCost: lossyCost,
  droppedKeyCensusRealSchemas: censusTotal,
  lossyToolsAtD1: lossyTools,
  depthTokens: { aggregateReal: aggByDepth, perSchema: depthTable },
  syntheticNote: "synthetics are pathological inputs to trimming, not retrieval claims",
};
save();
say(`  real schemas: mean card tokens d0=${aggByDepth.d0.realMeanTokens} d1=${aggByDepth.d1.realMeanTokens} d2=${aggByDepth.d2.realMeanTokens} d3=${aggByDepth.d3.realMeanTokens} full=${aggByDepth.dFull.realMeanTokens}`);
say(`  tools losing structure at d1: ${lossyTools.length}/${realSchemas.length} (${lossyTools.map((t) => t.id).join(", ")})`);

await provider.dispose();
results.meta.finishedAt = new Date().toISOString();
save();
say(`\nresults → ${OUT}`);
