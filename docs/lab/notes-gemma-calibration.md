# Gemma calibration: spans, threshold, Matryoshka dims (real EmbeddingGemma-300M)

**Question.** The dense-abstain threshold `MIN_INFORMATIVE_COS_SPAN = 0.15` was calibrated on MiniLM (noise spans ~0.0–0.1) and shipped for all models. Gemma is the default on ≥8 GB machines and had never been measured against it. Is 0.15 right for Gemma? Is 256 the right Matryoshka dim? What does hybrid actually buy over lexical with the default model?

**Method.** Real inference, no mocks: `onnx-community/embeddinggemma-300m-ONNX` (q8) via transformers.js, real `CoachStore` over real in-memory SQLite, shared lab fixtures (133-tool corpus, 66 ground-truthed needs), k=10 drafts, production text shapes (`name\ndescription\n` docs, raw need queries, `gemmaPrefix` kinds, batch 16 — all mirroring `serve.ts`). Everything embedded once at native 768 dims through the identical pipeline call shape, then `truncateAndNormalize()` (the exported production function) derived the 128/256/512/768 sets. Two integrity gates, both passed:

- **Provider equivalence** — raw-native→truncate(256) vs real `TransformersEmbeddings` output: max abs component diff 0.00e+0, min pair cosine 1.000000 (bit-exact).
- **Fusion reproduction** — the threshold sweep needs a variable threshold, so fusion was reimplemented; it reproduced the real `store.draftCandidates()` top-10 exactly on all 66 needs at every dim (0 mismatches). All non-sweep rankings come from the real store.

Noise probes: each need with words shuffled (seeded, topic preserved) + 10 fixed gibberish strings (keyboard mash, digits, unicode junk). Raw output: `docs/lab/results-gemma-calibration.json`. Runtime ~45 s total, warm cache; model disposed after each stage.

## (a) Lexical vs hybrid, production config (256 dims, t=0.15)

| | hit@1 | hit@5 | MRR |
|---|---|---|---|
| lexical (FTS5) | 0.439 | 0.621 | 0.467 |
| hybrid (Gemma) | **0.682** | **0.788** | **0.687** |

Per style (n): paraphrase 31: hit@5 0.645→0.806 · zero-overlap 8: **0.125→0.500** (MRR 0.057→0.337) · terse 13: 0.923→1.0 · non-english 2: 0.5→1.0 · trap 5: 0.8→0.8 (MRR 0.45→0.70) · cross-server 4: 0.75→0.75 · verbose 2: 0→0.5 · typo 1: 0→0 (MRR 0→0.143).

**29 wins, 1 regression, 36 unchanged** out of 66 (see (e)).

## (b) Cosine span distributions — real vs noise

Per-draft span = max−min cosine across all 133 tools, exactly as the store computes it.

| group | n | min | p25 | p50 | p75 | max | frac < 0.15 |
|---|---|---|---|---|---|---|---|
| real needs | 66 | 0.2275 | 0.342 | 0.401 | 0.472 | 0.605 | **0.000** |
| shuffled (topic kept) | 66 | 0.2348 | 0.334 | 0.384 | 0.456 | 0.578 | 0.000 |
| gibberish | 10 | 0.2054 | 0.214 | 0.235 | 0.274 | **0.310** | **0.000** |

**The 0.15 threshold can never fire in Gemma mode.** Even pure garbage ("9481 2750 6613 0092 8837") produces a span of 0.205 — above the gate. And the distributions overlap: gibberish max (0.310) > real min (0.2275), so **no span threshold separates noise from signal**. Shuffled ≈ real is fine (topic preserved; engaging is correct — shuffled hybrid still scores hit@5 0.758 vs lexical 0.621, and lexical is exactly order-invariant). Gibberish is the true-noise probe, and at t=0.15 it always engages: `draft("asdf jkl qwerty uiop zxcv")` returns a confident dense ranking (`playwright__browser_press_key` cos 0.459 on top); lexical mode instead returns score-0.00 recency fallback — visibly signal-free. The MiniLM-verified "uninformative dense channel abstains — no noise amplification" property does not exist for the default model.

## (c) Threshold sweep (256 dims)

| t | abstain(real) | engage(shuffled) | engage(gibberish) | hit@1 | hit@5 | MRR |
|---|---|---|---|---|---|---|
| 0.00–0.20 | 0.000 | 1.000 | 1.000 | 0.682 | 0.788 | 0.687 |
| 0.25 | 0.015 | 0.985 | 0.400 | 0.682 | 0.788 | 0.687 |
| 0.30 | 0.121 | 0.864 | 0.200 | 0.667 | 0.773 | 0.670 |
| 0.35 | 0.288 | 0.667 | **0.000** | 0.636 | 0.712 | 0.633 |
| 0.40 | 0.500 | 0.424 | 0.000 | 0.561 | 0.682 | 0.585 |

Rejecting all gibberish requires t=0.35, which falsely abstains 28.8% of real needs and costs −7.6 pts hit@5. Every value in [0, 0.20] is equivalent (dead zone). **There is no correct span threshold for Gemma.** Follow-up: gating on max-cosine instead also fails — rejecting 90% of gibberish (t=0.50) falsely abstains 21.2% of real needs (real cosMax min 0.312 vs gibberish cosMax up to 0.538 — "lorem zipsum…" hits `everything__add` at 0.538). q8 Gemma's embedding cone is too tight for cosine-geometry garbage detection.

## (d) Matryoshka dims

| dims | hit@1 | hit@5 | MRR | real-span p50 | min real span | gate misfires @0.15 |
|---|---|---|---|---|---|---|
| 128 | 0.561 | 0.742 | 0.607 | 0.385 | — | 0 |
| **256 (shipped)** | **0.682** | 0.788 | 0.687 | 0.403 | 0.2275 | 0 |
| 512 | 0.667 | 0.803 | 0.680 | 0.280 | 0.1307 | 1 real need |
| 768 | 0.667 | **0.818** | **0.689** | 0.302 | 0.1321 | 1 real need, −1.5 pts hit@5 |

256 is a defensible default: best hit@1, MRR parity with 768 (0.687 vs 0.689), −3.0 pts hit@5 vs 768 (= 2 needs at n=66). 128 is clearly worse (−4.6 hit@5, −8.0 MRR vs 256). **But dims and threshold are coupled**: spans shrink as dims grow, and at 512/768 the 0.15 gate starts firing on *real* needs only — never on noise. At 768 the single abstained need is "what's on my plate this sprint" (span 0.132, zero-overlap — precisely the class dense exists to serve), and forcing engagement there raises hit@5 from 0.818 to 0.833. Anyone bumping `MATRYOSHKA_DIMS` without touching the unrelated constant in `store.ts` inherits a gate that only ever hurts.

## (e) Regressions vs lexical (256, t=0.15)

One regression in 66: "show me what's inside config.yaml" — lexical had `fs__read_text_file` at rank 3; hybrid drops all acceptable answers out of the top 10 (top-3: `git__git_show`, `memory__read_graph`, `github__get_file_contents`). Follow-up across dims shows it is **model-level, not a truncation artifact**: pure-cosine rank of the primary is 6/23/29/15 at 128/256/512/768 — Gemma genuinely reads "show me what's inside X" as `git show`. 29 needs improved (e.g. zero-overlap needs lexical missed entirely).

## Timing (warm cache, M-series CPU, q8)

Pipeline load 555 ms · documents 19.9 ms/text (133-tool backfill ≈ 2.6 s) · queries ~13 ms/text.

## Conclusions

1. **(b)+(c) headline:** 0.15 was calibrated on MiniLM and is *inoperative* for the default model — real Gemma spans are 0.23–0.60, garbage spans 0.21–0.31; the gate never abstains on anything, and no span (or max-cos) value can separate noise from signal. The noise-abstain safety story is MiniLM-only.
2. **(d):** 256 is the right default at today's gate (best hit@1, MRR parity, 3× smaller vectors); 768 buys +3 pts hit@5 but *only* if the threshold is re-derived (< 0.13) — at 0.15 the gate actively costs quality at higher dims.
3. **(a)+(e):** with real Gemma the hybrid ladder delivers large, nearly regression-free gains (+16.7 hit@5, +22.0 MRR, 29 wins / 1 loss), concentrated exactly where lexical is blind (zero-overlap, paraphrase, non-english).

**Proposals (unimplemented, for the owner):** make the abstain threshold a per-model constant colocated with the model choice (Gemma@256: any value ≤ 0.20 ≡ always-engage, which measurement supports; MiniLM: keep 0.15); assert/recalibrate it whenever `MATRYOSHKA_DIMS` changes; drop any Gemma-mode claim of span-based noise protection (or implement a non-cosine garbage signal, e.g. lexical-empty ∧ low-cos — untested here); update the `store.ts` fusion comment to reflect measured Gemma spans.

Scripts: `exp-gemma-calibration.mjs` (main), `exp-gemma-calibration-followup.mjs` (max-cos gate, regression-by-dim, lexical-on-gibberish). Raw numbers: `results-gemma-calibration.json`.
