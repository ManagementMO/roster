# Round 5 objective production hardening — final verification

## Header

- **Branch:** `review/round5-hardening`.
- **Base:** `f50e873d92e062e976ffeab8173ca3d2ffefc078` (`main` at branch creation).
- **Implementation HEAD audited before this report update:** `a2f5ec4d910723568f8b3c250ea6d96ec6efe546`.
- **Date:** 2026-07-30 (America/Toronto); latest local command snapshot `2026-07-30T05:06:39Z`.
- **Environment:** Node `v22.22.3`; pnpm `11.9.0`; Darwin `25.5.0` arm64.
- **Plan:** `docs/superpowers/plans/2026-07-22-objective-production-hardening.md`.
- **Commit scope before this report update:** `git rev-list --count main..HEAD` returned `28`.
- **Safety boundary:** the dirty local `main` checkout was not staged, committed,
  merged, rewritten, or otherwise used by this branch.

## Executive summary

All fifteen tasks in the objective production-hardening plan are implemented
and verified on the isolated branch. The work closes the reproduced,
non-subjective identity, routing, Coach, Playbook, Combine, CLI lifecycle, and
League defects in the plan.

The final mutation pass disabled fifteen load-bearing protections one at a time.
Every named regression test failed for the intended reason, and the production
tree was restored after every mutation.

The post-fix gate compiled cleanly, linted 61 files without warnings, passed
303 tests across 11 files, and generated 2 League pages from 1 committed
artifact.

The privacy write-path review found only hashes and derived local vectors at the
outcome boundary; targeted privacy and score-integrity tests passed 7/7.
Telemetry remains off by default and has no network endpoint.

The first hosted run exposed three objective release blockers. The router E2E
still used removed latest-draft borrowing, staged League files were reopened
read-only before `fsync` on Windows, and the dependency audit found six newly
disclosed advisories. All three are fixed locally with discriminating tests,
and the real E2E, filesystem suite, fail-probes, and MiniLM path were rerun.

That rerun also found a fourth issue: CI accepted any 0/8 fail-probe result,
including eight transport failures. The gate now proves complete authoritative
task coverage and requires every probe to reach and fail the `verify` stage.

One medium provenance limitation remains explicitly disclosed: the current
`environmentDigest` identifies the runtime plus suite/version set, not the
target command or build. Unsupported “reproducible run” copy was removed and
locked. Adding safe target-build identity requires an explicit artifact/API
decision before public score publication.

## Grade: A-

- **A:** release-ready within stated scope; complete discriminating evidence and
  no known trust-law, destructive-restore, or named-score defect.
- **B:** sound core with one or more bounded objective defects or important
  evidence gaps.
- **C:** a release-blocking correctness or trust-path defect remains.
- **D:** multiple high-impact defects or a materially unreliable verification
  record remains.
- **F:** a binding privacy/public-score law is breached, silent destructive
  behavior remains, or verification claims are knowingly false.

The minus reflects the disclosed target-identity provenance gap and the
remaining owner-controlled publication/signing decisions, not a known
CRITICAL or HIGH defect in the completed plan.

## Task completion

| Task | Objective | Evidence commit(s) | Final state |
|---|---|---|---|
| 1 | Stable public capability identifiers | `b4ed4d2`, `8621b8e` | Complete |
| 2 | Router termination and best-effort learning | `0705cf0` | Complete |
| 3 | Coach transactional invariants | `e5b138c`, `64a2e60` | Complete |
| 4 | Vector repair and stale-writer guard | `681728d` | Complete |
| 5 | Quoted-diagnostic classifier hardening | `67db4d9` through `1d07f8d` | Complete |
| 6 | Combine no-follow verification and strict suites | `016d04f`, `e550a83`, `d2ad62a` | Complete |
| 7 | Complete Playbook trust discovery | `91f0403` | Complete |
| 8 | Config validation and cross-process locking | `7c0252b` | Complete |
| 9 | Exact proxy ownership and URL refusal | `3bf08a7` | Complete |
| 10 | Symlink-preserving durable writes | `2112e0f` | Complete |
| 11 | Multi-path, crash-recoverable eject | `8865a81` | Complete |
| 12 | League authoritative identity and comparison sets | `2530fb8` | Complete |
| 13 | Strict, atomic League builds | `916b39a` | Complete |
| 14 | Truthful counts, runtime floors, and public docs | `3488d14` plus this final truthfulness lock | Complete |
| 15 | Mutation locks and final verification | `c95d1e6` | Complete |
| CI remediation | Windows durability, exact E2E attribution, dependency audit, fail-probe stage proof | `7d52b16` | Complete |
| CodeQL trust-path remediation | Descriptor-pinned, no-follow backup/journal reads | `a2f5ec4` | Complete; hosted rerun recorded below |

## Commands and results

Final post-fix gate before writing this report:

```text
$ pnpm build
$ tsc -b

$ pnpm lint
$ biome lint --error-on-warnings
Checked 61 files in 25ms. No fixes applied.

$ pnpm test
Test Files  11 passed (11)
Tests       303 passed (303)

$ pnpm league:build
league: wrote apps/league/dist-site/index.html
league: wrote apps/league/dist-site/box-filesystem-filesystem-core-e594a099526a2ad56cd5fa34f3b4403a3c9536144634857d1d72bb376afeb78c.html
league: 2 page(s) from 1 artifact(s)

$ git diff --check
# no output; exit 0

$ pnpm audit --audit-level moderate
No known vulnerabilities found
```

Targeted privacy and named-score gate:

```text
$ pnpm exec vitest run packages/router/src/router.test.ts \
    packages/combine/src/combine.test.ts apps/league/test/league.test.ts \
    -t 'never stores raw args|result text never reaches|forged summary|without the suite|forged category'
Test Files  3 passed (3)
Tests       7 passed | 84 skipped (91)
```

The static write search covered production `process.stdout`/`stderr`, file
writes, database `INSERT`/`UPDATE`/`DELETE`, raw-data terms near writes, network
primitives, and every `signedWilsonLb`/ranking path. A focused serialization
search matched only CLI lifecycle result objects (`configPath`, `backupDir`,
and sanitized lifecycle `detail`), not MCP tool call results.

Live post-remediation evidence:

```text
$ node docs/verification/e2e.mjs
## Result: ALL ASSERTIONS PASSED
# direct filesystem: 14 tools; Roster: 23 namespaced tools
# raw args/content absent from coach.db
# five-mode outcome matched the exact draft need hash

$ node docs/verification/dense-live.mjs
## Result: DENSE RUNG + OATS VERIFIED LIVE (real model, real inference)

$ node packages/cli/dist/bin.js combine run suites/filesystem/tasks.yaml ...
filesystem: 8/8 passed · signed 0

$ node packages/cli/dist/bin.js combine run docs/signing/fail-probes.yaml ...
failprobe: 0/8 passed · signed 0
$ node docs/verification/check-fail-probes.mjs ...
OK: all 8 fail-probes reached verification and were rejected

$ node docs/verification/check-fail-probes.mjs ... transport-failure-artifact.json
fail-probe gate: fail-probe fs.write-file.v1.failprobe must fail at verify, not transport

# Targeted Node compatibility probes:
sharp 0.35.0: 91 bytes
adm-zip 0.6.0: round-trip ok
```

## Mutation evidence

Each row is a temporary production mutation, followed by the focused command.
All commands exited nonzero for the expected assertion. Each mutation was
restored with a reverse patch; `git status --short` and `git diff --check` were
empty after each group.

| Defect class | Mutant | Focused regression | Observed RED |
|---|---|---|---|
| Stable ID hash | `stableSegment` returned only the sanitized text | shared namespacing test | Received `safe-tool`; expected a ten-hex suffix |
| Cursor-cycle guard | repeated cursor returned entries instead of rejecting | router repeated-cursor test | Promise resolved `[]` instead of rejecting |
| Best-effort recording | removed the `recordOutcome` catch | router storage-failure test | MCP `-32603: SQLITE_FULL` replaced the backend result |
| Prune transaction | changed the prune transaction from `immediate()` to deferred `run()` | Coach immediate-transaction test | Sibling refresh was not `SQLITE_BUSY` |
| Vector CAS | forced the guarded SQL flag off | Coach stale-drift backfill test | Stale write returned `true` instead of `false` |
| Playbook incomplete warning | ignored `scanWarnings` | Playbook scan-cap test | Findings lacked `scan-incomplete` |
| Exact proxy identity | accepted spawn objects with extra keys | CLI user-env lookalike test | Returned `already-synced` instead of preserving/importing the user entry |
| URL refusal | disabled the URL-only pre-write guard | CLI URL-only test | Sync did not throw and entered the mutation path |
| Config lock | removed the global config lock from `updateConfig` and rebuilt `dist` | two-process Cursor/Codex test | Final config held 5,000 servers instead of 6,000 |
| Eject era closure | made `closeEraThrough` report success without persisting its marker | failed-archive two-era test | ERA0 was restored where ERA1 was required |
| Symlink preservation | atomically wrote the visible symlink path instead of its recorded target | CLI symlink lifecycle test | The source became a regular file |
| League category authority | disabled category-to-suite binding | forged-category certification test | Forged run became `certified` instead of `tampered` |
| Suite/version partition | removed suite version from the standings key | mixed-version ranking test | One rank-1 row appeared instead of two independent rank-1 rows |
| Box filename hash | replaced the identity hash with a constant | lossy-name collision test | Distinct identities produced the same filename |
| Atomic site swap | skipped moving the old output aside | complete-site replacement test | Second publication failed with `ENOTEMPTY` |

One discarded trial changed the wrong `run.immediate()` call in
`upsertCapabilities`, not the prune call under test. It was restored immediately
and is not counted as mutation evidence. The correctly targeted prune mutation
then failed as shown above.

## Final truthfulness lock

The write-path review exposed a stale R5-16 claim after the first full gate:
League pages said a runtime-only digest made a run “reproducible,” while
`STATUS-FOR-MO.md` correctly discloses that the digest omits target identity.

Red-green evidence:

```text
$ pnpm exec vitest run apps/league/test/league.test.ts \
    -t 'does not claim target-level reproducibility'
# RED: standings contained "reproducible run"

# after changing public copy to "auditable run artifact" and aligning comments/docs
Test Files  1 passed (1)
Tests       1 passed | 32 skipped (33)
```

The implementation still exposes `environmentDigest` for backward-compatible
artifacts, but its code comment and methodology now describe exactly what it
hashes. No target path, command arguments, environment secrets, or invented
build identity was added.

## Hosted-CI remediation

The first PR run was useful evidence, not a ceremonial gate:

- Windows failed three League tests with `EPERM: operation not permitted,
  fsync` at `apps/league/src/build.ts:230`. A platform-independent regression
  shim reproduced the Windows rule and failed while staged files were reopened
  with `"r"`; it passes with non-truncating writable mode `"r+"`.
- The router E2E failed all three retries at “five-mode outcomes carry need
  hashes.” Production correctly requires the `draft_id`; the stale probe
  omitted it and filtered away the resulting `NULL`. It now supplies the exact
  ID and compares the persisted hash to SHA-256 of that draft's need.
- `pnpm audit --audit-level moderate` initially reported six vulnerabilities
  (two moderate, four high). Compatible transitives were refreshed, the MCP SDK
  moved from 1.29.0 to 1.30.0, and patched Hono, ADM-ZIP, and Sharp versions are
  explicitly pinned where parent resolution remained vulnerable. The audit now
  reports no known vulnerabilities; real MiniLM, Sharp image generation, and
  ADM-ZIP round-trip checks passed after installation.
- The old fail-probe workflow accepted zero passes without checking why. A
  local run against an unavailable `npx` target demonstrated the false green:
  all eight rows were `transport`, yet the old predicate accepted the summary.
  `assertFailProbeArtifact` now requires exact suite/version/category identity,
  complete ordered task coverage, unsigned rows, zero passes, and `stage =
  verify`. Focused tests reject transport, pass, omission, and signed variants.
- GitHub Advanced Security then reported three high-severity
  `js/file-system-race` alerts in the eject path: each checked a backup or
  journal file by path and then reopened that path to read it. The shared
  `readRegularFileNoFollow` primitive now opens once, uses `O_NOFOLLOW` where
  available, verifies descriptor/path/parent identity, reads through the
  descriptor, and checks post-read metadata. Immutable trust artifacts fail
  closed; live client files retry a bounded four times so legitimate concurrent
  client writes still reach the key-level merge. The CLI test suite includes
  path-reopen and post-open replacement regressions.

## Remote verification

PR #10 was mergeable at implementation head
`a2f5ec4d910723568f8b3c250ea6d96ec6efe546`, with these exact remote results:

- CI run `30515388980` completed successfully. All nine configured job
  instances passed: lint; Ubuntu Node 24; Ubuntu Node 22.13.x; macOS 26 Node
  24; Windows latest Node 24; Router E2E plus certification probes; Combine
  filesystem; live MiniLM inference; and dependency audit plus secret scan.
- CodeQL workflow run `30515388981` completed successfully.
- The separate GitHub Advanced Security CodeQL check `90784119265` passed.
  Alerts 23, 24, and 25 (`js/file-system-race`) each reported their most recent
  instance as `fixed`, with no dismissal.
- Semgrep scan `202504595` passed. Sourcery was skipped and is not claimed as
  verification.

## Privacy and named-score audit

- Router call arguments flow to the backend and `hashArgs`; only `argsHash`
  reaches `CoachStore.recordOutcome`.
- Draft text is held in a bounded in-memory map; persisted outcomes carry
  `need_hash`, and derived need vectors remain local.
- Combine reduces tool failures to allowlisted structural codes. Tool result
  text and exception messages do not enter `TaskResult.detail`, CLI output, or
  `lab-results.json`.
- CLI file writes are client configuration/backups, owner-only state,
  journals, locks, receipts, or generated public artifacts. They are not MCP
  call argument/result/prompt writes.
- Telemetry changes only the local opt-in flag. Production search found no
  upload request, listener, or telemetry endpoint.
- League parses and re-derives summaries, certifies every task row against the
  exact suite/version authority, strips signed credit from unverifiable runs,
  partitions standings by category/suite/version, and assigns ranks only through
  `isRankable` using certified signed rows.

Verdict: no reproduced privacy-law or named-public-score violation remains in
the audited branch.

## Verified versus read-only

**Executed:** every mutation above; the new truthfulness red-green cycle; full
build/lint/test/League gates; focused privacy and named-score tests; production
write/network/rank searches; real filesystem and memory MCP servers; real
MiniLM inference; dependency audit and compatibility probes; hosted Linux,
macOS, and Windows jobs; CodeQL; Semgrep; and Git cleanliness checks.

**Read and reconciled:** all implementation commits in this hardening plan,
Round 5 review/remediation addenda, public methodology/STATUS claims, runtime
floors, telemetry policy, and the current League artifact path.

## Remaining decisions and limitations

- **Target identity (R5-16):** choose a privacy-safe, immutable target build
  identifier and artifact schema before claiming complete run
  reproducibility. The current branch now claims auditability only.
- **Known owner decisions:** P1/P3/P6/P7/P8, package publication name, and the
  human signing session remain outside this objective implementation plan.
- **Publication/deployment:** no package publication, registry action, League
  deployment, or spending was performed.

## Not executed

- No Docker signing environment, real user client home, or production telemetry
  packet capture was used.
- Gemma inference was not rerun during the final remediation pass; the earlier
  committed Gemma verification artifact was read but not treated as fresh
  execution evidence here.
- The plan's tested eject interruption window was executed in the automated
  suite; an exhaustive external `SIGKILL` injection between every individual
  `syncClient` filesystem instruction was not performed.

These limits are explicit so they cannot be mistaken for verified coverage.
