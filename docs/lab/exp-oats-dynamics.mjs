#!/usr/bin/env node
/**
 * OATS dynamics — PHASE 2 (main): real MiniLM vectors, real CoachStore SQLite,
 * real runOats. Sections:
 *   a) sensitivity curve N=1..12 successes for 3 weak-baseline tools
 *   b) idempotence/drift of runOats ×30 on unchanged data (+ chained oatsAdjust)
 *   c) destructive interference: one tool, two orthogonal need families
 *   d) negatives: β push-away for a confusable wrong tool (+ failures-only case)
 *   e) poisoning: 1..5 mislabeled successes on a wrong tool + recovery
 *   f) 0.15 abstain gate after realistic light usage (and micro-corpus contrast)
 *
 * Targets chosen from measured phase-1 baseline (results-oats-dynamics.json):
 *   memory__add_observations (hybrid rank 108), linear__linear_list_issues (102),
 *   sqlite__read_query (74); wrong-tool git__git_show (#1 for config.yaml need);
 *   poison pair brave__brave_web_search vs memory__search_nodes (dense rank 4).
 *
 * Run: node docs/lab/exp-oats-dynamics.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const coach = await import(
  createRequire(path.join(repo, "packages/cli/package.json")).resolve("@rosterhq/coach")
);
const {
  CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL,
  cosine, oatsAdjust, normalize, hashNeed,
} = coach;
const { TOOLS } = await import(path.join(here, "corpus.mjs"));
const { NEEDS } = await import(path.join(here, "needs.mjs"));
const { rankedIds, hitAtK, reciprocalRank, summarize, mean } = await import(path.join(here, "metrics.mjs"));

const T_START = Date.now();
const SOURCE_OF = new Map(TOOLS.map((t) => [t.id, t.source]));

// ── need families (train strictly disjoint from held-out evals) ─────────────
const FAM = {
  MEMPREF: { // target memory__add_observations — baseline hybrid rank 108
    train: [
      "remember that i prefer tabs over spaces",
      "note down that the user's favorite editor is vim",
      "keep in mind that i like concise answers",
      "don't forget that my deploy day is friday",
      "remember my preferred language is typescript",
      "store the fact that i use a mac",
      "make a note that the user dislikes emojis",
      "remember that meetings should never be before 10am",
      "keep track of the fact that i'm in the toronto timezone",
      "note that my team's standup is at 9:30",
      "remember that i prefer metric units",
      "note for later that the user's dog is named biscuit",
    ],
    evals: [
      "remember that the user prefers dark mode", // shared needs.mjs row
      "keep in mind for next time that i hate autoplay videos",
      "note that my preferred meeting length is 25 minutes",
      "remember this preference: no notifications after 6pm",
    ],
  },
  MYWORK: { // target linear__linear_list_issues — baseline hybrid rank 102
    train: [
      "what tickets are assigned to me",
      "show my open issues in the tracker",
      "list everything i'm supposed to be working on",
      "what are my current tasks this cycle",
      "which tickets are still open under my name",
      "show me my backlog for this iteration",
      "what work items do i have in flight",
      "list my unfinished tickets",
      "what did the team assign to me this week",
      "show all issues currently assigned to my account",
      "what's left on my task list for the sprint",
      "which work items are waiting on me",
    ],
    evals: [
      "what's on my plate this sprint", // shared needs.mjs row
      "what am i responsible for delivering right now",
      "pull up the stuff i still owe the team",
      "anything outstanding with my name on it",
    ],
  },
  ANALYTICS: { // target sqlite__read_query — baseline hybrid rank 74
    train: [
      "how many orders did we get yesterday",
      "what's the average session length this month",
      "count the active subscribers in the database",
      "which product had the most sales last quarter",
      "how many rows are in the events table for june",
      "what fraction of users churned in the last 30 days",
      "give me the top ten customers by revenue",
      "how many signups came from the mobile app",
      "what was our daily active user count on monday",
      "sum the invoice totals for q2",
      "how many refunds were issued this week",
      "what percentage of carts got abandoned",
    ],
    evals: [
      "how many users signed up last week", // shared needs.mjs row
      "what's the median purchase amount this year",
      "how many trial accounts converted to paid",
      "count logins per day over the past month",
    ],
  },
  SCRAPE: { // fetch__fetch family A
    train: [
      "grab the readable text from this web page",
      "download the article body from that link",
      "get the raw html of this page for parsing",
      "fetch the contents of that documentation page",
      "retrieve the page text so i can summarize it",
      "load that url and give me what it says",
    ],
    evals: [
      "pull the text content of that url", // shared needs.mjs row
      "get me the words on that webpage",
      "read this link and hand me the plain text",
    ],
  },
  POLL: { // fetch__fetch family B (orthogonal use of the same tool)
    train: [
      "poll the status endpoint every minute until it's healthy",
      "hit the api health check and tell me the json it returns",
      "check the deployment status api again",
      "call the rest endpoint and report the status code",
      "query the service heartbeat url repeatedly",
      "ping the webhook endpoint to confirm it responds",
    ],
    evals: [
      "keep checking the health api until the service comes back up",
      "what does the status endpoint return right now",
      "watch the uptime api for changes",
    ],
  },
  LOCALREAD: { // right tool fs__read_text_file; measured wrong tool git__git_show
    train: [
      "show me the contents of settings.json",
      "what's inside the dockerfile",
      "open package.json and show me what it says",
      "display the contents of the env file",
      "let me see what's in tsconfig.json",
    ],
    evals: [
      "show me what's inside config.yaml", // shared needs.mjs row (baseline: right tool rank 60, git__git_show #1)
      "what does the makefile contain",
      "print the contents of readme.md",
    ],
  },
  GITSHOW: { // git__git_show's OWN legit family (gives it the ≥4 positives β needs)
    train: [
      "show me what commit abc123 changed",
      "display the diff introduced by that commit",
      "what did the last commit actually modify",
      "show the patch for commit 9f8e7d",
      "inspect the changes in that specific commit",
    ],
    evals: [],
  },
  WEBSEARCH: { // right tool brave__brave_web_search; poison tool memory__search_nodes
    train: [
      "search the web for rust async tutorials",
      "look up the current weather in berlin online",
      "find recent news about the eu ai act",
      "google the release date of the next ubuntu lts",
      "search online for postgres 17 breaking changes",
      "find articles about vector database benchmarks",
      "look up reviews of the framework laptop",
      "search for the official python 3.13 changelog",
      "what does the internet say about m4 macbook thermals",
      "find documentation pages about oauth device flow",
      "search the news for chip export restrictions",
      "look up flight prices to tokyo online",
    ],
    evals: [
      "search the web for the latest node lts version", // shared needs.mjs row
      "find out online when the next solar eclipse is",
      "search for benchmarks comparing sqlite and duckdb",
      "look up the npm weekly downloads for react",
    ],
  },
};

// ── embed everything once (real MiniLM; production text formats) ────────────
const provider = new TransformersEmbeddings(MINILM_MODEL);
const BATCH = 16;
async function embedAll(texts, kind) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) out.push(...(await provider.embed(texts.slice(i, i + BATCH), kind)));
  return out;
}
const cardVecs = await embedAll(TOOLS.map((t) => `${t.name}\n${t.description}\n`.slice(0, 2000)), "document");

const allNeedStrings = [...new Set([
  ...Object.values(FAM).flatMap((f) => [...f.train, ...f.evals]),
  ...NEEDS.map((n) => n.need),
])];
const needVecList = await embedAll(allNeedStrings, "query");
const VEC = new Map(allNeedStrings.map((s, i) => [s, needVecList[i]]));
const vecOf = (s) => { const v = VEC.get(s); if (!v) throw new Error(`no vec for: ${s}`); return v; };
console.log(`embedded ${TOOLS.length} cards + ${allNeedStrings.length} needs in ${Date.now() - T_START}ms`);

// ── harness helpers (all real CoachStore/SQLite) ─────────────────────────────
let sessionCounter = 0;
function freshStore() {
  const db = openCoachDb(":memory:");
  const store = new CoachStore(db);
  store.upsertCapabilities(TOOLS);
  TOOLS.forEach((t, i) => store.storeBaseVec(t.id, cardVecs[i]));
  return { db, store };
}
function seed(store, tool, needStr, cls) {
  const nh = hashNeed(needStr);
  store.storeNeedVec(nh, vecOf(needStr));
  store.recordOutcome({
    session: `s${sessionCounter++}`, source: SOURCE_OF.get(tool), capability: tool,
    outcomeClass: cls, latencyMs: 40, needHash: nh,
  });
}
const seedOk = (store, tool, n) => seed(store, tool, n, "success");
const seedFail = (store, tool, n) => seed(store, tool, n, "tool_fail:other");
/** the real nightly job pair */
function nightly(store) { store.recomputeRatings(); return store.runOats(); }

function hybridRank(store, tool, needStr) {
  const cands = store.draftCandidates(needStr, TOOLS.length, vecOf(needStr));
  const idx = cands.findIndex((c) => c.entry.id === tool);
  return { rank: idx === -1 ? null : idx + 1, scored: idx === -1 ? false : cands[idx].score > 0, top1: cands[0]?.entry.id };
}
function denseRank(store, tool, needStr) {
  const nv = vecOf(needStr);
  const scored = [...store.loadVecs()].map(([id, v]) => [id, cosine(nv, v)]).sort((a, b) => b[1] - a[1]);
  const idx = scored.findIndex(([id]) => id === tool);
  return { rank: idx + 1, cos: +scored[idx][1].toFixed(4), span: +(scored[0][1] - scored[scored.length - 1][1]).toFixed(4), top1: scored[0][0] };
}
function evalTool(store, tool, evalNeeds) {
  const rows = evalNeeds.map((n) => {
    const h = hybridRank(store, tool, n);
    const d = denseRank(store, tool, n);
    return { need: n, hybrid: h.rank, scored: h.scored, hybridTop1: h.top1, dense: d.rank, cos: d.cos, span: d.span };
  });
  return {
    rows,
    meanHybrid: +mean(rows.map((r) => r.hybrid)).toFixed(1),
    meanDense: +mean(rows.map((r) => r.dense)).toFixed(1),
    meanCos: +mean(rows.map((r) => r.cos)).toFixed(4),
    hit1: rows.filter((r) => r.hybrid === 1).length,
  };
}
const l2 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };

const outPath = path.join(here, "results-oats-dynamics.json");
const results = JSON.parse(fs.readFileSync(outPath, "utf8"));
const save = () => fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

// ═════ (a) sensitivity curve: N=1..12 successes, fresh store per N ═══════════
{
  const t0 = Date.now();
  const targets = [
    { tool: "memory__add_observations", fam: "MEMPREF" },
    { tool: "linear__linear_list_issues", fam: "MYWORK" },
    { tool: "sqlite__read_query", fam: "ANALYTICS" },
  ];
  const curves = [];
  for (const { tool, fam } of targets) {
    const { train, evals } = FAM[fam];
    const curve = [];
    for (let N = 0; N <= 12; N++) {
      const { db, store } = freshStore();
      for (let i = 0; i < N; i++) seedOk(store, tool, train[i]);
      const oats = N > 0 ? nightly(store) : { adjusted: 0, skipped: TOOLS.length };
      const ev = evalTool(store, tool, evals);
      curve.push({ N, adjusted: oats.adjusted, meanHybrid: ev.meanHybrid, meanDense: ev.meanDense, meanCos: ev.meanCos, hit1: ev.hit1, perEval: ev.rows });
      db.close();
    }
    curves.push({ tool, fam, evals, curve });
    console.log(`\n(a) ${tool} [${fam}] — meanHybrid by N:`);
    console.log("   N: " + curve.map((c) => String(c.N).padStart(5)).join(""));
    console.log(" hyb: " + curve.map((c) => String(c.meanHybrid).padStart(5)).join(""));
    console.log(" dns: " + curve.map((c) => String(c.meanDense).padStart(5)).join(""));
    console.log(" cos: " + curve.map((c) => c.meanCos.toFixed(2).padStart(5)).join(""));
  }
  results.sensitivity = { targets: curves, wallMs: Date.now() - t0 };
  save();
}

// ═════ (b) idempotence / drift: runOats ×30 on unchanged data ════════════════
{
  const t0 = Date.now();
  const tool = "memory__add_observations";
  const { db, store } = freshStore();
  FAM.MEMPREF.train.slice(0, 6).forEach((n) => seedOk(store, tool, n));
  FAM.ANALYTICS.train.slice(0, 2).forEach((n) => seedFail(store, tool, n)); // real negatives on the same tool
  const base = normalize(cardVecs[TOOLS.findIndex((t) => t.id === tool)]);
  const deltas = [];
  let prev = null;
  let firstAdj = null;
  for (let run = 1; run <= 30; run++) {
    const r = store.runOats();
    const adj = store.loadVecs().get(tool);
    if (prev) deltas.push(l2(adj, prev));
    else firstAdj = adj;
    prev = adj;
    if (run === 1 && r.adjusted !== 1) console.log(`  (b) WARNING adjusted=${r.adjusted}`);
  }
  // hypothetical chained application (if runOats ever fed adj back as base)
  const pos = FAM.MEMPREF.train.slice(0, 6).map(vecOf);
  const neg = FAM.ANALYTICS.train.slice(0, 2).map(vecOf);
  const posCentroid = normalize(pos.reduce((acc, v) => acc.map ? acc : acc, (() => { const a = new Float32Array(384); for (const v of pos) for (let i = 0; i < 384; i++) a[i] += v[i] / pos.length; return a; })()));
  let chained = base;
  const chainDeltas = [];
  for (let k = 0; k < 30; k++) {
    const next = oatsAdjust(chained, pos, neg).vec;
    chainDeltas.push(l2(next, chained));
    chained = next;
  }
  results.idempotence = {
    tool, positives: 6, negatives: 2,
    runOats30: {
      maxConsecutiveL2Delta: Math.max(...deltas),
      allDeltas: deltas.map((d) => +d.toFixed(10)),
      adjVsBase: { l2: +l2(firstAdj, base).toFixed(4), cos: +cosine(firstAdj, base).toFixed(4) },
    },
    chainedOatsAdjust30: {
      deltas: chainDeltas.map((d) => +d.toFixed(6)),
      finalCosToBase: +cosine(chained, base).toFixed(4),
      finalCosToPosCentroid: +cosine(chained, posCentroid).toFixed(4),
      firstCosToPosCentroid: +cosine(firstAdj, posCentroid).toFixed(4),
    },
    wallMs: Date.now() - t0,
  };
  db.close();
  console.log(`\n(b) runOats×30 max consecutive L2 delta: ${Math.max(...deltas)} (adj vs base: l2=${results.idempotence.runOats30.adjVsBase.l2}, cos=${results.idempotence.runOats30.adjVsBase.cos})`);
  console.log(`    chained oatsAdjust deltas [0..4]: ${chainDeltas.slice(0, 5).map((d) => d.toFixed(4)).join(", ")} … last: ${chainDeltas[29].toExponential(2)}; cos(final, posCentroid)=${results.idempotence.chainedOatsAdjust30.finalCosToPosCentroid}`);
}

// ═════ (c) destructive interference: fetch__fetch, SCRAPE vs POLL ════════════
{
  const t0 = Date.now();
  const tool = "fetch__fetch";
  const conds = {};
  const centroid = (strs) => { const a = new Float32Array(384); for (const s of strs) { const v = vecOf(s); for (let i = 0; i < 384; i++) a[i] += v[i] / strs.length; } return normalize(a); };
  const famCos = +cosine(centroid(FAM.SCRAPE.train), centroid(FAM.POLL.train)).toFixed(4);
  for (const cond of ["base", "scrapeOnly", "pollOnly", "dual"]) {
    const { db, store } = freshStore();
    if (cond === "scrapeOnly" || cond === "dual") FAM.SCRAPE.train.forEach((n) => seedOk(store, tool, n));
    if (cond === "pollOnly" || cond === "dual") FAM.POLL.train.forEach((n) => seedOk(store, tool, n));
    if (cond !== "base") nightly(store);
    conds[cond] = {
      scrapeEvals: evalTool(store, tool, FAM.SCRAPE.evals),
      pollEvals: evalTool(store, tool, FAM.POLL.evals),
    };
    db.close();
  }
  results.interference = { tool, familyCentroidCos: famCos, conditions: conds, wallMs: Date.now() - t0 };
  save();
  const f = (c) => `scrape hyb=${c.scrapeEvals.meanHybrid}/cos=${c.scrapeEvals.meanCos} | poll hyb=${c.pollEvals.meanHybrid}/cos=${c.pollEvals.meanCos}`;
  console.log(`\n(c) fetch__fetch, cos(centroidA,centroidB)=${famCos}`);
  for (const k of Object.keys(conds)) console.log(`    ${k.padEnd(11)} ${f(conds[k])}`);
}

// ═════ (d) negatives: β push-away for measured-wrong git__git_show ═══════════
{
  const t0 = Date.now();
  const wrong = "git__git_show";
  const right = "fs__read_text_file";
  const conds = {};
  const measure = (store) => ({
    wrongOnLocalread: evalTool(store, wrong, FAM.LOCALREAD.evals),
    rightOnLocalread: evalTool(store, right, FAM.LOCALREAD.evals),
  });
  // full-suite collateral sweep (66 shared needs)
  const fullSweep = (store) => {
    const rows = NEEDS.map((n) => {
      const cands = store.draftCandidates(n.need, TOOLS.length, vecOf(n.need));
      const ranked = rankedIds(cands);
      return { style: n.style, hit1: hitAtK(ranked, n.acceptable, 1), hit5: hitAtK(ranked, n.acceptable, 5), rr: reciprocalRank(ranked, n.primary), need: n.need };
    });
    return { summary: summarize(rows).overall, rows };
  };

  { // baseline
    const { db, store } = freshStore();
    conds.base = { ...measure(store), sweep: fullSweep(store).summary };
    db.close();
  }
  { // failures only — five real tool_fail outcomes, no successes anywhere
    const { db, store } = freshStore();
    FAM.LOCALREAD.train.forEach((n) => seedFail(store, wrong, n));
    const oats = nightly(store);
    conds.failuresOnly = { oats, ...measure(store) };
    db.close();
  }
  { // realistic: wrong tool has its own legit wins + failures on confused needs
    const { db, store } = freshStore();
    FAM.GITSHOW.train.forEach((n) => seedOk(store, wrong, n)); // 5 legit successes
    FAM.LOCALREAD.train.forEach((n) => seedFail(store, wrong, n)); // 5 failures on confused needs
    const oats = nightly(store);
    const sweep = fullSweep(store);
    conds.posPlusNeg = { oats, ...measure(store), sweep: sweep.summary, sweepRows: sweep.rows };
    db.close();
  }
  // collateral detail: which shared needs changed hit5 vs base?
  const baseRows = (() => { const { db, store } = freshStore(); const r = fullSweep(store).rows; db.close(); return r; })();
  const changed = [];
  for (let i = 0; i < baseRows.length; i++) {
    const b = baseRows[i], p = conds.posPlusNeg.sweepRows[i];
    if (b.hit5 !== p.hit5 || Math.abs(b.rr - p.rr) > 1e-9) changed.push({ need: b.need, hit5: [b.hit5, p.hit5], rr: [+b.rr.toFixed(3), +p.rr.toFixed(3)] });
  }
  delete conds.posPlusNeg.sweepRows;
  results.negatives = { wrong, right, conditions: conds, collateralChanged: changed, wallMs: Date.now() - t0 };
  save();
  console.log(`\n(d) failuresOnly: oats=${JSON.stringify(conds.failuresOnly.oats)} wrong meanHybrid ${conds.base.wrongOnLocalread.meanHybrid}→${conds.failuresOnly.wrongOnLocalread.meanHybrid}`);
  console.log(`    posPlusNeg:  wrong ${conds.base.wrongOnLocalread.meanHybrid}→${conds.posPlusNeg.wrongOnLocalread.meanHybrid} (dense ${conds.base.wrongOnLocalread.meanDense}→${conds.posPlusNeg.wrongOnLocalread.meanDense}) | right ${conds.base.rightOnLocalread.meanHybrid}→${conds.posPlusNeg.rightOnLocalread.meanHybrid}`);
  console.log(`    sweep hit5: ${conds.base.sweep.hit5}→${conds.posPlusNeg.sweep.hit5}, mrr ${conds.base.sweep.mrr}→${conds.posPlusNeg.sweep.mrr}, changed needs: ${changed.length}`);
}

// ═════ (e) poisoning: mislabeled successes on memory__search_nodes ═══════════
{
  const t0 = Date.now();
  const poisoned = "memory__search_nodes";
  const right = "brave__brave_web_search";
  const evals = FAM.WEBSEARCH.evals;
  const damage = [];
  for (let P = 0; P <= 5; P++) {
    const { db, store } = freshStore();
    for (let i = 0; i < P; i++) seedOk(store, poisoned, FAM.WEBSEARCH.train[i]);
    const oats = P > 0 ? nightly(store) : { adjusted: 0 };
    damage.push({
      P, adjusted: oats.adjusted,
      poisonedTool: evalTool(store, poisoned, evals),
      rightTool: evalTool(store, right, evals),
    });
    db.close();
  }
  // recovery channel 1: right tool accumulates real successes (P=5 fixed)
  const recoverBySuccess = [];
  {
    const { db, store } = freshStore();
    for (let i = 0; i < 5; i++) seedOk(store, poisoned, FAM.WEBSEARCH.train[i]);
    for (let R = 1; R <= 7; R++) {
      seedOk(store, right, FAM.WEBSEARCH.train[4 + R]); // train[5..11]
      const oats = nightly(store); // recomputes from base + full history → same as fresh store
      recoverBySuccess.push({ R, adjusted: oats.adjusted, poisonedTool: evalTool(store, poisoned, evals), rightTool: evalTool(store, right, evals) });
    }
    db.close();
  }
  // recovery channel 2: the poisoned tool starts failing on those needs (β)
  const recoverByFailure = [];
  {
    const { db, store } = freshStore();
    for (let i = 0; i < 5; i++) seedOk(store, poisoned, FAM.WEBSEARCH.train[i]);
    for (let F = 1; F <= 6; F++) {
      seedFail(store, poisoned, FAM.WEBSEARCH.train[4 + F]); // fresh distinct needs fail
      nightly(store);
      recoverByFailure.push({ F, poisonedTool: evalTool(store, poisoned, evals), rightTool: evalTool(store, right, evals) });
    }
    db.close();
  }
  results.poisoning = { poisoned, right, damage, recoverBySuccess, recoverByFailure, wallMs: Date.now() - t0 };
  save();
  console.log(`\n(e) poison damage (meanHybrid poisoned | right, hit1 right/4):`);
  for (const d of damage) console.log(`    P=${d.P} adj=${d.adjusted} poisoned=${d.poisonedTool.meanHybrid} (dense ${d.poisonedTool.meanDense}, cos ${d.poisonedTool.meanCos}) | right=${d.rightTool.meanHybrid} hit1=${d.rightTool.hit1}/4`);
  console.log(`    recovery by right-tool successes (P=5):`);
  for (const r of recoverBySuccess) console.log(`    R=${r.R} poisoned=${r.poisonedTool.meanHybrid} right=${r.rightTool.meanHybrid} hit1=${r.rightTool.hit1}/4`);
  console.log(`    recovery by poisoned-tool failures (P=5):`);
  for (const r of recoverByFailure) console.log(`    F=${r.F} poisoned=${r.poisonedTool.meanHybrid} (cos ${r.poisonedTool.meanCos}) right=${r.rightTool.meanHybrid} hit1=${r.rightTool.hit1}/4`);
}

// ═════ (f) abstain gate after realistic light usage ══════════════════════════
{
  const t0 = Date.now();
  const { db, store } = freshStore();
  // realistic week one: 4+4 successes on two tools, 3 on a third (below floor)
  FAM.MEMPREF.train.slice(0, 4).forEach((n) => seedOk(store, "memory__add_observations", n));
  FAM.ANALYTICS.train.slice(0, 4).forEach((n) => seedOk(store, "sqlite__read_query", n));
  FAM.MYWORK.train.slice(0, 3).forEach((n) => seedOk(store, "linear__linear_list_issues", n));
  const oats = nightly(store);
  const vecs = store.loadVecs();
  const spanOf = (needStr) => {
    const nv = vecOf(needStr);
    const cs = [...vecs.values()].map((v) => cosine(nv, v));
    return Math.max(...cs) - Math.min(...cs);
  };
  const famEvalNeeds = [...FAM.MEMPREF.evals, ...FAM.ANALYTICS.evals, ...FAM.MYWORK.evals];
  const famSpans = famEvalNeeds.map((n) => ({ need: n, span: +spanOf(n).toFixed(4) }));
  const sharedSpans = NEEDS.map((n) => +spanOf(n.need).toFixed(4));
  const baselineSpans = results.baseline.perNeed.map((r) => r.span);
  // rank movement for the three trained tools on their shared-suite eval needs
  const moved = [
    { tool: "memory__add_observations", need: "remember that the user prefers dark mode", baselineHybrid: 108 },
    { tool: "sqlite__read_query", need: "how many users signed up last week", baselineHybrid: 74 },
    { tool: "linear__linear_list_issues", need: "what's on my plate this sprint", baselineHybrid: 102 },
  ].map((m) => ({ ...m, after: hybridRank(store, m.tool, m.need).rank, afterDense: denseRank(store, m.tool, m.need).rank }));
  db.close();

  // micro-corpus contrast: the 4 dense-live tools where the gate DID matter
  const microTools = [
    { id: "memory__create_entities", name: "create_entities", description: "Create multiple new entities in the knowledge graph" },
    { id: "memory__search_nodes", name: "search_nodes", description: "Search for nodes in the knowledge graph based on a query" },
    { id: "fs__read_text_file", name: "read_text_file", description: "Read the complete contents of a file from the file system as text" },
    { id: "web__fetch_page", name: "fetch_page", description: "Fetch a web page over HTTP and return its contents" },
  ];
  const microVecs = await embedAll(microTools.map((t) => `${t.name}\n${t.description}\n`), "document");
  const microNeed = "remember a fact about the user for later";
  const [microNeedVec] = await provider.embed([microNeed], "query");
  const microCos = microVecs.map((v) => cosine(microNeedVec, v));
  const microSpan = Math.max(...microCos) - Math.min(...microCos);

  results.abstainGate = {
    lightUsage: { outcomes: "4+4+3 successes on 3 tools", oats },
    famEvalSpans: famSpans,
    sharedSpansAfter: {
      min: +Math.min(...sharedSpans).toFixed(4),
      informativeCount: sharedSpans.filter((s) => s >= 0.15).length,
      n: sharedSpans.length,
    },
    sharedSpansBaseline: {
      min: +Math.min(...baselineSpans).toFixed(4),
      informativeCount: baselineSpans.filter((s) => s >= 0.15).length,
      n: baselineSpans.length,
    },
    trainedToolRankMoves: moved,
    microCorpus4Tools: { need: microNeed, span: +microSpan.toFixed(4), informative: microSpan >= 0.15, cosValues: microCos.map((c) => +c.toFixed(4)) },
    wallMs: Date.now() - t0,
  };
  save();
  console.log(`\n(f) light usage oats=${JSON.stringify(oats)}; shared-needs informative after: ${results.abstainGate.sharedSpansAfter.informativeCount}/66 (baseline ${results.abstainGate.sharedSpansBaseline.informativeCount}/66, min span ${results.abstainGate.sharedSpansBaseline.min}→${results.abstainGate.sharedSpansAfter.min})`);
  console.log(`    fam-eval min span: ${Math.min(...famSpans.map((s) => s.span))}`);
  for (const m of moved) console.log(`    ${m.tool}: hybrid ${m.baselineHybrid}→${m.after} (dense→${m.afterDense})`);
  console.log(`    micro 4-tool corpus span=${microSpan.toFixed(4)} informative=${microSpan >= 0.15}`);
}

results.meta.phase2WallMs = Date.now() - T_START;
save();
await provider.dispose();
console.log(`\nDONE in ${Date.now() - T_START}ms → ${outPath}`);
