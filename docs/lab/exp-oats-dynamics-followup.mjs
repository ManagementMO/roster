#!/usr/bin/env node
/**
 * OATS dynamics — FOLLOW-UP: mechanism of the measured β anomaly
 * (recovery-by-failure got WEAKER as failures accumulated: rank 7.3@F=1 → 5@F=6).
 * Hypothesis: meanVec of diverse unit need-vectors has norm < 1, so the
 * effective push/pull magnitude shrinks as evidence diversifies.
 *   1) reproduce store numbers with pure oatsAdjust on the same real vectors,
 *      logging ||negCentroid|| per F
 *   2) control: F repeats of the SAME failed need (norm stays 1)
 *   3) counterfactual (PROPOSAL support only): normalize centroids before use
 *   4) positive-side norm shrink vs N (effective α)
 *   5) REAL-STORE worst case: failures on the very needs that were poisoned —
 *      can β=0.1 ever cancel α=0.3 poison? (agent-retries-and-fails loop)
 * Run: node docs/lab/exp-oats-dynamics-followup.mjs
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
const { CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL, cosine, oatsAdjust, meanVec, normalize, hashNeed } = coach;
const { TOOLS } = await import(path.join(here, "corpus.mjs"));
const { mean } = await import(path.join(here, "metrics.mjs"));

const WEBSEARCH_TRAIN = [
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
];
const WEBSEARCH_EVALS = [
  "search the web for the latest node lts version",
  "find out online when the next solar eclipse is",
  "search for benchmarks comparing sqlite and duckdb",
  "look up the npm weekly downloads for react",
];
const MEMPREF_TRAIN = [
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
];

const provider = new TransformersEmbeddings(MINILM_MODEL);
const embed1 = async (s, kind) => (await provider.embed([s], kind))[0];
const trainVecs = await provider.embed(WEBSEARCH_TRAIN, "query");
const evalVecs = await provider.embed(WEBSEARCH_EVALS, "query");
const memVecs = await provider.embed(MEMPREF_TRAIN, "query");
const poisonedIdx = TOOLS.findIndex((t) => t.id === "memory__search_nodes");
const poisonedCard = await embed1(`${TOOLS[poisonedIdx].name}\n${TOOLS[poisonedIdx].description}\n`, "document");
const norm = (v) => Math.hypot(...v);
const evalCentroid = normalize(meanVec(evalVecs));

const out = {};

// 1) reproduce store: pos = train[0..4]; neg = train[5..4+F]
const pos = trainVecs.slice(0, 5);
out.negNormSweep = [];
for (let F = 0; F <= 6; F++) {
  const neg = trainVecs.slice(5, 5 + F);
  const adj = oatsAdjust(poisonedCard, pos, neg).vec;
  out.negNormSweep.push({
    F,
    negCentroidNorm: F > 0 ? +norm(meanVec(neg)).toFixed(4) : null,
    cosAdjToEvalCentroid: +cosine(adj, evalCentroid).toFixed(4),
    meanCosToEvals: +mean(evalVecs.map((e) => cosine(adj, e))).toFixed(4),
  });
}

// 2) control: F repeats of the SAME failed need — centroid norm pinned at 1
out.sameNeedRepeat = [];
for (let F = 1; F <= 6; F++) {
  const neg = Array(F).fill(trainVecs[5]);
  const adj = oatsAdjust(poisonedCard, pos, neg).vec;
  out.sameNeedRepeat.push({ F, negCentroidNorm: +norm(meanVec(neg)).toFixed(4), meanCosToEvals: +mean(evalVecs.map((e) => cosine(adj, e))).toFixed(4) });
}

// 3) counterfactual for PROPOSAL: normalized centroids (unit push regardless of diversity)
out.normalizedCentroidVariant = [];
for (let F = 0; F <= 6; F++) {
  const negRaw = trainVecs.slice(5, 5 + F);
  const posC = normalize(meanVec(pos));
  const negC = negRaw.length ? normalize(meanVec(negRaw)) : null;
  // same recurrence as oatsAdjust but with unit centroids
  let e = normalize(poisonedCard);
  for (let it = 0; it < 3; it++) {
    const next = new Float32Array(e.length);
    for (let i = 0; i < e.length; i++) {
      let x = 0.7 * e[i] + 0.3 * posC[i];
      if (negC) x -= 0.1 * negC[i];
      next[i] = x;
    }
    e = normalize(next);
  }
  out.normalizedCentroidVariant.push({ F, meanCosToEvals: +mean(evalVecs.map((ev) => cosine(e, ev))).toFixed(4) });
}

// 4) positive-side norm shrink (effective α vs N), MEMPREF family
out.posNormByN = [];
for (let N = 4; N <= 12; N++) {
  out.posNormByN.push({ N, posCentroidNorm: +norm(meanVec(memVecs.slice(0, N))).toFixed(4) });
}

// 5) REAL STORE: failures on the SAME poisoned needs (agent retry loop)
{
  const SOURCE_OF = new Map(TOOLS.map((t) => [t.id, t.source]));
  const db = openCoachDb(":memory:");
  const store = new CoachStore(db);
  store.upsertCapabilities(TOOLS);
  const cards = await (async () => {
    const texts = TOOLS.map((t) => `${t.name}\n${t.description}\n`.slice(0, 2000));
    const vs = [];
    for (let i = 0; i < texts.length; i += 16) vs.push(...(await provider.embed(texts.slice(i, i + 16), "document")));
    return vs;
  })();
  TOOLS.forEach((t, i) => store.storeBaseVec(t.id, cards[i]));
  let s = 0;
  const seed = (tool, needStr, vec, cls) => {
    const nh = hashNeed(needStr);
    store.storeNeedVec(nh, vec);
    store.recordOutcome({ session: `f${s++}`, source: SOURCE_OF.get(tool), capability: tool, outcomeClass: cls, latencyMs: 40, needHash: nh });
  };
  for (let i = 0; i < 5; i++) seed("memory__search_nodes", WEBSEARCH_TRAIN[i], trainVecs[i], "success");
  const rankFor = () => {
    const vecs = store.loadVecs();
    const ranks = evalVecs.map((ev) => {
      const scored = [...vecs].map(([id, v]) => [id, cosine(ev, v)]).sort((a, b) => b[1] - a[1]);
      return scored.findIndex(([id]) => id === "memory__search_nodes") + 1;
    });
    return +mean(ranks).toFixed(1);
  };
  store.runOats();
  out.sameNeedFailRealStore = [{ round: 0, note: "poison only", meanDenseRank: rankFor() }];
  // rounds of the SAME 5 needs failing on the poisoned tool (retry loop), 3 rounds = 15 failures
  for (let round = 1; round <= 3; round++) {
    for (let i = 0; i < 5; i++) seed("memory__search_nodes", WEBSEARCH_TRAIN[i], trainVecs[i], "tool_fail:other");
    store.recomputeRatings();
    store.runOats();
    out.sameNeedFailRealStore.push({ round, failuresTotal: round * 5, meanDenseRank: rankFor() });
  }
  db.close();
}

const outPath = path.join(here, "results-oats-dynamics.json");
const results = JSON.parse(fs.readFileSync(outPath, "utf8"));
results.followupBetaMechanism = out;
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(out, null, 1));
await provider.dispose();
