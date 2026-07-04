# Retrieval quality + fusion calibration — MiniLM, real inference

**Question.** Is the shipped hybrid fusion (`HYBRID_LEX_WEIGHT=0.3` / `HYBRID_COS_WEIGHT=0.7`, dense abstain below cosine span `0.15` in `packages/coach/src/store.ts`) the right calibration for MiniLM on a realistic corpus?

**Method.** Real `TransformersEmbeddings(Xenova/all-MiniLM-L6-v2)` (q8 ONNX via transformers.js, 384 dims; sanity probe dog~puppy 0.8049 vs dog~qft 0.1188). All 133 corpus tool cards embedded exactly like the serve warmup path (`serve.ts:116`, `` `${name}\n${description}\n${body??""}` ``, kind `document`, batches of 16; 151 ms total) and all 66 ground-truthed needs like `serve.ts:141` (kind `query`, 72 ms). Base vecs stored in a real `CoachStore` (in-memory SQLite). Shipped behavior measured with the real `store.draftCandidates`. Because fusion weights are module constants, the weight/threshold sweeps use a line-faithful reimplementation of the store.ts fusion arithmetic (same candidate-set construction, min-max cos normalization, abstain, score>0 filter, stable sort; rated fallback omitted) fed by the store's REAL `lexicalSearch` scores and REAL cosines against `store.loadVecs()`. **Parity check: mirror top-5 == real hybrid top-5 on 66/66 needs (0 mismatches)**, so sweep numbers are trustworthy. hit@k scored against `acceptable`, MRR against `primary` (needs.mjs convention). Raw output: `docs/lab/results-retrieval-minilm.json`. Runner: `docs/lab/exp-retrieval-minilm.mjs`.

## (a) Shipped behavior: lexical-only vs hybrid, real draftCandidates, k=5 (n=66)

| config | hit@1 | hit@5 | MRR |
|---|---|---|---|
| lexical-only | 0.439 | 0.621 | 0.460 |
| hybrid (0.3/0.7, shipped) | **0.591** | **0.788** | **0.622** |

Dense rung earns its keep: +15.2pt hit@1, +16.7pt hit@5, +16.2pt MRR. Biggest style win: zero-overlap (hit@5 0.125 → 0.500, n=8); paraphrase hit@1 0.452 → 0.645 (n=31). Latency cost is negligible: hybrid draft 0.36 ms mean / 0.49 ms p95 (incl. per-call loadVecs of 133 vecs) vs 0.09 ms lexical.

## (b) Weight sweep (mirror fusion, abstain 0.15; identical results with abstain 0 — see (c))

| lex/cos | hit@1 | hit@5 | MRR |
|---|---|---|---|
| 1 / 0 | 0.424 | 0.591 | 0.447 |
| 0.7 / 0.3 | 0.515 | 0.712 | 0.529 |
| 0.5 / 0.5 | 0.530 | 0.712 | 0.548 |
| **0.3 / 0.7 (shipped)** | 0.591 | 0.788 | 0.622 |
| 0.2 / 0.8 | 0.636 | 0.833 | 0.639 |
| **0.15 / 0.85** | 0.636 | 0.833 | **0.649** |
| 0.1 / 0.9 | **0.652** | 0.833 | 0.641 |
| 0 / 1 | 0.636 | 0.833 | 0.634 |

Quality rises monotonically with cosine weight and plateaus at lex 0.1–0.15; the shipped 0.3 lexical weight is ballast for MiniLM. 0.15/0.85 vs shipped: +4.5pt hit@1, +4.5pt hit@5, +2.7pt MRR (3 needs each on n=66). Paired per-need (0/1 vs shipped): RR wins 9–5 (52 ties), hit@5 wins 3–0 — a consistent trend, not one lucky need. Keeping a small lexical weight beats 0/1 (MRR 0.649 vs 0.634): pure cosine drops the verbose pair (hit@1 0.5→0) and cross-server MRR. Per-style at 0.15/0.85 vs shipped: paraphrase hit@5 0.806→0.871, terse hit@1 0.692→0.769, verbose hit@1 0→0.5, typo hit@5 0→1; only cross-server MRR dips 0.75→0.625 (one of n=4 needs slides #1→#2).

## (c) Cosine span distribution + abstain threshold

Per-draft cosine span across the 133-tool candidate set, 66 needs — deciles:

| p0 | p10 | p20 | p30 | p40 | p50 | p60 | p70 | p80 | p90 | p100 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.218 | 0.346 | 0.415 | 0.462 | 0.493 | 0.554 | 0.585 | 0.634 | 0.709 | 0.755 | 0.935 |

**The shipped 0.15 abstain NEVER fired: 0/66 drafts** (min span 0.218). The "MiniLM spans ~0.0–0.1, dense abstains" story from `dense-live.mjs` (span 0.041) is an artifact of its 4-tool candidate set — span grows with corpus diversity, so at production roster sizes the gate is inert. Threshold sweep at shipped weights (hit@5 flat then falling):

| threshold | 0–0.20 | 0.25 | 0.30 | 0.35 | 0.40 |
|---|---|---|---|---|---|
| abstain rate | 0 | 0.015 | 0.045 | 0.106 | 0.167 |
| hit@5 | 0.788 | 0.788 | 0.788 | 0.788 | 0.773 |
| hit@1 | 0.591 | 0.591 | 0.591 | 0.576 | 0.561 |

Raising the threshold only hurts (abstained needs fall back to weaker lexical). Verdict: 0.15 is harmless — keep for tiny-roster safety (where it demonstrably fires) — but it provides no protection at realistic scale, and the store.ts comment implying MiniLM spans are tiny is false for real corpora.

## (d) Regressions: hybrid vs lexical-only, full-depth rank of best acceptable

Movement on 66 needs: **30 improved / 4 regressed / 32 unchanged**; hit@5: 12 gains vs 1 loss. All 4 regressions are needs where MiniLM places the correct tool near cosine ZERO while span stays high (e.g. "remember that the user prefers dark mode": best acceptable cos −0.045, rank 31→108). 8/66 needs have best-acceptable cos < 0.1 — a measurable MiniLM blind-spot family: memory-persistence paraphrases ("remember/save/persist a fact"), analytics zero-overlap ("how many users signed up last week", "what's on my plate this sprint"), and the Chinese need. No fusion tuning fixes these; OATS refinement or a stronger model (Gemma) is the lever.

**Alternative gate tested and rejected.** Since regressions have low max-cos (mean 0.284 vs 0.358 improved / 0.491 unchanged), I measured a "dense abstains when maxCos < t" gate: every t ≥ 0.25 is net-negative (t=0.3 at shipped weights: hit@1 0.591→0.561, hit@5 0.788→0.742) — lexical fallback loses more than confidently-weak dense costs. Do not add it.

## Conclusion

- The dense rung is a large, real win at MiniLM (+16.7pt hit@5 over lexical), for 0.4 ms per draft.
- **0.3/0.7 is NOT the optimum for MiniLM: 0.15/0.85 (or 0.1/0.9) is better on every overall metric** — recommend `HYBRID_LEX_WEIGHT=0.15`, `HYBRID_COS_WEIGHT=0.85`, pending the Gemma sibling experiment confirming the same direction before changing model-shared constants.
- Keep `MIN_INFORMATIVE_COS_SPAN=0.15` (inert at scale, useful on tiny rosters, raising it hurts); fix the misleading calibration comments.
- Caveats: n=66 (deltas of 3 needs), single 133-tool corpus, fallible ground truth; sweep excludes rated-fallback backfill (parity-verified at shipped config).
