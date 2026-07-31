# Gap experiments — measure first, change only what wins

Every disclosed gap in `post-round5-closure.md` §Residual limitations was turned
into an experiment with a **pre-registered decision rule**, run, and then handed
to an independent agent whose only job was to REFUTE it. Two of the six
recommendations were changed by that verification step, and one experiment's
headline claim was corrected by re-measurement. Base: `06f6c36`.

Only **E3** produced a production change. The rest are documented outcomes.

| # | Hypothesis | Verdict | Verifier | Outcome |
|---|---|---|---|---|
| E1 | RRF beats the weighted min-max fusion | **BLOCKED** | — | harness landed; fusion untouched |
| E2 | Thompson sampling beats Wilson-LCB for routing | **REFUTED** | upheld | no change; a separate real degeneracy found |
| E3 | the `rm` rule can catch split/long flags | **CONFIRMED** | upheld (2 fixes) | **shipped** (`af5d852`) |
| E4 | `serve` shutdown can be tested platform-neutrally | CONFIRMED | **refuted** | not shipped — the seam costs a static guard |
| E5 | dependency majors are safe | MIXED | **refuted** | not shipped — the safety criterion is insensitive |
| E6 | `node:sqlite` could replace better-sqlite3 | CONFIRMED | upheld | document only; it is a version wait |

## E1 — RRF vs weighted fusion: BLOCKED, and honestly so

`exp-fusion-rrf.mjs` is complete and self-proving: real `CoachStore`, the real
133-tool corpus, real FTS5 bm25, a `fuseMirror()` whose top-5 is asserted equal to
the real `draftCandidates()` (**0 mismatches / 66 needs**), 15 arms (shipped
control + 3 references + 11 challengers incl. RRF k∈{0,1,10,20,60}), paired
bootstrap CIs (10,000 resamples) and exact McNemar. The parity guard is itself
mutation-tested: scaling the mirror's cosine term 0.5× produces 35/66 mismatches
and a fatal exit.

It cannot produce a verdict here, for two independently confirmed reasons:
`huggingface.co` is **403 Forbidden** through the sandbox proxy (so no real MiniLM
inference), and the archived `results-retrieval-minilm.json` **cannot be replayed** —
its `perNeed[]` records `lexTop5`/`hybTop5`/`lexRankFull`/`hybRankFull` but no
pure-dense ranking and no per-tool scores, and RRF needs the dense ranker's ranks.
(That file is also stale: its `meta.shipped` says 0.3/0.7 while `store.ts` ships
0.15/0.85.)

Run it where HF is reachable — the CI `dense` job already downloads this exact
model:

```
node docs/lab/exp-fusion-rrf.mjs --embedder=real
```

**Pre-registered decision rule.** Primary arm is `rrf_k60` (Cormack/Clarke/
Buettcher default); the rest are exploratory under Bonferroni α = 0.05/11 =
0.00455. Adopt RRF only if hit@1 **and** MRR both improve **and** both paired 95%
bootstrap CIs exclude 0. A tie does not justify churn. At n=66 one need is 0.0152
of hit@1, so small deltas are noise; per-style cells (verbose n=2, typo n=1,
non-english n=2) are never actionable alone.

**Structural caveat, embedder-independent.** Over 133 tools the corpus yields
mean **8.2** lexical candidates per need (min 0, max 28; 4/66 needs have *zero*).
Below that thin lexical head every RRF arm degenerates to dense-only order
rescaled, so RRF's leverage here is interleaving ~8 documents into 133. If the
real run shows RRF flat, that is the likely cause — and it is **not** evidence
that rank fusion fails in general.

**Do not touch** `HYBRID_LEX_WEIGHT`, `HYBRID_COS_WEIGHT`, `LEX_SCORE_FLOOR` or
`MIN_INFORMATIVE_COS_SPAN` on the strength of anything in this note.

## E2 — Thompson sampling for routing: REFUTED

Cumulative regret vs the set-best, mean [95% CI] over ≥1,000 seeds, modelling the
real shape (retrieval proposes the candidate set, the rating re-ranks within it):

| scenario | WILSON-LCB (status quo) | THOMPSON | UCB1 |
|---|---|---|---|
| S1 separated .90/.60 | **58.4** [57.3, 59.6] | 82.1 [81.5, 82.7] | 397.8 |
| S2 close .72/.70 | **61.8** [60.7, 63.0] | 114.9 [113.9, 115.8] | 290.6 |
| S3 cold start | 102.5 [97.9, 107.1] | **90.4** [89.8, 91.1] | 351.9 |
| S4 non-stationary | **101.8** [99.7, 103.9] | 130.9 [130.0, 131.7] | 372.3 |

Thompson wins **only** the cold-start scenario and loses the other three
decisively. The pessimistic bound is the better routing signal here, because
retrieval — not the rating — controls the candidate set. **No change.**

**But the experiment surfaced a real degeneracy in shipped code**, independent of
any policy choice: `wilson(0, 5)` = `wilson(0, 50)` = **0**, which ties the
`COALESCE(0)` of never-tried tools. So a tool that failed **50 out of 50** sorts
*above* untried tools in the rated-fallback SQL and appeared in the top-5 on
200/200 identical drafts. A proven-bad tool outranking an unknown one is
backwards. The verifier also found the experiment's blast-radius probe was
**vacuous** (it compared a value with itself) and re-did it properly: on a need
where the fallback fires, one 40/40 rating moves an unrelated tool to rank 0.
Fixing the tie is worth doing; the evidence for the specific Laplace-smoothing
patch was damaged by that probe defect, so it needs its own measurement first.
Tracked, not shipped. Raw: `results-rating-degeneracy.json`.

## E3 — split/long-form `rm`: CONFIRMED and SHIPPED (`af5d852`)

recall **0.0967 → 1.0000**, precision **0.385 → 0.966**, FPR 0.00368 → 0.00083 on
a 500,000-case differential fuzz against a getopt oracle; McNemar b=12,293 c=405,
p<1e-7. Two false-positive classes also fixed: `rm` inside a flag/assignment, and
a separator that crossed a bare newline. Specificity improvement was **not**
established (CI includes 0) and is not claimed. See the commit for the full
rationale; harness `exp-rm-heuristic-fuzz.mjs`, summary `results-rm-heuristic.json`.

**Correction to the experiment's own headline.** It reported the `\b` anchor as a
"quadratic" discovery in a way that reads as a shipped defect. Re-measured
directly: the **predecessor** pattern is linear on `rm -rm -rm …` (0.5 ms at
64 KB) because its lookaheads never leave the first cluster. The quadratic blowup
(6,721 ms at 64 KB) belongs to the **new** token-scanning construction, which is
why `(?<![-\w=])` is load-bearing *for it*. No shipped ReDoS existed.

## E4 — Windows shutdown coverage: proposal REFUTED, not shipped

The experiment produced a genuinely good test: 11 platform-neutral cases driving
the real `installGracefulShutdown` via `process.emit`, stdin events and
`server.onclose`, catching **15/15** mutations (idempotence guard, listener
cleanup, exit codes, each missing registration, `void` instead of `await`) where
the existing POSIX subprocess suite caught only 1/15.

The verifier reproduced every number **1:1** and then refuted the recommendation
by running a mutation the experiment never tried: **deleting the call site** —
the original C3 orphan bug. Today that fails instantly and platform-independently
because Biome reports `noUnusedVariables` on the now-unreferenced function. Add
`export` and the same bug passes `tsc -b`, `typecheck:tests` **and** `biome lint`
(an exported symbol is never unused), leaving only a 40-second POSIX-only timeout
— and it is fully green on the `windows-latest` job, the exact dimension the
change claims to improve.

So the one-word seam is a **net trade**, not a win, and it was not shipped.
The likely resolution — untested, deliberately deferred rather than rushed — is
the seam the experiment rejected for touching two files: move the function to its
own module and import it, so deleting the call site leaves an **unused import**
and the static guard survives alongside the new coverage. Patch and test:
`e4-*` in the session scratchpad.

## E5 — dependency majors: gates pass, but the criterion is insensitive

| group | build | typecheck | lint | test | verdict |
|---|---|---|---|---|---|
| G1 smol-toml / vitest / tsx (patches) | ✓ | ✓ | ✓ | 366/366 | in-range; lockfile-only |
| G2 biome 2.5.6 | ✓ | ✓ | **✗** 2 warnings | 366/366 | needs 3 measured edits |
| G3 better-sqlite3 13.0.2 | ✓ | ✓ | ✓ | 366/366 | see below |
| G4 @types/node 26 | ✓ | ✓ | ✓ | 366/366 | **reject** — types above the `>=22.13` floor |
| G5 typescript 7.0.2 | ✓ | ✓ | ✓ | 366/366 | passes, but see below |

The verifier's finding is the important one: **"366/366 passed" does not establish
that a native-module upgrade is safe.** It mutated the installed better-sqlite3 to
(a) return plain `Uint8Array` instead of `Buffer` for every BLOB and (b) make
`PRAGMA journal_mode = WAL` silently no-op — so the real `openCoachDb` reported
`journal_mode = "delete"` — and the full suite **still passed 366/366**, including
the cross-process contention test (which asserts only that 4 workers exit 0 and
the aggregate matches; with `busy_timeout` both hold in rollback-journal mode).

The suite therefore has a genuine coverage hole: nothing asserts WAL is actually
enabled or that vector blobs round-trip as `Buffer`. **Correct sequencing: add
those assertions first, then the upgrade becomes verifiable.** Not shipped.
Raw: `results-dep-majors.json`.

## E6 — node:sqlite: a version wait, not a hard blocker

FTS5 — the decisive question, since lexical retrieval is FTS5+bm25 — is **present
and bit-exact**: over the real 133-tool index × 66 real needs, 541/541 rows,
66/66 identical id order, `max|Δbm25| = 0`.

FTS5 availability bisected against real nodejs.org binaries:

| Node | node:sqlite | SQLite | FTS5 |
|---|---|---|---|
| 20.20.2 | absent | — | — |
| 22.13.0 – 22.15.0 | present | 3.47.2 / 3.49.1 | **NO** |
| **22.16.0** | present | 3.49.1 | **YES** ← first |
| 22.17+ / 24.18.1 / 26.x | present | 3.50–3.53 | YES |

`engines.node` is `>=22.13`, so **four admitted releases cannot run `migrate()`**
— migrating requires raising the floor to `>=22.16`. Other gaps: no `db.pragma()`
(use `exec()`/`prepare().get()`), `{timeout}` is **silently ignored** on 22.13,
`foreign_keys` defaults to 1 (better-sqlite3: 0), and `synchronous` defaults
differ. The experimental warning disappears at 24.18.1.

**Do not migrate now.** The prize is real (better-sqlite3 is the only native
dependency, and native builds are the main `npx` install friction), but it is a
floor bump plus a pragma shim, not a drop-in. The experiment's own proposed patch
is **not** applied: the verifier found it claimed a `synchronous` measurement its
own artifact contradicts, and that it introduced a durability regression.
Raw: `results-node-sqlite-crossversion.json`.

## Method note

Six experiments, six adversarial verifications, all artifacts under the session
scratchpad. What the verification step bought: two recommendations reversed (E4,
E5), one vacuous probe caught (E2), one false verification claim caught (E6), and
two lint defects plus a "this test is optional" claim corrected in the one change
that shipped (E3). A self-review would have shipped E4.
