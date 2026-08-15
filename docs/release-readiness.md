# Roster Release Readiness

Last verified: 2026-08-14

Repository: [ManagementMO/roster](https://github.com/ManagementMO/roster)

Verified commit: [`7b0fb4862cd302cdad5fd03466a42f36b703b3c4`](https://github.com/ManagementMO/roster/commit/7b0fb4862cd302cdad5fd03466a42f36b703b3c4)

## Executive status

Roster's core implementation is a release candidate: the trust-sensitive code, local behavior, cross-platform matrix, real-server probes, dependency checks, and CI gates are green on the verified `main` commit.

Roster is not yet a public package or a live public League. The remaining launch work is mostly package publication, human signing/provenance, legal/brand clearance, launch timing, and deliberately deferred product surfaces. Those are described separately below so a green codebase is not confused with a completed public launch.

## What is complete

### Core product and trust path

- The CLI lifecycle is implemented: initialization, client discovery, sync, eject, config preservation, multi-path restore, backup integrity checks, crash-recovery journaling, cross-process locking, symlink topology checks, and fail-safe refusal paths.
- The router supports transparent mode and five-mode `draft`/`call` operation, namespaced tool re-export, structured draft attribution, and Sixth Man suggestions without automatic alternate execution.
- The Coach store and learning path are implemented: local SQLite outcomes, privacy-preserving derived records, classifier precedence, FTS5/hybrid retrieval, OATS adjustment, Wilson ratings, full-contract drift identity, quarantine/tombstones, embedding-model switching, and multi-process database handling.
- The Playbook scanner has bounded descriptor reads, bounded script/resource traversal, symlink and special-file handling, fail-closed incomplete-scan behavior, review-only skill handling, and an explicit operator override for review-flagged skills.
- Combine has authoritative suite parsing, sandbox containment, no-follow verifier checks, descriptor/read identity checks, connect bounds, end-state verification, fail probes, and separation between unsigned results and named public scores.
- The League generator and artifact validation exist locally. Named scores are restricted to human-signed `signedWilsonLb` runs.
- Telemetry remains opt-in by design, and there is still no telemetry upload endpoint.

### Maintenance hardening completed in the final merge

PR [#19](https://github.com/ManagementMO/roster/pull/19), merged as the verified commit above, completed the safe dependency-maintenance follow-up:

- upgraded Biome to 2.5.8 and migrated its configuration schema;
- upgraded the grouped development/runtime dependencies represented by the Dependabot update;
- kept the CLI ownership canonicalization behavior unchanged while satisfying the newer linter;
- replaced a deprecated `__proto__` test accessor with an own-property descriptor assertion;
- fixed Windows lock contention where `mkdirSync` can report `EPERM`, `EACCES`, or `EBUSY` for an existing lock entry, while still surfacing real permission errors when the entry does not exist.

The original duplicate Dependabot PR #9 was closed as superseded by PR #19. Draft PR #7 remains open as a historical review artifact based on an older commit; it is not current release evidence and should not be used as a present-day defect list.

## Verification evidence

### Local environment

- OS: macOS arm64 (`darwin/arm64`)
- Node: `v22.22.3`
- pnpm: `11.9.0`
- Required project floor: Node `>=22.13`

All local commands below were run in an isolated worktree checked out at the verified commit, with the user's dirty `/Users/mo/Downloads/roster` checkout left untouched.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile supply-chain policy passed |
| `pnpm build` | Passed (`tsc -b`) |
| `pnpm typecheck` | Passed for source and tests |
| `pnpm lint` | Passed; 67 files, no fixes or warnings |
| `pnpm test` | Passed; 14 files, 369 tests |
| `pnpm audit --audit-level moderate` | No known vulnerabilities |
| `pnpm league:build` | Passed; 2 pages from 1 artifact |
| `pnpm --filter @roster/cli pack --dry-run` | Passed; `@roster/cli@0.0.1` tarball assembled |

### Real behavior probes

- Router/privacy E2E passed through real filesystem and memory MCP servers. Transparent re-export, backend calls, five-mode draft/call, draft attribution, and outcome recording all passed. The probe confirmed raw arguments and content were not persisted.
- Dense live verification passed with real MiniLM inference. Native 384-dimensional vectors were preserved, the dense abstain gate behaved correctly, and OATS adjusted the ranking from real outcome vectors.
- The real filesystem Combine suite passed all 8 tasks. The observed unsigned Wilson lower bound was `0.676`; signed run count remained `0`, as required before human signing.
- All 8 fail probes reached the verifier and were rejected there. Transport or invocation failures did not count as verifier evidence.

### Hosted verification

- [Main CI run for `7b0fb48`](https://github.com/ManagementMO/roster/actions/runs/31850701823) passed the Ubuntu Node 22.13 floor, Ubuntu Node 24, macOS Node 24, Windows Node 24, lint, Router E2E, Combine, live embedding, dependency audit, secret scan, and League-generation jobs.
- [Main CodeQL run for `7b0fb48`](https://github.com/ManagementMO/roster/actions/runs/31850701812) passed.
- PR #19's complete hosted matrix also passed CodeQL, Semgrep, Sourcery, Windows, macOS, Ubuntu, Router E2E, Combine, MiniLM, audit, and secret scanning before merge.

## What still needs to happen before a public Roster release

### 1. Publish the package correctly

The selected package name is `@roster/cli`, and the installed executable is `roster`. It is not on npm yet.

The packed CLI declares the internal workspace packages as dependencies:

- `@rosterhq/coach`
- `@rosterhq/combine`
- `@rosterhq/playbook`
- `@rosterhq/router`
- `@rosterhq/shared`

Before advertising the `npx` install path, the owner must either publish those packages in an owned scope together with the CLI or choose and implement a tested bundling/packaging strategy. Then perform a clean external install test, run `roster init`, and verify that the published no-global sync entry launches `npx -y @roster/cli serve`.

I did not publish anything: npm organization ownership, public release timing, and legal clearance are owner-controlled actions.

### 2. Complete the human Combine signing session

The prepared checklist is [docs/signing/session-1-checklist.md](signing/session-1-checklist.md). The human signing session must:

1. run the real filesystem suite and inspect the 8/8 pass result;
2. run the 8 fail probes and confirm every one fails at verification;
3. inspect that the verifier semantics match the real server;
4. flip the artifact to signed state;
5. add the human review entry to [docs/PROVENANCE.md](PROVENANCE.md).

Until this is done, the League must show pre-season unsigned data and must not publish a named score.

An agent must not perform this signing step because doing so would falsify the human-signed provenance law.

### 3. Finish the owner launch gates

- Confirm npm/GitHub organization ownership and legal/brand clearance for `@roster/cli`, `getroster.dev`, `roster.tools`, handles, and trademarks.
- Choose the revised launch date and rollout shape.
- Decide whether the League remains deferred for the first Roster launch or launches later as a separate reveal.
- Recruit early testers for Claude Code, Codex, Cursor, OpenClaw, and other supported clients.
- Add the first human entries to the provenance review log for eject/config safety, credential passthrough, telemetry, and attribution policy.

## What remains for the League

The League generator is functional locally, but the public League surface is intentionally unfinished:

- public website and deployment;
- signed SVG badges;
- weekly scheduled Combine reruns;
- more signed divisions such as memory, git, and SQLite;
- `combine self` for server authors;
- box-score enrichment such as deltas, streaks, upsets, and editorial awards;
- public named standings after the human signing gate is complete.

No public League website, deployment, badge service, named signed score, or telemetry endpoint currently exists.

## Product roadmap after the release gates

These are real enhancements, but they are not evidence that the current core is broken:

- Streamable HTTP transport and HTTP backend support;
- lab-prior seeding for new installations;
- automatic transparent/five-mode selection based on engagement;
- router cache TTL, backend health checks, and document expansion;
- `roster dashboard` and `roster bench`;
- richer receipts, token/latency comparisons, percentiles, archetypes, roast/Wrapped mechanics;
- client templates, deep links, and starter examples;
- an OpenClaw allowlist writer;
- real-client draft-utilization measurement;
- optional Sixth Man read-only auto-fallback if the owner selects that policy;
- more Combine suites and additional tester/account coverage.

## Intentional non-goals and current guarantees

- Roster is a tool/API router, not a model router.
- Transparent mode preserves backend tool identity and protocol-facing metadata within the supported stdio/command-backed scope.
- Sixth Man is suggest-only until an explicit policy decision enables any restricted auto-fallback.
- Tool arguments, results, prompts, and raw content are not persisted as outcome data.
- Telemetry is off by default, opt-in, and has no upload endpoint today.
- Unsigned Combine runs cannot feed a named public score.
- URL-only backends and Streamable HTTP are not supported by the current sync/serve path; this is documented rather than silently implied.
- The current League is local/static and pre-season, not a deployed public ranking service.

## Recommended order from here

1. Complete the npm scope/name/legal clearance.
2. Decide whether to publish the internal workspace packages or bundle the CLI.
3. Run the human signing and provenance session.
4. Publish the packages and test a clean external `npx` installation.
5. Decide the launch date and whether the League is part of launch day.
6. Recruit early testers and run the real-client adoption/draft-utilization checks.
7. Build the League website and optional roadmap features after the core launch path is proven.

## Reproduction commands

From a clean checkout of the verified commit, using throwaway homes for CLI operations:

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm audit --audit-level moderate
pnpm league:build
pnpm --filter @roster/cli pack --dry-run
```

For CLI and live-server probes, set `ROSTER_HOME`, `ROSTER_TEST_HOME`, and an isolated `npm_config_cache` to temporary directories first. Never run `roster sync` or `roster eject` against the real home directory during verification.

## Current repository state

- Remote `main` is clean at [`7b0fb48`](https://github.com/ManagementMO/roster/commit/7b0fb4862cd302cdad5fd03466a42f36b703b3c4).
- The isolated verification worktree was clean and byte-identical to `origin/main` after the checks.
- The user's normal local checkout was intentionally not rewritten, rebased, cleaned, or reset.
- Browser automation was not needed for the code verification. It would not replace npm ownership, legal clearance, human signing, or a deliberate launch decision.

This document is a release-readiness snapshot, not a promise that the owner-controlled launch gates have already happened.
