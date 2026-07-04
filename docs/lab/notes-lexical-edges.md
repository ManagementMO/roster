# notes-lexical-edges — FTS5 edge cases, stopword pollution, query-safety fuzz

**Question.** Where does the lexical rung (FTS5/BM25, `CoachStore.lexicalSearch` + `draftCandidates` with no needVec — the real cold-start production mode) break: tokenization mismatches, stopword-driven wrong tools in the visible top-5, hostile query strings, and normalization edge cases?

**Method.** Real `CoachStore` over real SQLite FTS5 (better-sqlite3, sqlite 3.53.2), shared 133-tool corpus + 66 ground-truthed needs. No mocks, no embeddings (lexical-only is a real production mode). Script: `docs/lab/exp-lexical-edges.mjs`; every number below traces to `docs/lab/results-lexical-edges.json`. Runtime 402 ms.

Relevant code facts (read, then measured): FTS table is `fts5(id UNINDEXED, name, description, body)` — **default unicode61 tokenizer, no porter stemming**; query sanitizer is `need.toLowerCase().match(/[a-z0-9]{2,}/g)`, tokens quoted and OR-joined; `draftCandidates` min-max normalizes bm25 within the result set and drops candidates with `score <= 0`, then backfills with rating/recency filler.

## A. Tokenizer reality (15 tools × 6 morphological variants)

| variant | found rate | hit@1 | hit@5 | MRR (lex) | mean rank when found |
|---|---|---|---|---|---|
| base ("search files") | 1.000 | 0.80 | 1.000 | 0.900 | 1.2 |
| snake ("search_files") | 1.000 | 0.80 | 1.000 | 0.900 | 1.2 |
| hyphen ("search-files") | 1.000 | 0.80 | 1.000 | 0.900 | 1.2 |
| **camel ("searchFiles")** | **0.000** | 0.00 | 0.000 | **0.000** | — |
| **plural flip ("search file")** | 0.933 | **0.40** | 0.667 | **0.521** | 5.0 |
| **verb form ("searching files")** | 0.933 | 0.533 | 0.867 | **0.689** | 2.2 |

- snake/hyphen are free: both the sanitizer and unicode61 split on `_`/`-` (probe: doc named `search_files` matches `"search"`).
- camelCase is a black hole in BOTH directions: query `searchFiles` → single token `searchfiles` → 0 results for every one of 15 snake-named tools. Index side: real camelCase tool names exist in the corpus (everything server) — `"print env"` returns **0 rows** for `printEnv` (probe: doc `searchFiles` only matches `"searchfiles"`). `longRunningOperation` is reachable only because its *description* repeats the words.
- No stemming, measured: `"file"` does not match a doc saying "files"; `draft("committing", 5)` = `fs__read_file, fs__read_text_file, fs__read_media_file, fs__read_multiple_files, fs__write_file` (pure filler, zero git tools); `draft("commits", 5)` puts `github__list_commits` #1 and `git__git_commit` **nowhere**. Plural flips crater hit@1 from 0.80 to 0.40 ("create directories" → rank 18, "search nodes"→"search node" → rank 12).

## B. Stopword pollution (66 needs, draft k=5 = the user-visible surface)

Charter stopword set {for, the, a, in, to, my, that}; matched-token attribution is exact (per-token FTS queries).

| metric | value |
|---|---|
| needs with ≥1 stopword-only wrong tool in top-5 | **17/66 (25.8%)** |
| contaminated slots | 40/330 (12.1%) |
| extended function-word set (adds is/it/this/about/of/…) | **29/66 needs (43.9%)**, 74/330 slots (22.4%) |
| needs where a stopword-only contaminant outranks every primary | **7/66 (10.6%)** |
| stopword-only contaminants at rank **#1** | 8 (ext. set) |

The fs-tool-for-a-memory-need incident class reproduces exactly:

- `"remember that the user prefers dark mode"` → #2 `git__git_diff_staged` [that], #3 `git__git_diff_unstaged` [that,the], #4 `fs__list_allowed_directories` [that,the], #5 `firecrawl__firecrawl_search` [the]. No memory tool in top-5.
- `"show me the stack trace for that production error"` → **#1** `git__git_diff_staged` matching only [for, that] with lexScore 1.0; the primary (`sentry__get_sentry_issue`) sits at #3.
- `"make a folder for the build artifacts"` → slots #2–#5 all wrong tools matching only [for].
- `fs__list_allowed_directories` ("Returns **the** list of directories **that** this server **is** allowed **to** access") is a serial magnet: rank #1 for 5 different needs purely via function words.

BM25's IDF does not save a 133-doc corpus, and min-max normalization then awards lexScore **1.0** to a pure-stopword match whenever stopword matches are all there is.

## C. Query-safety fuzz (206 hostile inputs)

**0 throws, 0 SQL-level errors, 0 integrity damage.** FTS5 operators (`AND/OR/NOT/NEAR/^/*/:/()`), SQL injection shapes, quote storms, unicode (CJK/RTL/zalgo/lone surrogates/ZWJ), emoji, control chars incl. `\x00`, 10 KB–100 KB strings, 5000-unique-token inputs, all 32 ASCII punctuation singles. Raw-SQL probing (bypassing the store's silent `catch`) confirms the sanitizer alone makes the MATCH string injection-proof by construction — the catch is dead weight in practice. `PRAGMA integrity_check` ok; capability/fts counts unchanged (133/133).

- No FTS5 OR-term limit found up to 30,000 terms (binary search ran raw; `firstFail=null`).
- Performance: draft p50 0.03 ms, p95 0.08 ms, max **11.27 ms** at 5000 unique tokens. No DoS surface found.
- Zero-token inputs (emoji-only, CJK-only, punctuation, `"🔥"`) skip FTS and return **5 recency-filler tools** (`fs__read_file` first) presented by `draft` as "the best ≤K capabilities" — `toCard()` carries no score/filler marker, so the agent cannot tell filler from a bm25-1.0 match.

## D. Normalization edges + sanitizer over-strip

- **1 candidate**: lexScore 1. **All-equal ranks (span 0)**: all get 1, all kept. **2 candidates**: worst gets lexScore **0** → `score > 0` filter **silently discards it**. Mini-repro (results `sectionD.d2_twoCandidates`): two csv tools; `draft("csv", 2)` = `[alpha__export_csv, gamma__unrelated_a(rotate_logs)]` — the only other csv tool (`beta__dump_table`) is displaced by an unrelated rated tool; in `draft("csv", 5)` it trails at #5 behind all three unrelated tools.
- Real corpus: 4/66 needs had 2–5 lexical matches; in **4/4** the worst match was dropped from the top-5 (this run's dropped tools were not ground truth, so no benchmark damage here — the mechanism is confirmed, the blast radius was lucky). Asymmetry: two docs with *identical* bm25 are both kept; differing by ε → one dropped.
- Benchmark nuance: draft-top-5 hit@5 **0.621** vs raw lexical top-5 **0.591** — filler backfill currently *rescues* more than it costs, purely because fs read tools are corpus-first in recency order (luck, not design; MRR is a wash: 0.460 vs 0.461).
- Over-strip: `"e-mail"` → tokens `[mail]` → misses a doc saying "email"; `"café"` → mangled token `caf` → 0 hits (doc says "cafe"); `"c++ code"` → `[code]`; single digits die (`"add 3 and 4"` → `[add, and]`; `everything__add` ranks **#4** behind `github__add_issue_comment`, `slack__slack_add_reaction`, `memory__add_observations` — its own description says "Adds", which doesn't match "add" either). Hyphen compounds (`final-report.txt`) are fine.

## Conclusion

The lexical rung is **injection-proof and fast** (206-input fuzz: 0 throws, 0 hidden SQL errors, ≤11 ms worst case) but **morphologically brittle and stopword-polluted**: no stemming (plural MRR 0.521 vs 0.900 base; "committing" → all-filler draft), camelCase unreachable both ways (0/15), and function words alone put wrong-source tools into the visible top-5 for 25.8% of needs (43.9% with the fuller set), including rank-#1 slots. Two smaller structural quirks: the min-max+`score>0` combo always discards the worst genuine lexical match (halving a 2-candidate result), and rating/recency filler is indistinguishable from real matches in the draft response.

**Proposals (unimplemented — measured baselines above make the deltas testable):** (1) query-side stopword drop (keep them only when they're ALL the tokens); (2) porter tokenizer on `capability_fts` or query-side plural/gerund folding; (3) split camelCase in both the sanitizer and the indexed name text; (4) keep worst-ranked genuine matches (`lexScore !== null`) instead of score>0-dropping them; (5) mark filler entries in the draft response so agents/trust surfaces can tell.
