#!/usr/bin/env node
/**
 * Follow-up to exp-gemma-calibration.mjs — three focused questions:
 *  1. Would gating on MAX COSINE (instead of span) separate gibberish from
 *     real needs? (derived from the saved raw arrays + a fresh shuffled run)
 *  2. Is the single 256-dim regression ("show me what's inside config.yaml")
 *     a Matryoshka-truncation artifact or model-level? Rank at every dim.
 *  3. What does the lexical path actually return for gibberish today (the
 *     alternative the abstain gate would fall back to)?
 * Appends results into results-gemma-calibration.json under `followup`.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const RESULTS = path.join(here, "results-gemma-calibration.json");
const results = JSON.parse(fs.readFileSync(RESULTS, "utf8"));

const cliReq = createRequire(path.join(repo, "packages/cli/package.json"));
const coachReq = createRequire(path.join(repo, "packages/coach/package.json"));
const coachEntry = cliReq.resolve("@rosterhq/coach");
const coach = await import(pathToFileURL(coachEntry).href);
const embMod = await import(pathToFileURL(path.join(path.dirname(coachEntry), "embeddings.js")).href);
const { CoachStore, openCoachDb, GEMMA_MODEL, cosine, truncateAndNormalize } = coach;
const { gemmaPrefix } = embMod;
const { TOOLS } = await import(pathToFileURL(path.join(here, "corpus.mjs")).href);
const { NEEDS } = await import(pathToFileURL(path.join(here, "needs.mjs")).href);
const { rankedIds } = await import(pathToFileURL(path.join(here, "metrics.mjs")).href);

const say = (s) => console.log(s);

// ── 1. max-cos gate analysis from SAVED raw arrays (same run's measurements) ─
say("## 1. max-cosine as an alternative noise gate (from saved arrays)");
const perNeed = results.perDim["256"].perNeed;
const realMax = perNeed.map((p) => p.cosMax);
const gibMax = results.perDim["256"].gibberishDetail.map((g) => +g.top3[0].split(":")[1]);
const frac = (xs, pred) => +(xs.filter(pred).length / xs.length).toFixed(3);
const maxCosGate = [];
for (let t = 0.3; t <= 0.601; t += 0.05) {
  const th = +t.toFixed(2);
  maxCosGate.push({
    threshold: th,
    abstainRateReal: frac(realMax, (x) => x < th),
    engageRateGibberish: frac(gibMax, (x) => x >= th),
  });
}
results.followup = { maxCosGate, realMaxCos: { min: Math.min(...realMax), max: Math.max(...realMax) }, gibberishMaxCos: { min: Math.min(...gibMax), max: Math.max(...gibMax), all: gibMax } };
say("  t     abstain(real)  engage(gibberish)");
for (const r of maxCosGate) say(`  ${r.threshold.toFixed(2)}   ${r.abstainRateReal.toFixed(3)}          ${r.engageRateGibberish.toFixed(3)}`);

// ── 2 & 3 need embeddings: reload Gemma (warm) ──────────────────────────────
const tf = await import(pathToFileURL(coachReq.resolve("@huggingface/transformers")).href);
const pipeline = tf.pipeline ?? tf.default?.pipeline;
const pipe = await pipeline("feature-extraction", GEMMA_MODEL, { dtype: "q8" });
const embed = async (texts, kind) => {
  const out = [];
  for (let i = 0; i < texts.length; i += 16) {
    const prepared = texts.slice(i, i + 16).map((t) => gemmaPrefix(kind, t));
    const res = await pipe(prepared, { pooling: "mean", normalize: true });
    for (const row of res.tolist()) out.push(new Float32Array(row));
  }
  return out;
};

say("## 2. regression need across dims (truncation artifact or model-level?)");
const REG_NEED = "show me what's inside config.yaml";
const regTruth = NEEDS.find((n) => n.need === REG_NEED);
const docTexts = TOOLS.map((t) => `${t.name}\n${t.description}\n`.slice(0, 2000));
const docNative = await embed(docTexts, "document");
const [regNative] = await embed([REG_NEED], "query");
const regressionByDim = {};
for (const d of [128, 256, 512, 768]) {
  const store = new CoachStore(openCoachDb(":memory:"));
  store.upsertCapabilities(TOOLS);
  TOOLS.forEach((t, i) => store.storeBaseVec(t.id, truncateAndNormalize(docNative[i], d)));
  const qv = truncateAndNormalize(regNative, d);
  const ranked = rankedIds(store.draftCandidates(REG_NEED, 20, qv));
  const rank = ranked.findIndex((id) => regTruth.primary.includes(id)) + 1 || null;
  const rankAcc = ranked.findIndex((id) => regTruth.acceptable.includes(id)) + 1 || null;
  // raw cosine rank of the primary among all 133 (dense channel alone)
  const cosAll = TOOLS.map((t, i) => ({ id: t.id, c: cosine(qv, truncateAndNormalize(docNative[i], d)) })).sort((a, b) => b.c - a.c);
  const cosRank = cosAll.findIndex((x) => regTruth.primary.includes(x.id)) + 1;
  regressionByDim[d] = { hybridPrimaryRank: rank, hybridAcceptableRank: rankAcc, pureCosPrimaryRank: cosRank, top5: ranked.slice(0, 5) };
  say(`  dims=${d}: hybrid primary rank=${rank ?? ">20"}, acceptable rank=${rankAcc ?? ">20"}, pure-cos primary rank=${cosRank}, top3=${ranked.slice(0, 3).join(", ")}`);
}
results.followup.regressionByDim = regressionByDim;

say("## 3. lexical path on gibberish (what abstaining would return instead)");
const store = new CoachStore(openCoachDb(":memory:"));
store.upsertCapabilities(TOOLS);
const gibberishLexical = [];
for (const g of ["xqzv plorf wnkt jrb", "9481 2750 6613 0092 8837", "ﬂ‡†¶• ∆˚¬… æœ∑´®†"]) {
  const cands = store.draftCandidates(g, 5);
  gibberishLexical.push({ text: g, top5: cands.map((c) => ({ id: c.entry.id, score: +c.score.toFixed(3) })) });
  say(`  "${g.slice(0, 24)}" → ${cands.map((c) => `${c.entry.id}(score=${c.score.toFixed(2)})`).join(", ")}`);
}
results.followup.gibberishLexical = gibberishLexical;

if (pipe.dispose) await pipe.dispose();
fs.writeFileSync(RESULTS, JSON.stringify(results, null, 1));
say(`\nappended → ${RESULTS}`);
