# OATS learning dynamics — real MiniLM vectors, real CoachStore SQLite

**Question.** How does OATS (`runOats` / `oatsAdjust`, α=0.3 β=0.1 iters=3 minPositives=4) actually behave with real embeddings: how fast does it learn, does it drift, what happens with multi-purpose tools, negatives, poisoning, and does the 0.15 dense-abstain gate matter after light usage?

**Method.** All vectors are real MiniLM (`Xenova/all-MiniLM-L6-v2`, 384-d, q8) via `TransformersEmbeddings`; production text formats (`name\ndescription\n` as document, needs as query). Real `CoachStore` on `better-sqlite3` `:memory:` DBs; outcomes via `recordOutcome`, learning via `recomputeRatings()+runOats()` (the nightly pair); ranks via the real `draftCandidates(need, 133, needVec)` path over the shared 133-tool corpus, plus pure-cosine ("dense") rank as a diagnostic. Shared fixtures: `corpus.mjs`, `needs.mjs`, `metrics.mjs`. Need families: 12 train + 3-4 held-out eval paraphrases per family, train/eval disjoint. Scripts: `exp-oats-dynamics-baseline.mjs`, `exp-oats-dynamics.mjs`, `exp-oats-dynamics-followup.mjs`. Every number below is in `results-oats-dynamics.json`. Wall time: ~0.5 s + ~0.9 s + ~0.6 s (model cached).

## Baseline (66 shared needs × 133 tools)

| channel | rank-1 | notes |
|---|---|---|
| hybrid (product path) | 40/66 (hit1 .606, hit5 .788, MRR .647) | |
| dense-only (base vecs) | 36/66 | dense already beats lexical pre-OATS |
| lexical-only | 26/66 | |

Cosine span across candidates (what the 0.15 abstain gate tests): min .2175, p50 .5541, max .9354 → **66/66 needs clear the gate at baseline; hybrid ≠ lexical order on all 66**. Weak-tool targets picked from measurement: `memory__add_observations` (hybrid rank 108 for its eval need), `linear__linear_list_issues` (102), `sqlite__read_query` (74).

## (a) Sensitivity curve — N recorded successes, fresh store per N

Mean hybrid rank over 4 held-out paraphrase evals (dense rank in parens):

| N | 0 | 1 | 2 | 3 | **4** | 5 | 6 | 8 | 10 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|
| memory__add_observations | 52.8 (52.3) | 52.8 | 52.8 | 52.8 | **2.3 (1.3)** | 2.8 | 2.8 | 2.3 | 2.5 | 2.8 |
| linear__linear_list_issues | 69.5 (72.8) | 69.5 | 69.5 | 69.5 | **2.8 (2.0)** | 3.0 | 2.8 | 2.8 | 2.5 | 2.3 |
| sqlite__read_query | 52.5 (51.0) | 52.5 | 52.5 | 52.5 | **2.3 (1.8)** | 2.3 | 1.8 | 1.5 | 1.5 | 1.5 |

OATS is a **cliff, not a curve**: zero effect at N≤3 (minPositives floor), then rank ~50-70 → top-3 in one nightly at N=4, then saturation (cos to evals ~0.22-0.34, flat). Post-learning hybrid rank sits 1-2 positions worse than dense rank: the 0.3 lexical weight drags zero-overlap needs.

## (b) Idempotence / drift — runOats ×30 on unchanged data

- All 29 consecutive L2 deltas of the adj vector: **exactly 0** (bit-identical). `runOats` recomputes from `base` + outcome window every time — stateless, cannot drift or oscillate by construction.
- Single shot moves the vector substantially: L2(adj, base)=.6733, cos(adj, base)=.7734, cos(adj, posCentroid)=.5626.
- Hypothetical chained feedback (adj fed back as base — NOT what the code does): converges geometrically (deltas .6733, .4340, .2362, … 6.4e-10 at step 30) to a fixed point at cos .9031 with the positive centroid. No oscillation even then.

## (c) Destructive interference — fetch__fetch serving two orthogonal families

cos(SCRAPE centroid, POLL centroid) = .2783. Mean hybrid rank (mean cos) on held-out evals:

| condition | SCRAPE evals | POLL evals |
|---|---|---|
| base | 5.0 (.382) | 34.3 (.106) |
| scrape-only (6 wins) | **1.3** (.568) | 22.3 (.152) |
| poll-only (6 wins) | 10.7 (.324) | **3.3** (.433) |
| dual (6+6) | 2.7 (.486) | 7.0 (.301) |

Two real effects: (1) **single-mode learning damages the other mode below baseline** — poll-only learning pushed SCRAPE from 5.0 to 10.7 (adj fully replaces base, so the vector loses its generic semantics); (2) **dual-mode learning is ~2× worse than each single-mode optimum** (2.7 vs 1.3; 7.0 vs 3.3) — one mean-of-positives centroid cannot represent a two-mode tool.

## (d) Negatives — measured-wrong `git__git_show` vs right `fs__read_text_file` (LOCALREAD needs)

- **Failures only** (5 × `tool_fail:other`): `runOats` → `{adjusted: 0}`. β never engages without ≥4 positives on the same tool; wrong tool stays at mean rank 6.0. A tool that only ever fails keeps its base vector — and nothing else in `draftCandidates` demotes a scored candidate by rating.
- **Realistic** (5 own-family successes + 5 failures on confused needs): wrong tool dense 18.7→22.0, hybrid 6.0→6.3 — β=0.1 push-away is nearly cosmetic. Right tool: 21.0→21.0 (zero passive gain). Collateral on the full 66-need suite: hit5 .788→.788, MRR .647→.647, 3 needs with |Δrr| ≤ .004 → no collateral damage, but also no fix: the only lever that actually repairs confusion is positive evidence on the right tool.

## (e) Poisoning — mislabeled successes on `memory__search_nodes` for WEBSEARCH needs

Damage (fresh store per P; right tool = `brave__brave_web_search`):

| P mislabeled | poisoned rank (dense, cos) | right rank | right hit@1 |
|---|---|---|---|
| 0-3 | 17.8 (23.5, .146) | 12.0 | 1/4 |
| 4 | **3.5 (3, .307)** | 12.8 | **0/4** |
| 5 | 3.5 (3, .306) | 12.8 | 0/4 |

Four mislabeled successes flip #1 on 2/4 eval needs (incl. the shared-suite need) to the wrong tool. Recovery, P=5 held:

- **By right-tool successes**: R=1-3 nothing (floor again), R=4 → right tool 2.3, hit@1 3/4 (better than its 1/4 baseline — it learned the family); poisoned tool stays at 3.8 (still polluting top-5 at R=7).
- **By diverse failures on the poisoned tool**: F=1 → rank 7.3 (cos .211); F=6 → rank **5.0** (cos .259). **More failures = weaker push-away.**
- **By failures on the very poisoned needs** (real store, retry loop): 5/10/15 failures → dense rank 4/4/4 (from 3). Poison survives 15 direct failures essentially intact (pre-poison rank: 23.5); with identical centroids, β=0.1 cancels only ⅓ of α=0.3.

**Mechanism (follow-up, pure `oatsAdjust` on the same real vectors):** `meanVec` of diverse unit vectors has norm < 1. negCentroid norm: 1.0 (F=1) → .5547 (F=6), cos-to-evals rising .2099→.2584 in lockstep; with the SAME need repeated, norm stays 1.0 and cos freezes at .2099 (repetition adds zero push). Counterfactual with unit-normalized centroids: ~flat .287-.292 (artifact mostly gone). Positive side has the same artifact: pos-centroid norm .6256 (N=4) → .469 (N=12), i.e. effective α silently shrinks ~25% as evidence diversifies.

## (f) The 0.15 abstain gate after realistic light usage

- Light usage (4+4+3 successes on 3 tools): `{adjusted: 2, skipped: 131}` — the 3-success tool learned nothing (floor) and drifted 102→108 from sibling adjustments; the two 4-success tools jumped 108→2 and 74→3.
- Spans: shared 66 needs **66/66 ≥ 0.15 before AND after** (min .2175→.2099); trained-family evals min span .2803 (OATS raises the max cos, widening spans).
- Contrast: the 4-tool dense-live micro-corpus measures span .0990 → abstains. **The gate is a small-roster phenomenon; at 133-tool scale it is always open — even with noisy base MiniLM vectors, dense governs every draft.** (Fine for quality here: dense-only rank-1 36/66 vs lexical 26/66; and min spans .21-.22 sit not far above 0.15 — untested intermediate roster sizes may straddle the threshold.)

## Conclusions

1. Learning works and is fast — but everything is gated by the same cliff at 4: legitimate learning, poisoning, and recovery all switch on at exactly 4 positive outcomes. Nothing at 3, everything at 4.
2. `runOats` is exactly idempotent (recomputes from base); no drift is possible by construction.
3. One centroid per tool cannot represent multi-purpose tools: learning one use-mode measurably damages the other (below-baseline), dual-mode learning halves the benefit of each.
4. Failures are nearly inert in draft ranking: failure-only tools never adjust; β=0.1 push-away is cosmetic (≤3 dense ranks) and **anti-monotone** — more diverse failures weaken it (centroid-norm artifact), repeated identical failures add nothing, and 15 direct failures cannot undo 5 mislabeled successes. Within the draft path, only successes move rankings.
5. The dense-abstain gate never fires at realistic corpus scale; it protects only tiny rosters.

**Proposals (measurement-backed, not implemented):** normalize (or count-weight) centroids in `oatsAdjust` so evidence magnitude doesn't decay with diversity; consider letting sustained failures act without the positive floor (or demoting scored candidates by rating in `draftCandidates`); consider multi-prototype adj vectors (per need-cluster) for multi-mode tools; document the gate's scale-dependence.
