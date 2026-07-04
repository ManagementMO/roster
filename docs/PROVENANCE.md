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

Line-by-line reviews of the security-critical paths are recorded here as they happen, with the commit they cover. The table starts empty because the reviews haven't happened yet — an empty row is honest; a filled one that didn't happen wouldn't be.

| Date | Area | Reviewer | Commit |
|------|------|----------|--------|
|      |      |          |        |

A self-run security scan report will be published alongside this log before launch.

If anything on this page ever stops being true, that's a bug in the project, not in the page. File it.
