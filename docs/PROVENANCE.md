# Built with agents, reviewed by hand

Roster is developed with heavy agentic AI assistance. Most of the code in this repository was written by AI coding agents working from written specifications ([ROSTER-BUILD-HANDOFF.md](../ROSTER-BUILD-HANDOFF.md)), at a pace no solo human could match. You should know that before you route your agents' traffic through it — so we're telling you first, plainly, on our own page.

We don't consider this a confession. A tool router that *measures* AI tooling, built *with* AI tooling, had better be able to explain why that's safe. The interesting question was never whether a project used agents — it's what discipline surrounds them. Ours is written down and binding (the laws live in [ROSTER-STATE-AND-DECISIONS.md](../ROSTER-STATE-AND-DECISIONS.md) §4.4). Here it is.

## The discipline

**1. Docs before code (the velocity-discipline law).** Agents faithfully implement whatever the spec says — including its bugs — at ten times human speed. So the spec is amended *before* building, every time; when reality contradicts the spec, work stops until the doc is fixed. A locked no-restore list keeps cut scope cut: "it would only take a weekend" is never a reason to restore an item.

**2. Validated-only ships.** Anything an agent built that no human verified is not an asset on launch day. It doesn't ship.

**3. Human-signed verifiers behind every named score.** Every Combine task and its verifiers are drafted by one agent, attacked by a second adversarial agent (false-pass and false-fail hunting), and mutation-tested against seeded known-bad states it must catch. Then a human certifies it — runs the pass case, forces a fail case, confirms it matches the server's real semantics — and the task is flagged `signed: true`. **Only human-signed tasks feed named public scores.** Unsigned tasks may run for internal or anonymized aggregates only, and coverage never outruns signing.

**4. Line-by-line human review for security-critical paths.** These paths are velocity-exempt — no agent-written change lands in them without a human reading every line:

- `sync` / `eject` — client-config rewriting and byte-for-byte restore
- credential and environment passthrough to backend servers
- telemetry redaction, and the packet-capture-verified OFF default
- write/idempotency classification of tools
- the HTTP auth surface

**5. Stop-and-ask gates.** Agents do not register names or domains, publish packages, stand up public endpoints, name third-party servers in public artifacts, or spend money. A human does, or nobody does.

## Human review log

Line-by-line reviews of the security-critical paths are recorded here only after the reviewer confirms completion, with the commit they cover. Automated checks are evidence, not a substitute for the human review.

| Date | Area | Reviewer | Commit |
|------|------|----------|--------|
| 2026-09-13 | Security-critical paths listed above and the complete changes in PR #39 | Mo (owner; completion explicitly confirmed in the release approval) | `377e3bba91c3fe8653034d92eae27254ba73dac2` |
| 2026-09-14 | PR #45, including the new runtime/cache code | Mo (owner; confirmed by choosing the reviewed-release approval) | `b090411850e8574f115aba7064f65acc5b9b9896` |

The owner explicitly confirmed completion of the required line-by-line review and authorized Devin to merge PR #39 and publish `@npmmo/roster@0.0.1` on the owner's behalf. That authorization is limited to the reviewed tarball with SHA-256 `e6e854508e71e3eef4a17ef88e8a019790735f65ed238e7b726c5e0434bf1fb0`, public access, and the `latest` tag. It does not authorize League signing, named scores, or service deployment. This entry records the owner's attestation; it does not claim an additional independent human audit.

The approved publication completed on 2026-09-13 after the owner's npm browser authentication. Unauthenticated public-registry download matched the approved artifact; fresh public npm/npx consumer checks passed on Linux, Windows, and macOS within the recorded scope.

The owner separately authorized PR #41 and the documentation-only `@npmmo/roster@0.0.2` artifact with SHA-256 `3f42c2d5c0648b9c3a64fbb7eadedf27dd507f1f9d6a0e8731d10fcc385895a0`, public access, and the `latest` tag. Publication completed on 2026-09-13 after the owner's npm browser authentication. Both runtime bundles and the license are byte-identical to the reviewed `0.0.1` release; the changes are the manifest version and README link targets. Public distribution, live npm links, and native installs/upgrades were verified. This is a documentation-patch authorization, not a claim of an additional independent security audit.

The owner separately authorized the npx-first frontend changes and their push/merge after green checks, followed by production website deployment through the installed Vercel tooling on 2026-09-14. The owner selected `roster-router.vercel.app` when the preferred `roster.vercel.app` was found occupied. Vercel project `roster` is linked to `ManagementMO/roster` with `main` as its production branch. PR #44 merged as `eb72a0ae6b217d293c97e9eccf6296d64fbac9fd`; Vercel then deployed that commit automatically from Git. The preferred domain, production-origin metadata, sitemap, custom 404, and 43 production browser cases were verified. This is website-deployment authorization and automated evidence, not a new CLI publication, League signature, or independent human security-review attestation.

The owner approved work on a native-first/WASM fallback and truthful dense-runtime readiness. The resulting `0.0.3` candidate passed automated artifact verification on 19 platform configurations, scoped Windows network tracing, and four owner-authorized signed-in Codex scenarios. Claude's model-driven test was blocked by account credit; the owner directed further client testing toward Codex rather than changing accounts or purchasing credits.

After reviewing PR #45, including the new runtime/cache code, the owner explicitly chose the reviewed-release approval: merge after green checks and publish only SHA-256 `338e8a7e8b2d929be402e942acca26c22ce67837029e5950122970c5d820969e` as public `@npmmo/roster@0.0.3` with the `latest` tag. PR #45 merged as `d8aab038c3b32c378f792004f54899c18ed81c61`; merge CI and CodeQL passed. Publication completed at `2026-09-14T17:01:00.227Z` following the owner's npm browser confirmation. Unauthenticated registry download matched the approved archive exactly. This records the owner's attestation, not an additional independent human audit.

The broader public-consumer run then exposed the documented repair-only stale-resolution defect. The owner chose preparation of a `0.0.4` correction rather than suppressing the failed check. That follow-up is not yet published or covered by a new artifact approval; the public `0.0.3` archive is unchanged.

The automated security-scan and consumer-verification report is recorded in [release readiness](release-readiness.md), including CI links, native consumer evidence, and the default-off packet capture.

If anything on this page ever stops being true, that's a bug in the project, not in the page. File it.
