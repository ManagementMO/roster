/**
 * Part C2 — leak isolation follow-up. Two arms, run as separate processes:
 *   mode=cycle N  → N × (new provider → embed 133-corpus in 16s → dispose)
 *   mode=hold  N  → ONE provider, embed the same corpus N times, no dispose
 * If `cycle` climbs and `hold` stays flat, the create/dispose cycle leaks;
 * if both climb alike, it's allocator/ORT noise from inference itself.
 * Run with --expose-gc. RSS sampled after gc+settle each round.
 */
import { loadCoach, serveText, savePart, audit, vecAudit, rssMb, sleep } from "./exp-embed-torture-lib.mjs";
import { TOOLS } from "./corpus.mjs";

const mode = process.argv[2] ?? "cycle";
const N = parseInt(process.argv[3] ?? "12", 10);
const { TransformersEmbeddings, MINILM_MODEL } = await loadCoach();
const gc = globalThis.gc ?? (() => {});
const out = { part: `c2-${mode}`, model: MINILM_MODEL, mode, rounds: N, startedAt: new Date().toISOString(), exposeGc: !!globalThis.gc };

const texts = TOOLS.map(serveText);
const BATCH = 16;
const embedCorpus = async (p) => {
  for (let i = 0; i < texts.length; i += BATCH) audit(await p.embed(texts.slice(i, i + BATCH), "document"));
};

gc(); await sleep(200);
out.baselineRssMb = rssMb();
out.series = [];

let holdProvider = null;
if (mode === "hold") {
  holdProvider = new TransformersEmbeddings(MINILM_MODEL);
  audit(await holdProvider.embed(["roster warmup"]));
}

for (let r = 1; r <= N; r++) {
  if (mode === "cycle") {
    const p = new TransformersEmbeddings(MINILM_MODEL);
    await embedCorpus(p);
    await p.dispose();
  } else {
    await embedCorpus(holdProvider);
  }
  gc(); await sleep(250); gc();
  out.series.push(rssMb());
}
if (holdProvider) await holdProvider.dispose();

// Slope over the back half (skip initial allocator ramp).
const half = out.series.slice(Math.floor(N / 2));
const xs = half.map((_, i) => i);
const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
const my = half.reduce((a, b) => a + b, 0) / half.length;
const slope = xs.reduce((a, x, i) => a + (x - mx) * (half[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
out.backHalfSlopeMbPerRound = +slope.toFixed(2);
out.firstToLastMb = +(out.series[out.series.length - 1] - out.series[0]).toFixed(1);
out.vecAudit = { ...vecAudit };
savePart(`c2-${mode}`, out);
console.log(JSON.stringify(out, null, 2));
