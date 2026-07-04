#!/usr/bin/env node
/**
 * exp-lexical-edges — Lexical/FTS5 edge cases, stopword pollution, query-safety fuzz.
 *
 * Sections:
 *  A. Tokenizer reality: 15 needs x {base, snake, camel, hyphen, plural, verbform}
 *     variants -> rank of the ground-truth tool in real CoachStore lexical retrieval.
 *  B. Stopword pollution: across the 66 shared needs, how often do stopword-only
 *     matches drive a wrong tool into the user-visible top-5 (draft k=5 default)?
 *  C. Query-safety fuzz: 220+ hostile needs through lexicalSearch + draftCandidates,
 *     plus raw-SQL-level MATCH probing (the store's catch hides SQL errors) and a
 *     token-count threshold search for FTS5 expression limits.
 *  D. lexicalSearch normalization at edges: 1 candidate, 2 candidates (worst gets
 *     score 0 and is dropped by draftCandidates' score>0 filter), all-equal ranks;
 *     plus sanitizer over-stripping probes (hyphen fragments, accents, c++, digits).
 *
 * REAL-ONLY: real CoachStore over real SQLite FTS5 (better-sqlite3), shared 133-tool
 * corpus, shared 66 ground-truthed needs. No embeddings needed — this charter measures
 * the lexical rung (the real cold-start production mode, needVec absent).
 *
 * Run from repo root:  node docs/lab/exp-lexical-edges.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "./corpus.mjs";
import { NEEDS } from "./needs.mjs";
import { rankedIds, hitAtK, reciprocalRank, mean, percentile } from "./metrics.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const coach = await import(
  createRequire(path.join(repo, "packages/cli/package.json")).resolve("@rosterhq/coach")
);
const { CoachStore, openCoachDb } = coach;

const results = { meta: {}, sectionA: {}, sectionB: {}, sectionC: {}, sectionD: {} };
const t0 = Date.now();

// ── helpers ────────────────────────────────────────────────────────────────
/** EXACT replica of the store's query sanitizer (store.ts lexicalSearch). */
const sanitizeTokens = (need) => [...new Set(need.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])];

const freshStore = (tools) => {
  const db = openCoachDb(":memory:");
  const store = new CoachStore(db);
  if (tools?.length) store.upsertCapabilities(tools);
  return { db, store };
};

const rankOf = (ids, target) => {
  const i = ids.indexOf(target);
  return i === -1 ? null : i + 1;
};
const bestRankOf = (ids, targets) => {
  const rs = targets.map((t) => rankOf(ids, t)).filter((r) => r !== null);
  return rs.length ? Math.min(...rs) : null;
};

// main store on the shared corpus
const { db, store } = freshStore(TOOLS);

results.meta = {
  date: new Date().toISOString(),
  node: process.version,
  sqlite: db.prepare("SELECT sqlite_version() v").get().v,
  corpusTools: TOOLS.length,
  needs: NEEDS.length,
  draftDefaultK: 5,
  note: "lexical-only mode (no needVec) — the real cold-start path before the embedding model warms",
};
console.log(`meta: ${JSON.stringify(results.meta)}`);

// per-token FTS match sets (exact attribution using FTS5's own tokenizer)
const tokenMatchCache = new Map();
const tokenMatches = (token) => {
  let s = tokenMatchCache.get(token);
  if (!s) {
    try {
      const rows = db
        .prepare("SELECT id FROM capability_fts WHERE capability_fts MATCH ?")
        .all(`"${token}"`);
      s = new Set(rows.map((r) => r.id));
    } catch {
      s = new Set();
    }
    tokenMatchCache.set(token, s);
  }
  return s;
};

// ── Section A: tokenizer variants ──────────────────────────────────────────
console.log("\n== Section A: tokenizer variants ==");
// 15 targets; base = natural-phrase form of the tool's own name words.
const A_CASES = [
  { tool: "fs__search_files", base: "search files", snake: "search_files", camel: "searchFiles", hyphen: "search-files", plural: "search file", verbform: "searching files" },
  { tool: "fs__read_text_file", base: "read text file", snake: "read_text_file", camel: "readTextFile", hyphen: "read-text-file", plural: "read text files", verbform: "reading text file" },
  { tool: "fs__write_file", base: "write file", snake: "write_file", camel: "writeFile", hyphen: "write-file", plural: "write files", verbform: "writing file" },
  { tool: "fs__create_directory", base: "create directory", snake: "create_directory", camel: "createDirectory", hyphen: "create-directory", plural: "create directories", verbform: "creating directory" },
  { tool: "fs__move_file", base: "move file", snake: "move_file", camel: "moveFile", hyphen: "move-file", plural: "move files", verbform: "moving file" },
  { tool: "git__git_commit", base: "commit", snake: "git_commit", camel: "gitCommit", hyphen: "git-commit", plural: "commits", verbform: "committing" },
  { tool: "git__git_create_branch", base: "create branch", snake: "create_branch", camel: "createBranch", hyphen: "create-branch", plural: "create branches", verbform: "creating branch" },
  { tool: "github__create_pull_request", base: "create pull request", snake: "create_pull_request", camel: "createPullRequest", hyphen: "create-pull-request", plural: "create pull requests", verbform: "creating pull request" },
  { tool: "github__merge_pull_request", base: "merge pull request", snake: "merge_pull_request", camel: "mergePullRequest", hyphen: "merge-pull-request", plural: "merge pull requests", verbform: "merging pull request" },
  { tool: "memory__create_entities", base: "create entities", snake: "create_entities", camel: "createEntities", hyphen: "create-entities", plural: "create entity", verbform: "creating entities" },
  { tool: "memory__search_nodes", base: "search nodes", snake: "search_nodes", camel: "searchNodes", hyphen: "search-nodes", plural: "search node", verbform: "searching nodes" },
  { tool: "slack__slack_post_message", base: "post message", snake: "post_message", camel: "postMessage", hyphen: "post-message", plural: "post messages", verbform: "posting message" },
  { tool: "playwright__browser_take_screenshot", base: "take screenshot", snake: "take_screenshot", camel: "takeScreenshot", hyphen: "take-screenshot", plural: "take screenshots", verbform: "taking screenshot" },
  { tool: "sqlite__list_tables", base: "list tables", snake: "list_tables", camel: "listTables", hyphen: "list-tables", plural: "list table", verbform: "listing tables" },
  { tool: "fs__get_file_info", base: "get file info", snake: "get_file_info", camel: "getFileInfo", hyphen: "get-file-info", plural: "get files info", verbform: "getting file info" },
];
const VARIANTS = ["base", "snake", "camel", "hyphen", "plural", "verbform"];

const aCases = [];
for (const c of A_CASES) {
  const row = { tool: c.tool, variants: {} };
  for (const v of VARIANTS) {
    const q = c[v];
    const lex = store.lexicalSearch(q, 30);
    const lexIds = lex.map((r) => r.id);
    const draft = rankedIds(store.draftCandidates(q, 10));
    row.variants[v] = {
      q,
      tokens: sanitizeTokens(q),
      nLex: lex.length,
      rankLex: rankOf(lexIds, c.tool),
      rankDraft10: rankOf(draft, c.tool),
    };
  }
  aCases.push(row);
}
const aSummary = {};
for (const v of VARIANTS) {
  const rows = aCases.map((c) => c.variants[v]);
  const found = rows.filter((r) => r.rankLex !== null);
  aSummary[v] = {
    n: rows.length,
    lexFoundRate: +(found.length / rows.length).toFixed(3),
    hit1: +mean(rows.map((r) => (r.rankLex === 1 ? 1 : 0))).toFixed(3),
    hit5: +mean(rows.map((r) => (r.rankLex !== null && r.rankLex <= 5 ? 1 : 0))).toFixed(3),
    mrrLex: +mean(rows.map((r) => (r.rankLex ? 1 / r.rankLex : 0))).toFixed(3),
    hit5draft: +mean(rows.map((r) => (r.rankDraft10 !== null && r.rankDraft10 <= 5 ? 1 : 0))).toFixed(3),
    meanRankWhenFound: found.length ? +mean(found.map((r) => r.rankLex)).toFixed(2) : null,
  };
  console.log(`  ${v.padEnd(8)} foundRate=${aSummary[v].lexFoundRate} hit1=${aSummary[v].hit1} hit5=${aSummary[v].hit5} mrr=${aSummary[v].mrrLex}`);
}

// camelCase-in-INDEX probe: real corpus has real camelCase tool names (everything server).
const camelIndexProbe = [];
for (const [q, target] of [
  ["long running operation", "everything__longRunningOperation"],
  ["longRunningOperation", "everything__longRunningOperation"],
  ["print env", "everything__printEnv"],
  ["printenv", "everything__printEnv"],
  ["sample llm", "everything__sampleLLM"],
  ["get tiny image", "everything__getTinyImage"],
]) {
  const lexIds = store.lexicalSearch(q, 30).map((r) => r.id);
  camelIndexProbe.push({ q, target, tokens: sanitizeTokens(q), rankLex: rankOf(lexIds, target), nLex: lexIds.length });
}

// FTS5 tokenizer ground-truth probes on a throwaway db
const probeDb = freshStore([
  { id: "p__snake", kind: "tool", source: "p", name: "search_files", description: "zzz", inputSchema: {} },
  { id: "p__camel", kind: "tool", source: "p", name: "searchFiles", description: "zzz", inputSchema: {} },
  { id: "p__plural", kind: "tool", source: "p", name: "qq", description: "many files here", inputSchema: {} },
  { id: "p__email", kind: "tool", source: "p", name: "send_note", description: "Send an email message", inputSchema: {} },
  { id: "p__cafe", kind: "tool", source: "p", name: "find_place", description: "Find a cafe nearby", inputSchema: {} },
]);
const probeMatch = (m) => {
  try {
    return probeDb.db.prepare("SELECT id FROM capability_fts WHERE capability_fts MATCH ?").all(m).map((r) => r.id);
  } catch (e) {
    return `ERR:${e.message}`;
  }
};
results.sectionA = {
  cases: aCases,
  summary: aSummary,
  camelIndexProbe,
  ftsTokenizerProbes: {
    'MATCH "search" (snake_files doc?)': probeMatch('"search"'),
    'MATCH "searchfiles" (camel doc?)': probeMatch('"searchfiles"'),
    'MATCH "file" (doc says files)': probeMatch('"file"'),
    'MATCH "mail" (doc says email)': probeMatch('"mail"'),
    'MATCH "caf" (doc says cafe)': probeMatch('"caf"'),
  },
};
console.log(`  camelIndexProbe: ${JSON.stringify(camelIndexProbe.map((p) => [p.q, p.rankLex]))}`);

// ── Section B: stopword pollution across the 66 shared needs ───────────────
console.log("\n== Section B: stopword pollution (66 needs, draft k=5) ==");
const STOP = new Set(["for", "the", "a", "in", "to", "my", "that"]); // charter set
const STOP_EXT = new Set([
  ...STOP, "an", "of", "and", "or", "on", "is", "it", "this", "with", "what", "from",
  "me", "do", "does", "we", "about", "which", "who", "how", "up", "so", "if", "as",
  "at", "be", "by", "am", "are", "was", "your", "our",
]);

const bPerNeed = [];
for (const nd of NEEDS) {
  const tokens = sanitizeTokens(nd.need);
  const lex = store.lexicalSearch(nd.need, 30);
  const draft5 = store.draftCandidates(nd.need, 5);
  const acceptableSources = new Set(nd.acceptable.map((id) => id.split("__")[0]));
  const slots = [];
  draft5.forEach((c, i) => {
    const id = c.entry.id;
    const matched = c.lexScore !== null ? tokens.filter((t) => tokenMatches(t).has(id)) : [];
    const stopOnly = c.lexScore !== null && matched.length > 0 && matched.every((t) => STOP.has(t));
    const stopOnlyExt = c.lexScore !== null && matched.length > 0 && matched.every((t) => STOP_EXT.has(t));
    slots.push({
      rank: i + 1,
      id,
      lexScore: c.lexScore,
      filler: c.lexScore === null,
      matched,
      stopOnly,
      stopOnlyExt,
      wrong: !nd.acceptable.includes(id),
      wrongSource: !acceptableSources.has(id.split("__")[0]),
    });
  });
  const contaminants = slots.filter((s) => s.stopOnly && s.wrong);
  const contaminantsExt = slots.filter((s) => s.stopOnlyExt && s.wrong);
  const draftIds = slots.map((s) => s.id);
  const bestPrimary = bestRankOf(draftIds, nd.primary);
  bPerNeed.push({
    need: nd.need.length > 70 ? `${nd.need.slice(0, 70)}…` : nd.need,
    style: nd.style,
    tokens,
    stopTokensInNeed: tokens.filter((t) => STOP.has(t)),
    nLex: lex.length,
    slots,
    nContaminants: contaminants.length,
    nContaminantsExt: contaminantsExt.length,
    nFillers: slots.filter((s) => s.filler).length,
    contaminantOutranksPrimary: contaminants.some((s) => bestPrimary === null || s.rank < bestPrimary),
    bestPrimaryRank: bestPrimary,
  });
}
const totalSlots = bPerNeed.reduce((a, r) => a + r.slots.length, 0);
const allContaminantSlots = bPerNeed.flatMap((r) => r.slots.filter((s) => s.stopOnly && s.wrong).map((s) => ({ need: r.need, ...s })));
const allContaminantSlotsExt = bPerNeed.flatMap((r) => r.slots.filter((s) => s.stopOnlyExt && s.wrong).map((s) => ({ need: r.need, ...s })));
const memNeeds = bPerNeed.filter((r) => NEEDS.find((n) => n.need.startsWith(r.need.replace("…", ""))) && r.need.match(/remember|know about this person|save a fact|link these|forget|Persist/i));
const bSummary = {
  needsWithStopOnlyContaminantTop5: bPerNeed.filter((r) => r.nContaminants > 0).length,
  needsWithStopOnlyContaminantTop5_rate: +(bPerNeed.filter((r) => r.nContaminants > 0).length / NEEDS.length).toFixed(3),
  contaminatedSlotRate: +(allContaminantSlots.length / totalSlots).toFixed(3),
  contaminatedSlots: allContaminantSlots.length,
  totalSlots,
  extSet: {
    needsWithContaminant: bPerNeed.filter((r) => r.nContaminantsExt > 0).length,
    rate: +(bPerNeed.filter((r) => r.nContaminantsExt > 0).length / NEEDS.length).toFixed(3),
    slots: allContaminantSlotsExt.length,
    slotRate: +(allContaminantSlotsExt.length / totalSlots).toFixed(3),
  },
  contaminantOutranksPrimaryCount: bPerNeed.filter((r) => r.contaminantOutranksPrimary).length,
  needsWithFillerInTop5: bPerNeed.filter((r) => r.nFillers > 0).length,
  fillerSlots: bPerNeed.reduce((a, r) => a + r.nFillers, 0),
  stopTokenNeedCoverage: bPerNeed.filter((r) => r.stopTokensInNeed.length > 0).length,
  memoryNeedsWithFsTop5StopOnly: bPerNeed.filter(
    (r) => /memory/.test(JSON.stringify(NEEDS.find((n) => r.need.startsWith(n.need.slice(0, 30)))?.primary ?? "")) &&
      r.slots.some((s) => s.stopOnly && s.id.startsWith("fs__")),
  ).length,
  worstExamples: allContaminantSlotsExt
    .sort((x, y) => x.rank - y.rank)
    .slice(0, 12)
    .map((s) => ({ need: s.need, id: s.id, rank: s.rank, matched: s.matched, lexScore: +(s.lexScore ?? 0).toFixed(3) })),
};
results.sectionB = { stopSet: [...STOP], stopSetExt: [...STOP_EXT], perNeed: bPerNeed, summary: bSummary };
console.log(`  charter-set contamination: ${bSummary.needsWithStopOnlyContaminantTop5}/${NEEDS.length} needs, ${allContaminantSlots.length}/${totalSlots} slots`);
console.log(`  extended-set contamination: ${bSummary.extSet.needsWithContaminant}/${NEEDS.length} needs, ${bSummary.extSet.slots}/${totalSlots} slots`);
console.log(`  fillers in top-5: ${bSummary.needsWithFillerInTop5} needs / ${bSummary.fillerSlots} slots`);

// ── Section C: query-safety fuzz ───────────────────────────────────────────
console.log("\n== Section C: query-safety fuzz ==");
const fuzz = [];
const add = (cat, s) => fuzz.push({ cat, s });

// 1. FTS5 operator abuse
for (const s of [
  "AND", "OR", "NOT", "NEAR", "a AND b", "read AND file", "read OR file", "NOT file",
  "NEAR(read file, 5)", "name:read", "description:file", 'name : read', '"phrase query"',
  '"unterminated', "file*", "*file", "^file", "(file)", "((file", "file NOT", "AND AND OR NOT NEAR",
  "{name description}: file", "read + file", "read - file", "-read", "+read", "~read",
  "read NEAR/3 file", '""', '""""', 'a"b', "'read' OR 'file'", "MATCH", "bm25", "rank:1",
]) add("fts-operators", s);
// 2. SQL injection shapes
for (const s of [
  "'; DROP TABLE capability; --", '" OR 1=1 --', "'--", '"; DELETE FROM capability_fts; --',
  "Robert'); DROP TABLE students;--", "1; ATTACH DATABASE '/tmp/pwn' AS pwn",
  "%' UNION SELECT id FROM capability --", "' OR '1'='1", "`; SELECT 1; `", ";;;;",
  "PRAGMA integrity_check", "UNION SELECT password FROM users", "INSERT INTO capability VALUES(1)",
  "x'||'y", "0x27 0x22 0x60",
]) add("sql-injection", s);
// 3. quotes
for (const s of ['"', "'", "''", `don't`, 'she said "hi"', '\\"escaped\\"', "`backticks`",
  "«guillemets»", "“smart quotes”", `mix"'ed'"`]) add("quotes", s);
// 4. unicode
for (const s of [
  "在网上搜索最新的AI新闻", "ファイルを読む", "파일 읽기", "اقرأ الملف", "קרא קובץ",
  "прочитать файл", "διάβασε το αρχείο", "อ่านไฟล์", "फ़ाइल पढ़ें", "café résumé naïve",
  "Z̴̢a̷l̶g̵o̸ text", "‮gnihtemos", "a‍b‌c",
  "﻿bom start", "nbsp token", "line sep arators", "ＡＢＣ　１２３",
  "İstanbul ıŞık", "straße GROẞ", "ﬁle ﬂow", "𝕊𝕖𝕒𝕣𝕔𝕙 𝑓𝑖𝑙𝑒𝑠", "🄰🄱🄲", "��",
  "￿", "ê", // single accented char
]) add("unicode", s);
// lone surrogates (constructed to dodge source-encoding issues)
add("unicode", String.fromCharCode(0xd800));
add("unicode", `a${String.fromCharCode(0xdc00)}b`);
// 5. emoji
for (const s of ["🔥", "🔥🔥🔥", "search 🔍 files", "🇺🇸🇩🇪", "👨‍👩‍👧‍👦", "👍🏽",
  "😀'; DROP TABLE--", "1️⃣ 2️⃣", "emoji 🎉 party 🎊 time", "🧑‍💻 code"]) add("emoji", s);
// 6. whitespace / empty
for (const s of ["", " ", "  ", "\n", "\n\n\n", "\t", "\r\n", "\r", " \t\n\r ", "\v\f",
  " ", " ".repeat(1000)]) add("whitespace", s);
// 7. control chars
for (const s of ["\x00", "a\x00b", "\x00\x00", "\x01\x02\x03", "bell\x07", "\x08back",
  "\x1b[31mred", "\x7f", "del\x7fete"]) add("control", s);
// 8. long inputs
add("long", "a".repeat(10240));
add("long", Array.from({ length: 2000 }, (_, i) => `tok${i}q`).join(" ")); // ~2000 unique tokens
add("long", '"'.repeat(10240));
add("long", "🔥".repeat(2560));
add("long", "搜".repeat(10240));
add("long", ("read file " + "x".repeat(90) + " ").repeat(100)); // 10KB mixed with real tokens
add("long", "b".repeat(102400)); // 100KB single token
add("long", Array.from({ length: 5000 }, (_, i) => `zz${i}k`).join(" ")); // 5000 unique tokens
add("long", "AND OR NOT ".repeat(930)); // ~10KB of operators
add("long", "\n".repeat(10240));
// 9. pathological formats
for (const s of [
  "../../etc/passwd", "C:\\Windows\\System32\\cmd.exe", "%s%s%s%n", "{{template.injection}}",
  "${env:HOME}", "$(rm -rf /)", "`rm -rf /`", "<script>alert(1)</script>", '<?xml version="1.0"?>',
  '{"a": "b", "c": [1,2,3]}', "\\u0000", "NaN", "undefined", "null", "__proto__", "constructor",
  "(a+)+$ regex bomb", "file:///etc/hosts", "javascript:alert(1)",
]) add("format", s);
// 10. numeric edges
for (const s of ["0", "00", "0 0 0", "9999999999999999999999", "1e308", "0x41414141",
  "3.14159", "-0"]) add("numeric", s);
// 11. repeated stopwords
for (const s of ["the the the the", "for for for", "to to to to to to", "the ".repeat(500),
  "a a a a a"]) add("stopword-repeat", s);
// 12. realistic hostile
for (const s of [
  "what's up?", 'search for "config.yaml" AND edit it', "file: read (urgent!)",
  "NOT sure what I need", "NEAR the top of the file", "OR maybe create one?",
  "use the AND operator in my query", "c++ code", ".gitignore", "node_modules/**",
  "email e-mail", "read file's contents", "50% off sale page", "a+b=c",
]) add("realistic", s);
// 13. every ASCII punctuation char as its own need
for (const ch of "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~") add("punct-single", ch);

console.log(`  fuzz corpus size: ${fuzz.length}`);

const fuzzRows = [];
let threw = [];
let rawSqlErrors = [];
for (const f of fuzz) {
  const tokens = sanitizeTokens(f.s);
  const row = {
    cat: f.cat,
    preview: JSON.stringify(f.s.length > 50 ? f.s.slice(0, 50) + "…" : f.s),
    len: f.s.length,
    nTokens: tokens.length,
  };
  // raw SQL-level probe: does the MATCH string the store would build error at the
  // SQL layer (the store's catch would hide it)?
  if (tokens.length > 0) {
    const match = tokens.map((t) => `"${t}"`).join(" OR ");
    try {
      db.prepare("SELECT id, bm25(capability_fts) AS rank FROM capability_fts WHERE capability_fts MATCH ? ORDER BY rank LIMIT 30").all(match);
      row.rawSqlOk = true;
    } catch (e) {
      row.rawSqlOk = false;
      row.rawSqlErr = e.message.slice(0, 120);
      rawSqlErrors.push({ preview: row.preview, cat: f.cat, nTokens: tokens.length, err: row.rawSqlErr });
    }
  }
  let t;
  try {
    t = performance.now();
    const lex = store.lexicalSearch(f.s, 30);
    row.lexMs = +(performance.now() - t).toFixed(2);
    row.lexN = lex.length;
  } catch (e) {
    row.lexThrew = `${e.name}: ${e.message.slice(0, 200)}`;
    threw.push({ api: "lexicalSearch", input: f.s.slice(0, 200), cat: f.cat, err: row.lexThrew });
  }
  try {
    t = performance.now();
    const draft = store.draftCandidates(f.s, 5);
    row.draftMs = +(performance.now() - t).toFixed(2);
    row.draftN = draft.length;
    row.draftTop1 = draft[0]?.entry.id ?? null;
    row.draftAllFiller = draft.length > 0 && draft.every((c) => c.lexScore === null);
  } catch (e) {
    row.draftThrew = `${e.name}: ${e.message.slice(0, 200)}`;
    threw.push({ api: "draftCandidates", input: f.s.slice(0, 200), cat: f.cat, err: row.draftThrew });
  }
  fuzzRows.push(row);
}
const draftMss = fuzzRows.filter((r) => r.draftMs !== undefined).map((r) => r.draftMs);
const slowest = [...fuzzRows].sort((a, b) => (b.draftMs ?? 0) - (a.draftMs ?? 0)).slice(0, 8)
  .map((r) => ({ cat: r.cat, preview: r.preview.slice(0, 40), len: r.len, nTokens: r.nTokens, draftMs: r.draftMs, lexMs: r.lexMs }));

// token-count threshold: at how many OR terms does raw FTS5 MATCH start erroring?
const rawMatchAt = (n) => {
  const match = Array.from({ length: n }, (_, i) => `"qq${i}z"`).join(" OR ");
  try {
    db.prepare("SELECT id FROM capability_fts WHERE capability_fts MATCH ? LIMIT 1").all(match);
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e.message.slice(0, 120) };
  }
};
let lo = 1, hi = 30000, firstFail = null, failErr = null;
if (!rawMatchAt(hi).ok) {
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const r = rawMatchAt(mid);
    if (r.ok) lo = mid + 1;
    else { hi = mid; failErr = r.err; }
  }
  firstFail = lo;
} else {
  firstFail = null; // no limit up to 30000
}
// store-level behavior at/around the threshold + realistic pasted-junk scenario
let thresholdBehavior = null;
if (firstFail) {
  const okN = firstFail - 1;
  const mkNeed = (n) => Array.from({ length: n }, (_, i) => `qq${i}z`).join(" ");
  const tOk = performance.now();
  const lexOkN = store.lexicalSearch(mkNeed(okN), 30).length;
  const msOk = +(performance.now() - tOk).toFixed(1);
  const lexFailN = store.lexicalSearch(mkNeed(firstFail), 30).length; // catch swallows -> []
  // realistic: relevant sentence + pasted junk beyond threshold
  const junkNeed = "read the contents of a text file " + mkNeed(firstFail);
  const junkLex = store.lexicalSearch(junkNeed, 30);
  const junkDraft = store.draftCandidates(junkNeed, 5);
  const controlDraft = store.draftCandidates("read the contents of a text file", 5);
  thresholdBehavior = {
    firstFailingTokenCount: firstFail,
    sqlError: failErr,
    charsAtThreshold: mkNeed(firstFail).length,
    lexResultsAtThresholdMinus1: lexOkN,
    msAtThresholdMinus1: msOk,
    lexResultsAtThreshold: lexFailN,
    realisticPastedJunk: {
      needPreview: junkNeed.slice(0, 80) + "…",
      needChars: junkNeed.length,
      lexN: junkLex.length,
      draftTop5: rankedIds(junkDraft),
      draftAllFiller: junkDraft.every((c) => c.lexScore === null),
      controlTop5: rankedIds(controlDraft),
    },
  };
}

// DB integrity after the entire fuzz barrage
const integrity = {
  integrityCheck: db.prepare("PRAGMA integrity_check").get(),
  capabilityCount: db.prepare("SELECT COUNT(*) c FROM capability").get().c,
  ftsCount: db.prepare("SELECT COUNT(*) c FROM capability_fts").get().c,
  sentinelStillWorks: store.lexicalSearch("read text file", 5).length,
};
results.sectionC = {
  totalInputs: fuzz.length,
  threwCount: threw.length,
  threw,
  rawSqlWouldErrorCount: rawSqlErrors.length,
  rawSqlErrors: rawSqlErrors.slice(0, 20),
  timing: {
    draftMsP50: percentile(draftMss, 50),
    draftMsP95: percentile(draftMss, 95),
    draftMsMax: Math.max(...draftMss),
    slowest,
  },
  emptyTokenBehavior: {
    note: "inputs producing 0 tokens skip FTS entirely; draftCandidates then returns rating/recency filler",
    zeroTokenInputs: fuzzRows.filter((r) => r.nTokens === 0).length,
    fillerDraftExamples: fuzzRows.filter((r) => r.nTokens === 0 && r.draftN > 0).slice(0, 5)
      .map((r) => ({ preview: r.preview, draftN: r.draftN, top1: r.draftTop1, allFiller: r.draftAllFiller })),
  },
  orTermThreshold: { firstFail, failErr, thresholdBehavior },
  integrity,
  rows: fuzzRows,
};
console.log(`  throws: ${threw.length}; raw-SQL-level errors (hidden by catch): ${rawSqlErrors.length}`);
console.log(`  OR-term threshold: firstFail=${firstFail} err=${failErr}`);
console.log(`  integrity: ${JSON.stringify(integrity)}`);

// ── Section D: normalization edges + sanitizer over-strip ──────────────────
console.log("\n== Section D: normalization edges ==");

// D1: exactly 1 lexical candidate
const d1 = freshStore([
  { id: "m__quick", kind: "tool", source: "m", name: "quicksort_run", description: "Sort numbers with quicksort", inputSchema: {} },
  { id: "m__other1", kind: "tool", source: "m", name: "alpha_one", description: "unrelated thing one", inputSchema: {} },
  { id: "m__other2", kind: "tool", source: "m", name: "beta_two", description: "unrelated thing two", inputSchema: {} },
]);
const d1lex = d1.store.lexicalSearch("quicksort", 10);
const d1draft = d1.store.draftCandidates("quicksort", 3);
results.sectionD.d1_singleCandidate = {
  lex: d1lex,
  draft: d1draft.map((c) => ({ id: c.entry.id, score: +c.score.toFixed(3), lexScore: c.lexScore })),
};
console.log(`  D1 single: lex=${JSON.stringify(d1lex)}`);

// D2 mini: exactly 2 lexical candidates — worst gets normalized to 0 and dropped
const d2tools = [
  { id: "alpha__export_csv", kind: "tool", source: "alpha", name: "export_csv", description: "Export a table as csv", inputSchema: {} },
  { id: "beta__dump_table", kind: "tool", source: "beta", name: "dump_table", description: "Dump a table to disk in csv format among other formats and options for archival purposes", inputSchema: {} },
  { id: "gamma__unrelated_a", kind: "tool", source: "gamma", name: "rotate_logs", description: "Rotate log entries", inputSchema: {} },
  { id: "gamma__unrelated_b", kind: "tool", source: "gamma", name: "clean_cache", description: "Clean cached artifacts", inputSchema: {} },
  { id: "gamma__unrelated_c", kind: "tool", source: "gamma", name: "ping_host", description: "Ping a remote host", inputSchema: {} },
];
const d2 = freshStore(d2tools);
// give the unrelated tools real ratings so ratedFallback prefers them
for (let i = 0; i < 5; i++) {
  for (const cap of ["gamma__unrelated_a", "gamma__unrelated_b", "gamma__unrelated_c"]) {
    d2.store.recordOutcome({ session: `s${i}`, source: "gamma", capability: cap, outcomeClass: "success", latencyMs: 20 });
  }
}
d2.store.recomputeRatings();
const d2lex = d2.store.lexicalSearch("csv", 10);
const d2draft5 = d2.store.draftCandidates("csv", 5);
const d2draft2 = d2.store.draftCandidates("csv", 2);
results.sectionD.d2_twoCandidates = {
  lex: d2lex,
  draft5: d2draft5.map((c) => ({ id: c.entry.id, score: +c.score.toFixed(3), lexScore: c.lexScore })),
  draft2: d2draft2.map((c) => ({ id: c.entry.id, score: +c.score.toFixed(3), lexScore: c.lexScore })),
  worstLexId: d2lex.find((r) => r.lexScore === 0)?.id ?? null,
  worstDroppedFromDraft2: !d2draft2.some((c) => c.entry.id === d2lex.find((r) => r.lexScore === 0)?.id),
  worstPositionInDraft5: rankOf(d2draft5.map((c) => c.entry.id), d2lex.find((r) => r.lexScore === 0)?.id),
};
console.log(`  D2 two-candidate: lex=${JSON.stringify(d2lex.map((r) => [r.id, r.lexScore]))}`);
console.log(`  D2 draft2=${JSON.stringify(d2draft2.map((c) => c.entry.id))} draft5=${JSON.stringify(d2draft5.map((c) => c.entry.id))}`);

// D3: all-equal ranks (identical docs) — span==0 path
const d3 = freshStore([
  { id: "x__t1", kind: "tool", source: "x", name: "widget_maker", description: "Make a widget", inputSchema: {} },
  { id: "x__t2", kind: "tool", source: "x", name: "widget_maker", description: "Make a widget", inputSchema: {} },
  { id: "x__t3", kind: "tool", source: "x", name: "widget_maker", description: "Make a widget", inputSchema: {} },
]);
const d3lex = d3.store.lexicalSearch("widget", 10);
const d3draft = d3.store.draftCandidates("widget", 3);
results.sectionD.d3_allEqual = {
  lex: d3lex,
  draftN: d3draft.length,
  allKept: d3draft.length === 3 && d3draft.every((c) => c.score === 1),
};
console.log(`  D3 all-equal: ${JSON.stringify(d3lex)} draftN=${d3draft.length}`);

// D2-real: across the 66 needs on the full corpus, how often does the score>0
// filter drop the worst lexical match out of the user-visible top-5?
let droppedWorstCases = [];
let benchRows = [];
for (const nd of NEEDS) {
  const lex = store.lexicalSearch(nd.need, 30);
  const lexIds = lex.map((r) => r.id);
  const draft5ids = rankedIds(store.draftCandidates(nd.need, 5));
  benchRows.push({
    style: nd.style,
    hit1: hitAtK(draft5ids, nd.acceptable, 1),
    hit5: hitAtK(draft5ids, nd.acceptable, 5),
    rr: reciprocalRank(draft5ids, nd.primary),
    lexHit5: hitAtK(lexIds.slice(0, 5), nd.acceptable, 5),
    lexRr: reciprocalRank(lexIds, nd.primary),
  });
  if (lex.length >= 2 && lex.length <= 5) {
    const worst = lex.filter((r) => r.lexScore === 0).map((r) => r.id);
    for (const w of worst) {
      const inDraft = draft5ids.includes(w);
      droppedWorstCases.push({
        need: nd.need.slice(0, 60),
        nLex: lex.length,
        worstId: w,
        lexRankOfWorst: rankOf(lexIds, w),
        stillInDraft5: inDraft,
        draftPos: rankOf(draft5ids, w),
        wasAcceptable: nd.acceptable.includes(w),
        wasPrimary: nd.primary.includes(w),
      });
    }
  }
}
const dropped = droppedWorstCases.filter((c) => !c.stillInDraft5);
results.sectionD.d2_real = {
  needsWithLex2to5: droppedWorstCases.length,
  worstDroppedFromTop5: dropped.length,
  droppedAcceptable: droppedWorstCases.filter((c) => !c.stillInDraft5 && c.wasAcceptable),
  droppedPrimary: droppedWorstCases.filter((c) => !c.stillInDraft5 && c.wasPrimary),
  displacedButReappeared: droppedWorstCases.filter((c) => c.stillInDraft5 && c.draftPos !== c.lexRankOfWorst),
  cases: droppedWorstCases,
  benchmark: {
    draftTop5: {
      hit5: +mean(benchRows.map((r) => r.hit5)).toFixed(3),
      mrr: +mean(benchRows.map((r) => r.rr)).toFixed(3),
    },
    rawLexicalTop5: {
      hit5: +mean(benchRows.map((r) => r.lexHit5)).toFixed(3),
      mrr: +mean(benchRows.map((r) => r.lexRr)).toFixed(3),
    },
  },
};
console.log(`  D2-real: ${droppedWorstCases.length} worst-of-2..5 cases; dropped from top5: ${dropped.length}; acceptable dropped: ${results.sectionD.d2_real.droppedAcceptable.length}`);
console.log(`  bench draft5 hit5=${results.sectionD.d2_real.benchmark.draftTop5.hit5} vs rawLex hit5=${results.sectionD.d2_real.benchmark.rawLexicalTop5.hit5}`);

// Sanitizer over-strip probes (on probe db + real corpus)
const overStrip = [];
const probeLex = (st, q) => st.lexicalSearch(q, 10).map((r) => r.id);
overStrip.push({ q: "email", tokens: sanitizeTokens("email"), hits: probeLex(probeDb.store, "email") });
overStrip.push({ q: "e-mail", tokens: sanitizeTokens("e-mail"), hits: probeLex(probeDb.store, "e-mail") });
overStrip.push({ q: "cafe", tokens: sanitizeTokens("cafe"), hits: probeLex(probeDb.store, "cafe") });
overStrip.push({ q: "café", tokens: sanitizeTokens("café"), hits: probeLex(probeDb.store, "café") });
overStrip.push({ q: "c++ code", tokens: sanitizeTokens("c++ code"), hits: probeLex(probeDb.store, "c++ code") });
overStrip.push({ q: "final-report.txt", tokens: sanitizeTokens("final-report.txt") });
overStrip.push({ q: "add 3 and 4", tokens: sanitizeTokens("add 3 and 4"),
  draftTop5RealCorpus: rankedIds(store.draftCandidates("add 3 and 4", 5)),
  rankOfEverythingAdd: rankOf(store.lexicalSearch("add 3 and 4", 30).map((r) => r.id), "everything__add") });
overStrip.push({ q: "résumé", tokens: sanitizeTokens("résumé") });
overStrip.push({ q: "naïve approach", tokens: sanitizeTokens("naïve approach") });
results.sectionD.sanitizerOverStrip = overStrip;
console.log(`  over-strip: ${JSON.stringify(overStrip.slice(0, 5))}`);

// ── write results ──────────────────────────────────────────────────────────
results.meta.runMs = Date.now() - t0;
const out = path.join(here, "results-lexical-edges.json");
fs.writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`\nresults → ${out} (${results.meta.runMs}ms total)`);
