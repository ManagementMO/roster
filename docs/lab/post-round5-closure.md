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
- `pnpm test` — **362 / 362** across 14 files, green **including under uid 0
  (root)**; the two era-closure tests that previously failed as root are fixed.
- Hosted CI green on the full matrix — ubuntu (node 24 + the 22.13 engines floor),
  macos-26, **windows-latest** — plus Combine, Router E2E, dependency audit +
  secret scan, CodeQL, and Semgrep.

## Claims matrix

| # | Area | Finding (as claimed) | Disposition | Commit |
|---|------|----------------------|-------------|--------|
| C1 | playbook | destructive-command scan backtracked super-linearly (ReDoS); SKILL.md read unbounded | **Fixed** — linear lookahead matcher, no flag-length bypass; bounded no-follow SKILL.md read (measured curve below) | `e8f9a01` |
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
| W1 | cli | lock claim-rename rethrew non-ENOENT errors, so a Windows racer (EPERM/EBUSY) crashed instead of retrying the mutex | **Fixed** — decline the claim on ANY rename failure (declining is always safe: bounded wait, never two owners) | `03cb4ec` |
| W2 | cli | lock `rmSync` could throw on transient Windows EPERM/EBUSY | **Fixed** — `maxRetries`/`retryDelay` on all three lock removes | `bd1d76b` |
| W3 | tests | multi-process lock worker loaded a module by absolute path — ESM rejects `D:\…` on Windows | **Fixed** — load via `pathToFileURL().href`; this was the true cause of the Windows failure (found by adding worker-stderr capture) | `928240e` |
| W4 | cli | the L12 staging sweep could throw and fail an otherwise-fine sync | **Fixed** — sweep is best-effort with retries; an inert orphan can never fail the user's sync | this review |

### C1, measured

The replaced pattern `(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)[a-z]*\s+` is **polynomial
(≈cubic)**, not exponential — precise wording matters, but the denial of service
was real. Time to reject one non-matching `rm -<cluster> x` line:

| flag-cluster length | old pattern | shipped pattern |
|---|---|---|
| 500 | 99 ms | 0.27 ms |
| 2 000 | 678 ms | 0.01 ms |
| 4 000 | 5 277 ms | 0.02 ms |
| 8 000 | **41 578 ms** | 0.03 ms |
| 200 000 | (not run) | 1.1 ms |

Doubling the cluster multiplied the old cost ~8×, so a single crafted line inside
the (now 1 MB-bounded) SKILL.md stalled the trust gate indefinitely. The shipped
matcher is flat. A 22-case corpus — both flag orders, extra flags, tabs, case
variants, `\b` guards, non-home targets — shows **zero** behavioural difference
between old and new, so linearity cost no detection coverage.

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

## Residual limitations (disclosed, not fixed)

None of these regressed in this work; they are the honest edges of what it
verifies, recorded so a later reader does not over-read the green gate.

- **The destructive-command rule stays a heuristic.** `rm -r -f /` (split flags)
  and `rm --recursive --force /` (long flags) match neither the old nor the new
  pattern — verified identical on both. The trust gate flags for human review; it
  is not a sandbox, and a determined author can phrase around any substring rule.
- **`serve` shutdown (C6) is not exercised on Windows.** Those tests spawn a real
  stdio backend and drive POSIX signals, so they skip on win32. The production
  listeners exist there (Node emulates SIGINT/SIGTERM) but CI does not prove the
  child is reaped on Windows.
- **The verifier's FIFO and no-follow guards are POSIX-only.** `O_NONBLOCK` and
  `O_NOFOLLOW` are absent on Windows and degrade to `0`, so there
  `readVerifierFile` leans on its `fstat` regular-file check alone; the two tests
  that assert the flag behaviour skip on win32.
- **Bounded reads issue one `readSync`.** A short read would silently shorten the
  text. libuv retries `EINTR` and regular-file reads on local filesystems return
  the full count, so this is not reachable in practice; if it ever were, the
  verifier direction is fail-closed (a mismatch, never a false pass) while the
  trust scan would scan less text — the reason a read loop is the natural next
  hardening if the readers are ever pointed at exotic filesystems.
- **The test-typecheck gate resolves cross-package imports through built
  declarations**, so it must run after `pnpm build` (the CI step and the
  `pnpm typecheck` script both order it that way). Run alone on a cold clone it
  reports missing `dist` types rather than real test errors.

## Invariants preserved

Named public scores stay human-signed only; telemetry stays off with no
endpoint; Sixth Man stays suggest-only; tool arguments/results/prompts are never
persisted or logged; the classifier ordering, OATS design, and output-validation
policy are unchanged except where a measured counterexample warranted it (none
did here). The user's local `main` checkout was never touched.
