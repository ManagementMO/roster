# Post–Round 5 closure

Closure of the audit backlog that remained after Round 5 hardening merged
(`main` at `075690f`, PR #10). Every item below was **reproduced against the
current tree first** — the review claim was treated as a hypothesis, not fact —
then either fixed under TDD or dispositioned with evidence. Nothing here changes
a deliberate design (classifier ordering, OATS, output-validation policy)
without a measured counterexample.

## Method (applied to every fixed item)

1. **Reproduce** the claim on the current branch (a failing test, a probe, or a
   read of the shipped behavior) — disprove it if it does not hold.
2. **RED**: a behavioral test that fails for the intended reason (never a
   missing export or setup error).
3. **Fix**, then **GREEN**.
4. **Mutation-check**: disable the shipped guard with one uniquely-anchored edit,
   prove the focused test goes RED, then restore by rewriting the exact
   pre-mutation bytes and verify a **byte-identical** SHA-256. Mutation scripts
   and patches live outside the repo and are never committed.
5. **Atomic commit** per item; `git diff --check` clean.

## Gate at closure

- `pnpm build` (tsc project references) — clean.
- `pnpm typecheck` (build **plus** the new no-emit test typecheck) — clean.
- `pnpm lint` (biome `--error-on-warnings`) — clean.
- `pnpm test` — **360 / 360** across 14 files, green **including under uid 0
  (root)**; the two era-closure tests that previously failed as root are fixed.

## Claims matrix

| # | Area | Finding (as claimed) | Disposition | Commit |
|---|------|----------------------|-------------|--------|
| C1 | playbook | destructive-command scan could catastrophically backtrack; SKILL.md read unbounded | **Fixed** — linear lookahead matcher, no flag-length bypass; bounded no-follow SKILL.md read | `e8f9a01` |
| C2 | coach | drift `defHash` omitted safety/contract metadata (annotations, execution, title, schemas) | **Fixed** — canonical hash over all safety/contract fields; versioned re-baseline | `b2be4f0` |
| C3 | cli | client `type:"stdio"` annotation broke eject ownership match | **Fixed** — ownership tolerates known-inert client annotations, rejects meaningful env / conflicting transport | `0096cf0` |
| C4 | cli | stale-lock reclamation was read-then-blind-remove (two owners at once) | **Fixed** — atomic rename-claim + token+liveness verify; never destroys a live lock | `13f7ab5` |
| C5 | cli | key-level eject could not resume from a partially-applied third state | **Fixed** — journal re-derives key-level restore idempotently instead of deadlocking | `f3dfb75` |
| C6 | cli/router | `roster serve` orphaned backend children on termination | **Fixed** — idempotent graceful shutdown on SIGINT/SIGTERM/stdin-EOF/transport-close | `b3f1185` |
| C7 | router | one uncompilable tool `outputSchema` ($ref) took the whole backend offline | **Fixed** — per-tool isolating validator; valid schemas still enforced (PR #10 drift parity) | `42fd8f5` |
| L8 | combine | verifier file reads could hang on a FIFO, OOM on a huge file, or follow a swapped-in symlink | **Fixed** — bounded, non-blocking, no-follow, regular-file-only read | `38fc2fb` |
| L9 | league | duplicate `(suite,version)` authority resolved by unsorted readdir order | **Fixed** — duplicate key poisoned (fail-closed), suite load sorted | `1d4166f` |
| L10 | combine | `resultContains: "size"` asserts a label, not a value (weak verifier) | **Fixed** — assert exact value with boundary, measured vs the real server source; semantics documented | `0ed5f55` |
| L11 | coach | `recomputeRatings` transaction mode unsafe under contention | **Investigated — safe; documented + proven** — write-only txn after reads, busy_timeout, eventual-consistency; cross-process test | `8a0fa1a` |
| L12 | cli | interrupted sync orphaned `.staging-*` backup dirs forever | **Fixed** — sweep orphans under the sync lock (race-free) | `788cffd` |
| L13 | tests | two era-closure tests fail under root (chmod is a no-op for uid 0) | **Fixed** — deterministic fs-mock fault injection, uid/platform-independent | `3931dd0` |
| L14 | cli | PID-reuse / NFS / Windows lock claims unexercised | **Platform-only reductions documented; platform-neutral logic tested** — token identity, live-owner refusal, non-positive-pid rejection | `91dc94d` |
| L15 | tests | test files never typechecked (bad imports slip to runtime) | **Fixed** — no-emit test-typecheck gate + CI step; five latent test type errors fixed | `ef68669` |

## Notes on the two non-fix dispositions

- **L11 (safe by design).** `recomputeRatings` deliberately scans outcomes and
  aggregates *outside* the transaction, holding the write lock only for the
  DELETE/UPSERT — so a maintenance recompute cannot stall the hot
  `recordOutcome` path for the length of the read. The transaction body is
  write-only, so `BEGIN DEFERRED` takes the write lock on its first write and
  cannot hit `SQLITE_BUSY_SNAPSHOT`; `busy_timeout=5000` absorbs contention; a
  full recompute makes any concurrently-missed outcome eventual-consistent. A
  four-process contention test proves no crash/corruption and a consistent final
  aggregate; dropping `busy_timeout` turns it red.
- **L14 (platform reductions).** Actual PID reuse and the OS specifics of
  `rename()` atomicity (POSIX vs NFS) and `process.kill(pid,0)` (POSIX vs
  Windows) cannot be forced in one local Linux run, so they are documented as
  the platform guarantees the reclaim depends on and exercised on the POSIX
  path. The *consuming logic* — token-as-identity, refusal to evict a
  live-appearing owner, rejection of a crafted non-positive pid — is
  platform-neutral and unit-tested, each mutation-verified.

## Invariants preserved

Named public scores stay human-signed only; telemetry stays off with no
endpoint; Sixth Man stays suggest-only; tool arguments/results/prompts are never
persisted or logged; the classifier ordering, OATS design, and output-validation
policy are unchanged except where a measured counterexample warranted it (none
did here). The user's local `main` checkout was never touched.
