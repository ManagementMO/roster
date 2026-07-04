# ratings-math — Ratings math property-tested against independent references

**Question.** Is the math behind ROSTER's public trust numbers — Wilson lower bound, rating recomputation (§6.2 exclusions + class weighting), the rated fallback, percentile/latencyBucket — exactly right on the **built dist**, measured against independently re-derived reference implementations and hand-computed tables in a **real better-sqlite3 store**?

**Method.** Six scripts (`exp-ratings-math-{a,b,c,d,e,e2,f}*.mjs`), all importing built packages via `createRequire(packages/cli/package.json)` exactly like `docs/verification/dense-live.mjs`. References written fresh from the cited formulas: Wilson via the algebraically-equivalent closed form `(2s + z² − z√(z² + 4s(n−s)/n)) / (2(n+z²))` (different float path than the repo's centre/spread form), percentile via Wikipedia nearest-rank. Real DBs only (`:memory:` + a file-backed DB under tmp for reopen tests); soft_fail rows produced by the *real* retry-with-modified-args rule, never by flag injection. Seeded PRNG (1337). Raw output: `docs/lab/results-ratings-math.json`. Total compute ≈ 0.2 s.

## (a) wilsonLowerBound vs independent Evan Miller reference

| Property | Checks | Result |
|---|---|---|
| Agreement with independent closed form | 5,017 pairs (n∈0..10000, s≤n, + forced edges) | **max abs diff 3.33e-16** (argmax s=2119, n=2127) |
| Output ∈ [0,1] | all 5,017 | 0 violations (min 0, max 0.99962 at 10000/10000) |
| s+1 at fixed n never lowers LB | 47,150 (full sweep n≤300 + 2,000 random n≤10000) | **0 violations** |
| Same p̂ at larger n raises LB (k∈{2,3,5,10}) | 2,000 | 0 violations; 0 non-strict with p̂>0 |
| z=0 collapses to p̂ exactly | 200 | max diff 0 |
| Edges | n=0→0, (0,1)→0, (1,1)→0.20654, (0,10000)→0 | as specified; s<0 and s>n throw RangeError |
| Docstring claim wilson(3,3) < wilson(84,100) | 0.43849 < 0.75580 | holds |

NaN inputs propagate to NaN output (typed API; unreachable from the real pipeline — `recordOutcome` clamps latency and counts are integers). **Verdict: the League's ranking key is exact.**

## (b) recomputeRatings vs hand-computed table (real store)

5 constructed capabilities, outcomes seeded through the public API; all comparisons against independently computed expectations:

| Case | Construction | Expected (hand) | Got | Pass |
|---|---|---|---|---|
| t__A | 10 success, lat 10..100 | n=10 s=10 w=0.72246 p50=50 p95=100 | identical | ✓ |
| t__B | 3 success + 2 tool_fail:timeout @5000ms | n=5 s=3 w=0.23072 p50=200 p95=300 (5000 nowhere) | identical | ✓ |
| t__C | 4 success + 9 **explored** rows | n=4 s=4 (explored invisible) | identical | ✓ |
| t__D | retry-with-different-args → real soft_fail flip | n=1 s=1 p50=p95=70 | identical; SQL shows o1.soft_fail=1, o2 clean | ✓ |
| t__E | 1 of each failure class + lat 12.6→13, −50→0 | n=6 s=2 w=0.09677 p50=0 p95=13 | identical (w diff 9.7e-17) | ✓ |

Also verified: no-outcome capability → `getRating` null; a raw-SQL row with `class='weird_legacy_class'` is excluded by `isAttributable` (n stayed 10). Class weighting is exactly: every failure class +1 to n, +0 to successes; failure latencies never touch p50/p95.

**Two latent traps measured (not spec violations today):**
1. **`recomputeRatings(category)` does not filter by `intent_cat`.** `recomputeRatings("web")` on a store with 2 success tagged `web` + 8 fails tagged `files` wrote **n=10, s=2 under category 'web'** (would be n=2, s=2 if filtered) — and wrote global rows under 'web' for *every* capability with outcomes. Runtime only ever calls `"all"`, so nothing is user-visible yet; the first caller to pass a real category gets confidently mislabeled per-category ratings.
2. **Stale ratings persist.** After a capability's attributable set empties (its only success soft-failed via the real retry rule + an explored follow-up), `recomputeRatings` leaves the old row: rating still n=1, w=0.20654 with 0 attributable rows behind it. That stale wilson_lb keeps feeding `ratedFallback` ordering indefinitely.

## (c) rated fallback under gibberish needs (zero FTS hits)

Roster 5 and 133 (shared corpus), rated trio seeded (X 9/10→0.5958, Y 3/3→0.4385, Z 1/1→0.2065), distinct last_seen:

| Measure | roster 5 | roster 133 |
|---|---|---|
| FTS hits for gibberish | 0 | 0 |
| Draft k=5 non-empty | 5/5 | 5/5 |
| Order = wilson desc, then last_seen desc (independently computed) | exact match | exact match |
| 10 repeats identical | yes | yes |
| 3 full rebuilds identical | yes | yes |
| Candidate shape | score=0, lexScore=null, cosScore=null | same |

All-ties variant (no ratings, identical last_seen, 133 tools): stable across 10 repeats and 3 rebuilds; observed order = insertion (rowid) order. File-backed DB: order identical at build and across 10 close/reopen cycles. k beyond roster size returns the whole roster (5), no invention. Backfill LIMIT boundary (e2): 4 lexical hits that are also the top-4 rated, k=5 → the single backfill slot correctly seats the 5th-rated tool at the exact `LIMIT limit+exclude.size` boundary; no duplicates ever observed.

## (d) percentile + latencyBucket edges

percentile (nearest-rank): **108/108 agreement** with the independent reference over len 1..12 × p∈{0,1,25,50,75,90,95,99,100}. Empty→null (all p), single→that element, all-ties→tie value, exact-boundary p on N=4 → {10,20,30,40}, p95 of 1..20 → 19. Median of [1,2] → 1 (lower-median convention — worth knowing when quoting p50). Out-of-contract: p<0→first, p>100→last, p=NaN→null, unsorted input trusted (garbage in → garbage out; the one caller sorts).

latencyBucket: all finite boundaries left-closed/right-open as labeled-ish: 249→"<250", 250→"250-1000", 1000→"1000-4000", **4000→">4000"** (label says *greater than*, code means ≥). **NaN→">4000"** (worst bucket), −∞→"<250". Note: `latencyBucket` has **zero call sites** outside its own test — dead public export today.

## (f) The interesting wound: zeroed worst lexical hit vs the fallback (cold start)

Found while probing (e2) diagnostics; corroborates and hard-quantifies the sibling `lexical-edges` finding (their §D). Mechanism: `lexicalSearch` min-max-normalizes bm25 so the **worst genuine hit gets lexScore exactly 0**; `draftCandidates` keeps only `score > 0`; the dropped hit re-enters only if rating/recency re-selects it.

Cold-start (unrated) 133-tool store, flagship need **"write"**: FTS hits = [sqlite__write_query (1.0), fs__write_file (0.0)] → draft k=5 = **[sqlite__write_query, firecrawl_extract, firecrawl_search, firecrawl_crawl, firecrawl_map]** — a literal keyword match is absent while four unrelated recency-filler tools take its seats. Scan of all 97 single-token needs with 2–5 hits: 90/97 have a zeroed worst hit; **85/97 (87.6%) end with a genuine FTS hit missing from the k=5 draft**. Mitigation measured: ONE success on the dropped tool (wilson 0.2065 > 0) re-seats it at #2 — so the wound is specific to cold-start lexical-only mode, exactly when lexical is the only signal. Supports sibling proposal: keep worst-ranked genuine matches instead of `score>0`-dropping them.

## Conclusion

The named-score math is **exact**: Wilson LB agrees with an independent implementation to 3e-16 with all monotonicity/humility properties intact (47k+ checks), rating aggregation matches hand-computed tables including real soft_fail/explored exclusion, the rated fallback is correctly ordered and deterministic across repeats/rebuilds/reopens, and percentile matches nearest-rank 108/108. The truths worth acting on are at the seams: the category parameter that silently doesn't filter, ratings that never expire when their evidence empties, and — sharpest — the cold-start draft that drops a literal keyword match for 87.6% of narrow needs in favor of arbitrary recency filler.
