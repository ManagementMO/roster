# Round 6 — independent clean-room review, and what it changed

## Header

- **Base reviewed:** `9741ff60b26a299731c91495cb151dd8e3e7150b` (`origin/main`,
  byte-identical in an isolated `/private/tmp` worktree).
- **Environment:** Node `v24.14.1`, pnpm `11.9.0`, macOS 26.5.2 (Darwin 25.5.0)
  arm64. Node 24 rather than the 22.13 floor, so the floor itself is covered by
  hosted CI, not by this pass.
- **Method:** every claim in the docs treated as a hypothesis; findings only
  marked CONFIRMED when reproduced by a command.
- **Safety:** the owner's dirty checkout was never read for state, written,
  reset, or checked out over. No package was published, no artifact signed, no
  repository setting changed.

## What the review found green (re-verified, not inherited)

The local gate reproduced exactly on the audited base: build, source+test
typecheck, lint (67 files, no warnings), **369 tests across 14 files**, `pnpm
audit` clean, League build (2 pages from 1 artifact), pack dry-run, clean tree.
(Immediately after this round the gate reported **397 tests across 16 files**;
later receipt, publishing, persistent-lock, and Windows-removal hardening bring
the current gate to **409 tests**, still across 16 files and 71 linted files.)
All five real probes passed on current `dist`: Router/privacy E2E, MiniLM dense-live, a fresh serve-level Gemma
warmup (9 base vectors + 1 need vector at 256 dims, drafts served lexically
throughout), Combine 8/8, and 8/8 fail-probes rejected at the `verify` stage.

Three independent probe suites were written for this pass and all passed:

| Probe | Checks | Result |
|---|---|---|
| CLI trust path (sync/eject/backup/symlink/era/force) | 44 | 44 pass |
| Adversarial (classifier fairness, ReDoS, JSONC, identity) | 116 | 116 pass |
| Transparent-mode fidelity vs a direct connection | 14 tools × 6 fields | 0 differences |

The privacy law was re-tested with four separately-tagged secrets (backend `env`,
tool arguments, tool RESULT content, and the `draft` need string): none reached
`coach.db`, stderr, journals, locks, or backups; only the documented
`roster.json` held the env value, at `0600`.

**Test quality was mutation-audited**, since a green suite proves nothing if the
locks are vacuous. Fifteen load-bearing fixes were reverted one at a time —
namespace collision, lexical floor, soft-fail moat, full-contract drift hash,
drift vector invalidation, model-switch wipe, attribution carve-out, era
closure, eject-by-identity, atomic config write, fail-probe stage proof, League
summary derivation, script-scan completeness, the skill trust gate, and the
byte-exact verifier walk. **All 15 mutants were killed**, and every file was
restored byte-identically.

## What the review found broken, and what changed here

| ID | Severity | Finding | Change |
|---|---|---|---|
| R6-01 | MEDIUM | `coach.db` and `receipt.json` were created `0644`, and `mkdirSync(mode)` is a no-op on an existing directory, so a `~/.roster` already at `0755` stayed traversable — exposing the tool inventory (including whole SKILL.md bodies) and the client list to any other local user | `ensurePrivateDir`/`ensureRosterHome` in `paths.ts` re-assert `0700` on every write path; the receipt is written atomically at `0600`; `openCoachDb` pre-creates the DB `0600` so SQLite's `-wal`/`-shm` inherit it. Regression locks in `cli.test.ts` and `store.test.ts` |
| R6-02 | MEDIUM | `main` has no branch protection and no rulesets, so no advertised gate blocks a merge or a direct push | Ruleset prepared as code (`.github/rulesets/main.json`) plus an idempotent `scripts/apply-branch-protection.sh`. **Owner action; not applied by the agent** |
| R6-03 | HIGH | The packed CLI declared five unpublished `@roster/*` dependencies, so `npx -y @roster/cli` could never resolve for an outside user | The CLI is bundled (`scripts/bundle.mjs`); the manifest points `bin`/`main`/`exports` directly at `bundle/` because npm ignores those `publishConfig` overrides; internal packages are `private: true`; and `scripts/verify-clean-install.mjs` runs in CI |
| R6-04 | LOW | Semgrep/Sourcery cited as passed gates without noting they are external, PR-only GitHub Apps invisible to the repo | Qualified in STATUS and release-readiness |
| R6-05 | LOW | The signing checklist's own commands dirtied the working tree | Step 2 writes to a temp file; the committed artifact is described as a deliberate historical record |
| R6-06 | NIT | Dead `namespacedId`/`latencyBucket`; the deprecated `normalizeBackendName` alias was the one used on the live prune path | `namespacedId` and the deprecated alias removed, `serve.ts` moved to `stableBackendName`, tests ported to the surviving API. `latencyBucket` kept deliberately (see below) |
| R6-07 | LOW | The readiness doc pinned its own parent commit, reading as stale | Header rewritten |
| R6-08 | HIGH | An ownerless lock directory wedged the config lock permanently, and the stale-reclaim path created that debris itself while crashing the competitor with a raw ENOENT | Three-state ownership, grace-period debris reclaim, vanished-directory retry. Found by chasing a 1-in-8 test failure (see below) |

Bundling moves the files that `entry.ts` computes paths from, so the install
gate also asserts the two things that would break silently: that the entry
`sync` writes into a client config points at a file that **exists**
(`ourBinPath()` is derived from `import.meta.url`), and that the published
binary really **boots as an MCP server, proxies a spawned backend, returns its
result, and exits on stdin EOF**. Both assertions were mutation-checked: making
`ourBinPath()` point into `dist/` fails the gate with the exact bad path.

Two bugs were found *while fixing*, both by gates added in this round rather
than by review:

- the first bundle emitted **two shebangs**, which is a `SyntaxError` — the
  published binary would have failed to parse on its first run. Caught by the
  clean-install gate; the bundler now asserts exactly one shebang on line 1 of
  the executable and none in the library entrypoint.
- `installGracefulShutdown` read the signal name from the **event payload**, so
  a SIGINT re-emitted without it exited `143` instead of `130`. The name is now
  bound from the registration loop. Caught by the new platform-neutral tests.

## Windows shutdown coverage (lab experiment E4, now shipped)

E4 proposed platform-neutral shutdown tests but its verifier refused the patch:
the one-word seam it used would have deleted the static `noUnusedVariables`
guard that catches the original orphaned-child bug. E4's own recommended
resolution — move the function to its own module so deleting the call site
leaves an unused *import* — is what shipped here. `shutdown.ts` now holds the
logic, `shutdown.test.ts` drives all eight branches on every OS (exit codes,
idempotence under racing triggers, listener cleanup, and tolerance of a wedged
backend or a throwing DB close), and the POSIX subprocess suite in
`serve.test.ts` still provides the stronger end-to-end evidence where it can run.

## R6-08 (HIGH) — the "flake" that was a permanently wedged lock

One run in roughly eight reported a single failed test
(`lock.test.ts > MULTI-PROCESS: N contenders over a stale lock never enter the
section together`) while every other run was green. Chasing it instead of
re-running found a real defect, and a deterministic reproduction.

**A lock directory with no `owner.json` was unrecoverable forever.** Ownership
was read as `LockOwner | null`, which collapsed two very different states:
"the record is corrupt, a holder might be alive" (ambiguous — must fail closed)
and "there is no record at all". The second is decidable: a holder writes
`owner.json` immediately after `mkdir` and removes it only by removing the whole
directory, so a persistently ownerless directory is debris. Treating it as
unreadable meant every future acquire waited the full 5 s and threw
`timed out waiting for Roster lock "…" with unreadable ownership` — for the rest
of the machine's life, until the user deleted `~/.roster/locks` by hand.

**And the code produced that debris itself.** `reclaimStaleLock` rename-claims
the lock directory before inspecting it. If a competitor had just `mkdir`'d the
slot but not yet written its record, the reclaimer moves that empty directory
away, finds no owner, and renames it back — leaving ownerless debris. The
competitor, meanwhile, writes `owner.json` into a path that no longer exists and
dies with a raw `ENOENT`, because a vanished directory was not classified as
contention.

Reproduction (deterministic, no race needed): create the lock directory with no
`owner.json`, then call `withFileLockSync`. Before: two consecutive attempts each
fail after ~5 s. After: acquired in 1021 ms, then 2 ms.

The fix keeps every existing safety property. Ownership is now a three-state
value, corrupt records still fail closed (that test is unchanged and still waits
out the timeout), and debris is cleared only after a **1 s grace period** — about
1000× the real `mkdir`→write window — using the same atomic rename-verify-remove
dance as the stale path, so a directory that turns out to have an owner is put
back untouched. A vanished directory mid-acquire is now retried as contention
rather than crashing the caller. Locked by three new tests; reverting the
three-state distinction turns two of them red, and the lock suite passed 10
consecutive runs afterwards.

This is the round's best argument for treating a flaky test as a bug report:
the failure was rare, but the state it pointed at was permanent.

**Residual honesty note.** After that fix, one further run reported a single
failed test, and its name was again lost to an output filter. It has not
recurred in **31 consecutive full-suite runs**, including six with every CPU
core deliberately saturated and five immediately following a full
build/typecheck/lint (the sequence the earlier failures shared). So: the lock
defect above is definitively explained, reproduced, and fixed, but I cannot
claim the suite is proven flake-free — one observation remains unattributed.
If a future CI run fails once and passes on re-run, read its log before
re-running it; that habit is what found R6-08.

## Deliberately NOT changed

- **`latencyBucket` stays** despite having no runtime caller. It is the
  executable definition of the `lat_bucket` field in `docs/telemetry-schema.md`;
  deleting it would leave the published schema with no code behind it, and the
  telemetry event builder is deliberately unbuilt. Documented rather than
  churned.
- **Classifier precedence** (timeout → quota → internal → schema → auth) is
  unchanged. The review attacked it with 23 fairness cases and adversarial
  quoting and produced no counterexample, so the ordering stands.
- **OATS single-centroid learning, the 4-positive cliff, the tiny-roster abstain
  gate, `need_vec` growth, and the forward-only DB migration** remain as
  disclosed limitations. They are measured, documented, and out of scope for a
  hardening round.
- **Nothing owner-gated was touched:** no npm publication, no Combine signing,
  no ruleset applied, no domain or legal action.

## Verification after the change

Full gate re-run on the remediation branch, plus every probe from the review and
a mutation check on each newly added lock. Numbers are in the commit message and
reproducible with the commands in `docs/release-readiness.md`.

## Stress + scale evaluation (post-remediation)

Run against the real built binary — real child processes, real SQLite, real MCP
wire traffic, nothing mocked. Harness: 17 checks across five areas, all passing.

| Area | Result |
|---|---|
| **Scale** — 20 backends × 25 tools = 500 tools | boots in **683 ms**; five mode serves 2 meta-tools; draft returns 5 starters; draft latency **p50 0 ms / p95 1 ms / max 1 ms**; all 20 children reaped on EOF |
| **Concurrency** — 6 `serve` processes on one coach.db | 72/72 drafts succeed, no `SQLITE_BUSY`, no lock timeout, 6/6 exit on EOF |
| **Crash safety** — 40 × SIGKILL at a random point mid-`sync` | **0 corrupt configs**; 40/40 rounds end back at the original bytes after `eject` |
| **Soak** — 400 draft+call cycles (800 requests) | RSS 86 → 110 MB (+24 MB), **no descriptor leak** (26 → 26), coach.db 184 KiB |
| **Lock contention** — 12 concurrent `roster init` | 12/12 exit 0, **0 wedged locks** (R6-08 regression cover), roster.json valid after the race |

The lock-contention row is the one that would have failed before R6-08 was
fixed: twelve processes racing the same config lock is exactly the interleaving
that produced ownerless debris.

## One more defect found by running it like a user

Re-running `roster receipt` **after** `sync` reported `Cursor 1 server(s)` and
`Unique servers across clients: 1` to someone who still had three — because the
receipt counted the client config verbatim, and after a sync that config holds
exactly one entry: Roster's own proxy. So the tool counted *itself* as the
user's server list, and the flagship flow looked like Roster had eaten the
servers.

A synced client now reports what is actually routed for it (from `roster.json`'s
`importedFrom`), labelled "routed through Roster — originals backed up". The
regression test locks the real invariant: **syncing changes where servers are
launched from, never how many you have** — `uniqueServers` before and after a
sync must be equal. Reverting the fix turns it red.

## Chasing the "unattributed flake" to the bottom

The earlier note recorded one unattributed single-test failure. Repeatedly
re-running the suite was the weakest possible search — it re-tests one ordering
— so the hunt was rebuilt to vary what actually matters: shuffled file and hook
order, single-threaded execution, maximum parallelism, and (deliberately) an
unsupported no-isolation mode. 38 runs per campaign, every log kept.

It found **three separate real problems**, none of which were the same thing:

**1. `EINVAL` crashed a lock contender (production defect).** macOS/APFS reports
`EINVAL` — not `ENOENT` — when you create a file inside a directory a competitor
is concurrently renaming. The R6-08 guard only recognised `ENOENT`, so a
contender died with a raw `EINVAL … open '…/owner.json'` stack instead of
retrying. `dirVanished` now covers `ENOENT`/`EINVAL`/`ENOTDIR` and is
unit-tested to still surface genuine faults (`EACCES`, `ENOSPC`, …).

**2. A live lock could be aged into "debris" (defect introduced by R6-08).** The
grace period timed *how long this process had been watching*, so a contender
that kept catching different processes inside their `mkdir`→owner-write window
could accumulate past the grace and move a perfectly live lock aside. The owner
then failed at release — after its work had already succeeded. Debris is now
decided by the **directory's own ctime** (clamped at zero, because filesystem
timestamps can read ahead of `Date.now()` and a negative age would silently
restore the permanent wedge).

**3. A holder whose lock was moved aside failed its release.** Reclamation
claims a lock by renaming it, and that rename is load-bearing — it is what stops
two contenders evicting the same stale lock. But a live lock can be moved for a
moment, and if the slot is retaken before it is renamed back, the holder's
directory is left under a claim name. Identity is the token, not the path, so
release now recognises its own lock under a claim name, completes, and clears
the debris that would otherwise accumulate in the locks root forever. Measured:
**57/60 → 60/60** on the four-process race.

A fourth "failure" was a **timing-ratio test** asserting `< 10` on a 4x input
step; it hit 10.59 under parallel load. Catastrophic backtracking is
*exponential* — the absolute `< 500 ms` backstop is the real guard — so the
ratio is now a median of five samples against a looser bound. A test that cries
wolf teaches people to re-run the suite, which is the exact habit that hid
R6-08 for a whole round.

### Round 7 closure: the residual rename gap is gone (2026-08-21)

The residual was reproducible on the later `93cbaa2` baseline: 100 focused
four-process runs produced 99 passes and one post-critical-section
`Roster lock ownership changed before release` failure. The historical campaign
had also observed one two-holder result in roughly 94 runs. Both share one root
cause: the canonical lock directory was the mutex *and* was renamed away for
stale-owner inspection, so its path could be free while an owner still believed
it held the lock.

The lock is now a **persistent canonical slot**. Ownership is the atomic
`owner.json` `wx` create/unlink; release removes only ownership, never the slot.
Stale-owner replacement is serialized by one fixed `.reclaim` directory inside
the canonical slot, whose claimant has its own pid+token metadata and must
re-verify both the claim and the exact dead owner before unlinking anything.
Empty, corrupt, or dead claim markers are retired by renaming only the transient
marker inside the slot; the canonical path never moves. Corrupt canonical owner
metadata remains fail-closed, symlinked lock paths remain untouched, and the
legacy moved-lock release fallback remains for a pre-upgrade process.

Three design-invariant tests first failed on the old implementation: the
canonical slot must survive stale reclamation, stale inspection must never rename
it, and release must leave the slot in place. The new claim crash/dead/live tests
then cover the transient marker's recovery states. The exact four-process
campaign that failed on the baseline passed **200/200** after the redesign with
zero exclusivity, release, or other failures. A second high-contention harness
ran 16 processes through 100 acquisitions each, repeated across five waves:
**8,000/8,000** acquisitions with zero process or exclusivity failures.

### Two harness invariants are now pinned, not inherited

`pool: "forks"` — four trust-path tests legitimately use `process.chdir()` and
`process.umask()`, which worker threads cannot; under `pool: "threads"` they
fail with an opaque "not supported in workers" TypeError.

`isolate: true` — several suites set `ROSTER_HOME` in `beforeEach` and spawn
children from it. `--no-isolate` let those hooks overwrite each other and
produced a **false mutual-exclusion failure** — the most alarming possible red
herring.

And CI now writes a JUnit report and uploads it on every run, so the next
intermittent failure is *named by the pipeline* instead of depending on whoever
reads the log. That is the actual lesson of this round: a failure that cannot be
named cannot be fixed.

## Publishing for real: a local registry found two launch-breaking defects

Every packaging check up to this point used `pnpm pack`. That was not enough.
Standing up a local npm registry (Verdaccio), running an actual `npm publish`,
and then running `npx -y @roster/cli` from a clean machine with an empty cache
found two defects that would each have broken the very first user command.

**1. `npm publish` produced an unrunnable package.** The manifest used
`publishConfig` to repoint `bin`/`main`/`exports` at `bundle/`. **pnpm applies
those overrides; npm does not.** A real `npm publish` therefore shipped
`bin: ./dist/bin.js`; npm auto-included that single file because it is the bin
target, and it imported siblings that `files` never shipped:

```
npx -y @roster/cli init
  ERR_MODULE_NOT_FOUND  …/node_modules/@roster/cli/dist/dense.js
```

Fixed by deleting the indirection: the committed manifest now points at
`bundle/` unconditionally and the workspace build produces the bundle, so every
packer emits the same artifact. A packer-parity check now packs with **both**
npm and pnpm and fails if the file lists or entrypoints differ — which
immediately caught a second divergence: pnpm ships the workspace-root `LICENSE`,
npm does not, so an `npm publish` would have shipped an MIT package with no
licence file. `prepack` now stages both README and LICENSE.

**2. `npx … sync` wrote a DEAD launcher into the user's client.** npx puts
`roster` on PATH for the duration of that one invocation, which satisfied
`hasGlobalRoster()`, so sync wrote `{command:"roster", args:["serve"]}`. The
moment npx exits there is no `roster`:

```
spawn: roster serve
error: ENOENT — spawnSync roster ENOENT
→ the agent gets a dead MCP server
```

Writing the npx cache path instead would merely postpone the failure to
whenever the cache is pruned. Reaching that code from an npx cache *proves the
package is fetchable by name*, so `rosterEntry()` now emits
`npx -y @roster/cli serve` in that case — checked **before** the PATH probe.
Verified against the live registry end to end: the client launches it, the MCP
handshake succeeds, nine real memory-server tools are proxied, it exits 0 on
EOF, and after `rm -rf` of the entire npx cache the same entry **re-fetched and
served — self-healed**. `eject` afterwards restored the config byte-for-byte,
comments intact.

The lesson generalises: `pnpm pack` is not a rehearsal for `npm publish`, and
installing a tarball is not a rehearsal for `npx`. The only faithful test is a
real registry.
