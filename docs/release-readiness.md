# Roster Release Readiness

## Current candidate: verified and owner-authorized, publication pending

As of 2026-09-13, automated release verification and the required owner review are complete for `@npmmo/roster@0.0.1`. The owner explicitly authorized merging PR #39 and publishing the exact reviewed artifact with public access and the `latest` tag. Publication and fresh public-registry verification have not yet occurred; an npm dry-run is not a publication.

### Identity and supported runtime

- Package: `@npmmo/roster@0.0.1`; executable: `roster`; authenticated publishing account: `npmmo`.
- Package-source baseline: `76ef880844a3f6c613375e3d78e42537519a14ed`. Verified PR revision `377e3bba91c3fe8653034d92eae27254ba73dac2` additionally fixes the Windows verifier's native-library cleanup without changing the package payload.
- Reviewed tarball SHA-256: `e6e854508e71e3eef4a17ef88e8a019790735f65ed238e7b726c5e0434bf1fb0`.
- The producer is pinned to Linux Node 24.20.0 and pnpm 11.9.0 with the frozen lockfile. Its decompressed tar archive and all five file hashes match the local candidate byte-for-byte. Different recorded zlib versions explain the different gzip bytes; the Linux archive is the selected artifact, not a later repack.
- The five shipped files are `bundle/bin.js`, `bundle/index.js`, `package.json`, `README.md`, and `LICENSE`. No unpublished workspace dependency, local state, or credential is shipped.
- Supported CLI runtime: Node `^22.17.0 || >=24.2.0`. Affected Windows/libuv versions are refused before state changes. File-identity checks, symlink protections, and repository security controls remain intact. The retained Linux Node 22.13 compatibility job does not expand the published support contract.

### Current verification evidence

- Build, typecheck, lint, and the 552-test local suite passed. The package/install-copy changes also passed Astro checks, the site build, and internal link/asset checks; no website was deployed.
- All checks on [PR #39's verified CI revision](https://github.com/ManagementMO/roster/actions/runs/34733552434) passed, including native Windows minimums, real packed dense installation/upgrade/inference, and cleanup. [CodeQL](https://github.com/ManagementMO/roster/actions/runs/34733552439), dependency audit, secret scanning, and the configured Semgrep check passed. Semgrep remains supporting evidence from an externally configured GitHub App.
- The [same-artifact consumer run](https://github.com/ManagementMO/roster/actions/runs/34733726151) used the reviewed tarball in every leg, outside the clone, with disposable homes, prefixes, caches, and npm configuration:

| Consumer environment | PASS | FAIL | BLOCKED | Explicitly NOT RUN |
| --- | ---: | ---: | ---: | ---: |
| Linux x64, Node 22.17.0 | 31 | 0 | 0 | 2 |
| Linux x64, Node 24.20.0 | 31 | 0 | 0 | 2 |
| Windows x64, Node 22.17.0 | 30 | 0 | 0 | 3 |
| Windows x64, Node 24.2.0 | 30 | 0 | 0 | 3 |
| Windows x64, Node 24.20.0 | 30 | 0 | 0 | 3 |

These are case observations, not counts of distinct product features. They cover local/global/npx installation, fresh shells, Unicode and moved paths, exact saved-launcher execution after moving and removing the npx cache, CLI/config lifecycle, real backend routing, skills/review withholding, drift, process cleanup, Combine separation, runtime provenance/repair, MiniLM, and the product's automatic dense-model path. Public registry availability was observed separately; install evidence in this run is staging parity, not public publication.

- The previously failing ordinary POSIX descendant is now gone after EOF, and the native Windows npm/npx paths pass without a client-side shell workaround. A backend deliberately creating a separate session remains outside the POSIX process-group guarantee.
- A dedicated [default-off packet-capture run](https://github.com/ManagementMO/roster/actions/runs/34734327864) verified the same artifact in a separate CI network namespace. Capture tooling ran privileged, but the CLI and backend ran as UID 1001. The positive control recorded 7 packets; init/receipt/telemetry/scoped sync/eject and transparent/five-mode MCP checks recorded 0 product packets, with byte-identical restoration. Both PCAP files were independently read after download. This captures the tested default behavior with a local fixture, not arbitrary network activity of third-party tools.
- `npm publish <reviewed-tarball> --dry-run --access public --tag latest` passed. No package was uploaded by the dry-run.

### Explicit limits and remaining actions

- Native GUI-client/account workflows and a non-admin Windows profile were not exercised. Windows packet capture was not performed.
- A genuine previous-version upgrade cannot be tested before an earlier release exists. The main matrix could not create an unprivileged Linux network namespace; the separate packet-capture run created one with privileged tooling while running the product non-root and without external network interfaces.
- The owner's review and narrowly scoped publication authorization are recorded in [PROVENANCE](PROVENANCE.md). The next actions are the approved merge, exact-artifact npm publication, and fresh public npm/npx verification.
- No League task was human-signed by this work, no named public score was authorized, no domain was registered, and no public service or telemetry endpoint was deployed.

## Historical evidence below

The remaining sections preserve dated findings and earlier package choices. They are not the current package identity or an assertion that old release blockers remain open.

### Pre-fix consumer gate for candidate `13a9c9f`

That clean-consumer verification superseded the earlier release-ready assessment. At that point the candidate was not cleared for publication: Linux shutdown could leave an ordinary non-detached backend descendant alive; Windows dense installation failed when npm was launched without Windows-aware process resolution; and Node 22.13.1 on Windows reported incompatible path/descriptor device identities, causing guarded reads to refuse unchanged files. The native Windows evidence is retained in [consumer run 34724166403](https://github.com/ManagementMO/roster/actions/runs/34724166403) and [diagnostic run 34724751753](https://github.com/ManagementMO/roster/actions/runs/34724751753).

The approved release baseline is Node 22.17 or newer within Node 22.x, or Node 24.2 or newer. File-identity, symlink, and mutation checks must not be relaxed to accommodate affected runtimes. Release validation must cover the patched Windows minimum, the real npm execution path, and POSIX process-group cleanup that terminates owned non-detached descendants without signalling unrelated processes. A backend that deliberately creates a separate session is outside that process-group guarantee.

Fresh consumer results, the security-critical human review, npm scope ownership, and the final owner publication approval remain release gates. The historical checks below do not close these newer findings, and no named League scores may be signed by an agent.

Last verified: 2026-08-21 (fresh isolated worktree, full local gate, real-server probes, and live GitHub/npm checks)

Repository: [ManagementMO/roster](https://github.com/ManagementMO/roster)

Verification baseline: [`93cbaa2d1a21b28d87883b7938c03950435d16ac`](https://github.com/ManagementMO/roster/commit/93cbaa2d1a21b28d87883b7938c03950435d16ac). The lock redesign and documentation cleanup described below are part of the immediately following hardening change; the required CI checks on its merge commit are the authoritative release evidence. This wording deliberately avoids calling a historical SHA "current main" — a documentation commit cannot name its own future merge SHA without becoming stale on arrival.

## Executive status

Roster's core implementation is a release candidate: the trust-sensitive code, local behavior, cross-platform matrix, real-server probes, dependency checks, and CI gates are green on the verified `main` commit.

Roster is not yet a public package or a live public League. The remaining launch work is mostly package publication, human signing/provenance, legal/brand clearance, launch timing, and deliberately deferred product surfaces. Those are described separately below so a green codebase is not confused with a completed public launch.

## What is complete

### Core product and trust path

- The CLI lifecycle is implemented: initialization, client discovery, sync, eject, config preservation, multi-path restore, backup integrity checks, crash-recovery journaling, cross-process locking, symlink topology checks, and fail-safe refusal paths. The final stale-lock rename gap is closed by the persistent-slot/fixed-claim protocol documented in the Round 7 closure.
- The router supports transparent mode and five-mode `draft`/`call` operation, namespaced tool re-export, structured draft attribution, and Sixth Man suggestions without automatic alternate execution.
- The Coach store and learning path are implemented: local SQLite outcomes, privacy-preserving derived records, classifier precedence, FTS5/hybrid retrieval, OATS adjustment, Wilson ratings, full-contract drift identity, quarantine/tombstones, embedding-model switching, and multi-process database handling.
- The Playbook scanner has bounded descriptor reads, bounded script/resource traversal, symlink and special-file handling, fail-closed incomplete-scan behavior, review-only skill handling, and an explicit operator override for review-flagged skills.
- Combine has authoritative suite parsing, sandbox containment, no-follow verifier checks, descriptor/read identity checks, connect bounds, end-state verification, fail probes, and separation between unsigned results and named public scores.
- The League generator and artifact validation exist locally. Named scores are restricted to human-signed `signedWilsonLb` runs.
- Telemetry remains opt-in by design, and there is still no telemetry upload endpoint.

### Earlier dependency-maintenance hardening

PR [#19](https://github.com/ManagementMO/roster/pull/19) completed an earlier safe dependency-maintenance follow-up; it is historical evidence, not the verification commit named above:

- upgraded Biome to 2.5.8 and migrated its configuration schema;
- upgraded the grouped development/runtime dependencies represented by the Dependabot update;
- kept the CLI ownership canonicalization behavior unchanged while satisfying the newer linter;
- replaced a deprecated `__proto__` test accessor with an own-property descriptor assertion;
- fixed Windows lock contention where `mkdirSync` can report `EPERM`, `EACCES`, or `EBUSY` for an existing lock entry, while still surfacing real permission errors when the entry does not exist.

The original duplicate Dependabot PR #9 was closed as superseded by PR #19. Historical draft PR #7 is also closed; it was based on an older commit and is not present-day defect evidence. Live GitHub state on 2026-08-21 had no open pull requests.

## Verification evidence

### Local environment

- OS: macOS 26.6.2 arm64 (`darwin/arm64`)
- Node: `v24.14.1`
- pnpm: `11.9.0`
- Required project floor: Node `>=22.13`

All local commands below were run in an isolated worktree checked out at the verified commit, with the user's dirty `/Users/mo/Downloads/roster` checkout left untouched.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile supply-chain policy passed |
| `pnpm build` | Passed (`tsc -b`) |
| `pnpm typecheck` | Passed for source and tests |
| `pnpm lint` | Passed; 71 files, no fixes or warnings |
| `pnpm test` | Passed; 16 files, 409 tests (369 across 14 files on the audited base `9741ff6`) |
| `pnpm audit --audit-level moderate` | No known vulnerabilities |
| `pnpm league:build` | Passed; 2 pages from 1 artifact |
| `pnpm --filter @roster/cli pack --dry-run` | Passed; `@roster/cli@0.0.1` tarball assembled |

### Real behavior probes

- Router/privacy E2E passed through real filesystem and memory MCP servers. Transparent re-export, backend calls, five-mode draft/call, draft attribution, and outcome recording all passed. The probe confirmed raw arguments and content were not persisted.
- Dense live verification passed with real MiniLM inference. Native 384-dimensional vectors were preserved, the dense abstain gate behaved correctly, and OATS adjusted the ranking from real outcome vectors.
- The real filesystem Combine suite passed all 8 tasks. The observed unsigned Wilson lower bound was `0.676`; signed run count remained `0`, as required before human signing.
- All 8 fail probes reached the verifier and were rejected there. Transport or invocation failures did not count as verifier evidence.
- A fresh-machine probe on current `origin/main` packed `@roster/cli@0.0.1`, installed it into an empty npm project, and exercised `init`, `receipt`, telemetry, Claude sync/eject (including a client-added annotation and post-sync user edits), URL-only refusal, transparent real-server calls, five-mode `draft`/`call`, and the privacy boundary. The local tarball passed end to end; the public registry package remains unpublished, so `npx -y @roster/cli` is still an owner publication gate.

### Hosted verification

- [Main CI run for `93cbaa2`](https://github.com/ManagementMO/roster/actions/runs/32433561695) passed the Ubuntu Node 22.13 floor, Ubuntu Node 24, macOS Node 24, Windows Node 24, lint, Router E2E, Combine, clean external install, live embedding, dependency audit, secret scan, and League-generation jobs.
- [Main CodeQL run for `93cbaa2`](https://github.com/ManagementMO/roster/actions/runs/32433561595) passed.
- PR #19's complete hosted matrix also passed Windows, macOS, Ubuntu, Router E2E, Combine, MiniLM, audit, and secret scanning before merge, plus the GitHub Advanced Security CodeQL check.
- Semgrep (`semgrep-code-managementmo`) and Sourcery (`sourcery-ai`) also reported success on that pull request. Both are **GitHub Apps configured outside this repository**: they have no workflow file here, they run on pull requests only (a push straight to `main` gets neither), and Sourcery reports `skipped` on some runs. They are supporting evidence, not a gate this repository can reproduce or enforce on its own.
- Independent meta-verification added a dedicated Windows clean-external-install job and required check. The normal Windows build/test matrix catches source and native-module regressions; the new job additionally exercises npm/pnpm pack parity, the Windows npm shim, an out-of-workspace install, and the real CLI lifecycle.

## What still needs to happen before a public Roster release

### 1. Publish the package correctly

The selected package name is `@roster/cli`, and the installed executable is `roster`. It is not on npm yet.

**The dependency half of this gate is now closed in code.** The packed CLI used
to declare the five internal workspace packages (`@roster/coach|combine|
playbook|router|shared`) as runtime dependencies — `pnpm pack` rewrites
`workspace:*` into `0.0.1`, and none of those versions exist on the registry, so
`npx -y @roster/cli` could never have resolved for anyone outside this repo
(round-6 review R6-03; each name returns `E404` today).

The published artifact now inlines exactly the code that is not published and
nothing else:

- `packages/cli/scripts/bundle.mjs` bundles `@roster/*` into `bundle/bin.js`
  and `bundle/index.js`, and keeps every third-party package external so native
  builds (`better-sqlite3`), the optional model runtime
  (`@huggingface/transformers`), and licence attribution behave unchanged;
- the committed CLI manifest points `bin`/`main`/`exports` directly at `bundle/`
  because npm ignores `publishConfig` overrides for those fields; `publishConfig`
  is used only for `access: public`, which npm does honor;
- the five internal packages are marked `"private": true` so they can never be
  published by accident;
- `prepack` regenerates the bundle, so a hand-run `pnpm pack` cannot ship a
  stale or unbundled artifact;
- package-local `.npmrc` files are ignored, and the stale Verdaccio test token
  previously committed at `packages/cli/.npmrc` has been removed. It never
  entered the five-file tarball, but credential residue does not belong in source.

**One package, and only one.** The published tarball is exactly five files —
`bundle/bin.js`, `bundle/index.js`, `package.json`, `README.md`, and `LICENSE` — and no
internal package name appears in any of them. Every build-only dependency (including the
workspace packages themselves) lives in the **root** manifest, which is
`private` and never published; the CLI manifest therefore carries no
`devDependencies` for `pnpm pack` to rewrite into versions that do not exist on
the registry. The published manifest's only dependencies are
`@modelcontextprotocol/sdk`, `ajv`, `better-sqlite3`, `smol-toml`, and `yaml`; it
gets the `roster` binary and never lists an internal package name.

**Semantic search is opt-in, and the install says so.** `@huggingface/transformers`
pulls ~385 MB (onnxruntime-node 212 MB, onnxruntime-web 130 MB — a browser build
a Node CLI can never use — and sharp). As an `optionalDependency` npm installed
it by default, making `npx -y @roster/cli` a **424 MB / 16s** download before the
tool printed a line, which contradicts the "<60 seconds" and "zero download"
promises. It is now an **optional peer dependency**, so npm never installs it on
its own: the default install is **39 MB / 3s** (measured, cold cache). After
`roster init`, an interactive terminal is asked whether to add it, quoting the
size; a non-interactive run (CI, an agent, a Dockerfile) is never blocked — it
prints a one-line hint and exits. `roster dense enable` does it later, and
`--dense` / `--no-dense` decide it for scripts. The runtime installs into
`~/.roster/runtime`, a Roster-owned directory, because `npx`, a global install,
and a project install all put the binary somewhere different; adaptive learning
(Coach, OATS, ratings, drift) is bundled either way and never depended on it.

`scripts/verify-clean-install.mjs` proves it end to end — it packs, installs the
tarball into an empty project outside the workspace, and runs `--help`, `init`,
`sync`, `eject` (asserting a byte-for-byte restore) and `telemetry status`. It
runs in CI as **Clean external install (packed tarball)**. That gate immediately
caught a duplicated shebang in the first bundle, which would have made the
published binary fail to parse on its very first run.

The publish ceremony itself is written up in [docs/publishing.md](publishing.md):
what the `@roster` scope is and how to claim it, why scoped packages need
`publishConfig.access="public"` (without it the first publish dies with `402
Payment Required`), the exact commands, and how to verify as a stranger
afterwards.

What remains here is genuinely owner-only: npm organization ownership,
publication itself, release timing, and legal clearance. No post-publish code
flip is required: a real/global install writes the stable `roster serve` entry,
while an npx-cache install writes the self-healing `npx -y @roster/cli serve`
entry and re-fetches if that cache is pruned.

I did not publish anything.

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

- **Branch protection ruleset:** GitHub's `main-protection` ruleset is active on
  `main` and requires the documented CI/CodeQL checks while blocking deletion and
  non-fast-forward updates. The classic branch-protection endpoint remains
  unconfigured, and the ruleset currently requires zero approving reviews. The
  PR-only external scanners remain supporting evidence rather than repository-
  reproducible gates.
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
2. Run the human signing and provenance session.
3. Publish the single bundled `@roster/cli` package and verify `npx` from a clean external directory.
4. Decide the launch date and whether the League is part of launch day.
5. Recruit early testers and run the real-client adoption/draft-utilization checks.
6. Build the League website and optional roadmap features after the core launch path is proven.

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
node scripts/verify-clean-install.mjs   # packs, installs OUTSIDE the workspace, runs the binary
```

`@roster/cli` is the only publishable package. The `@roster/*` packages are
`private` and are bundled into it by `packages/cli/scripts/bundle.mjs`, which
`prepack` runs automatically. A new third-party dependency must be added to
`packages/cli/package.json` too — the bundler fails the build if the published
artifact would import something the manifest does not declare.

For CLI and live-server probes, set `ROSTER_HOME`, `ROSTER_TEST_HOME`, and an isolated `npm_config_cache` to temporary directories first. Never run `roster sync` or `roster eject` against the real home directory during verification.

## Current repository state

- The 2026-08-21 verification started from clean `origin/main` at [`93cbaa2`](https://github.com/ManagementMO/roster/commit/93cbaa2d1a21b28d87883b7938c03950435d16ac); the merge commit for this hardening change is the next authoritative state.
- The isolated verification worktree had no source diffs; real probe transcripts were generated as disposable untracked evidence.
- The user's normal local checkout was intentionally not rewritten, rebased, cleaned, or reset.
- Browser automation was not needed for the code verification. It would not replace npm ownership, legal clearance, human signing, or a deliberate launch decision.

This document is a release-readiness snapshot, not a promise that the owner-controlled launch gates have already happened.
