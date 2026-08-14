# Roster

> **Your agent has 200 tools. Only five get to start.**

Roster is a neutral, open-source, local-first **tool router** for AI agents. One MCP endpoint fronts your local stdio MCP servers and approved skills; your agent gets the best ≤5 tools for the task at hand — the starting five — instead of every schema at once. It learns from derived call outcomes on your machine and works with MCP clients that can launch a stdio server, including Claude Code, Codex, Cursor, and OpenClaw.

**The eject promise, up front: `roster eject` restores every active path Roster synced for its four write clients**, from backups committed before each client write. Dedicated MCP config files return byte-for-byte (comments and formatting included). Live state files the client itself rewrites, such as `~/.claude.json`, restore key-level: original servers return, Roster's exact injected entry is removed, and settings or servers changed since sync survive. `--force` explicitly selects the pristine raw bytes. A private journal makes a multi-path eject recoverable after interruption, and topology checks refuse a moved symlink rather than writing through it.

## Why

Tool schemas can consume [72% of a 200K context window before the first user query](https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget). Tool-selection accuracy collapses [from 43% to ~13.6% as toolsets grow](https://writer.com/engineering/rag-mcp/). In a 100-server live stress test, [the median MCP server passed only 71% of tasks; the bottom decile passed 38%](https://www.digitalapplied.com/blog/mcp-server-reliability-100-server-stress-test-study). And the haystack keeps growing: [177,000+ public MCP tools as of February 2026](https://micheallanham.substack.com/p/ai-agents-2026-the-tool-selection).

Search-based tool loading is a proven fix — Anthropic measured [an 85% token cut, with accuracy going 49% → 74%](https://www.anthropic.com/engineering/advanced-tool-use) — but shipped it for Claude. Roster's bet is that the fix should be **neutral** (every client), **learned** (outcomes, not just keywords), and **public** (a league, not a listicle).

## What it is

Four parts, one product:

- **The router ("the Rotation").** An aggregating stdio MCP proxy for command-backed servers. Your supported write-client configs go from N `mcpServers` entries to one. Default mode is **transparent**: a faithful passthrough — every backend tool re-exported (namespaced), with titles, annotations, execution hints, and error codes preserved — while only derived outcomes are stored locally. Opt into **five mode** and the agent sees two meta-tools — `draft(need)` returns the best ≤5 capabilities for the stated task (K configurable 1–10), `call(tool, args)` proxies the invocation. When a drafted tool hard-fails, Roster can attach a structured suggestion for the next-ranked equivalent (the Sixth Man — suggest-only; Roster never executes the alternate).
- **The Coach.** Local outcome learning. Outcome class, latency, hashes, and drift are stored on-device; raw prompts, arguments, and results are not. An opportunistic maintenance job refines routing toward the tools that work on *your* stack. No hosted Roster service or API key is involved.
- **The League.** A static generator for public MCP server rankings, fed by the open-source Combine harness. Certification binds category, task signing, and descriptions to an exact authoritative suite/version; standings rank only within that identical comparison set. Named scores use `signedWilsonLb` only. Artifacts are validated before a complete atomic site swap, and box-score filenames include a SHA-256 identity suffix so lossy display names cannot collide. The committed run remains unsigned pre-season data until a human signing session occurs. See [docs/methodology.md](docs/methodology.md).
- **The Playbook.** Skills (SKILL.md) are first-class alongside tools. Tree traversal and script reads are bounded and no-follow. A primary `SKILL.md` symlink is the deliberate exception for dotfile-managed installs: its descriptor is read with a bound and identity checks, it is always review-flagged, and it is withheld by default. Unreadable entries, unsupported file types, other symlinks, or scan-cap exhaustion likewise produce a review finding. Review-flagged skills become available only through the explicit `ROSTER_ALLOW_REVIEW_SKILLS=1` operator override.

## Quickstart

> **Not yet published.** The original July 28, 2026 target passed without a release; no revised launch date has been set. Roster is not on npm yet. The selected package name is `@roster/cli` (the unscoped `roster` name is occupied by an unrelated package); the installed executable remains `roster`. The commands below are the planned install path rather than commands that work today.

```sh
npx -y @roster/cli init   # detect clients, import every server, print your Day-0 receipt
roster sync       # swap N config entries for one (originals backed up first)
roster serve      # run the router
roster eject      # put every config back exactly as found (byte-for-byte for dedicated files)
roster receipt    # re-print your audit  ·  roster unquarantine <id>  # re-admit a drift-benched tool
```

Node **22.13 or newer** is required. `init` needs no account or Roster API key. It prints a Day-0 receipt of clients, servers, and skills discovered, modeled per client: clients that already defer tool schemas natively, like Claude Code, are reported as such rather than credited with savings they do not need. `sync` currently writes Claude Code, Cursor, Codex, and OpenClaw configs and routes command-backed stdio servers only. If a selected config contains a URL-only server, sync refuses before changing `roster.json`, backups, or the client config.

## Seven day-one utilities

The League is the show; these earn the install without it:

1. **Context relief where you enable five mode** — best-five serving behind a stable two-tool interface, with transparent mode as the default.
2. **One roster across the four write clients** — import command-backed servers from their different config formats, then point those clients at one local endpoint.
3. **The Sixth Man** — failover *suggestions* when a tool hard-fails, so one bad server doesn't kill the task. Suggest-only at launch; automatic substitution returns later, if field data earns it.
4. **The local outcome record** — derived outcome classes and latency support ratings and maintenance without persisting prompts, arguments, or results. The dashboard remains planned, not shipped.
5. **Drift quarantine** — changed capability definitions are quarantined locally, including remove/re-add cases carried through tombstones.
6. **Secrets hygiene** — API keys live in **one place** (`~/.roster/roster.json`, owner-only `0600`, alongside the config backups that hold your original files) and are passed through to backends only. They are never sent anywhere, never written to the outcome database, and never logged — but be clear-eyed: importing a server copies its `env` block, so those keys are on disk, exactly as they already were in each client's own config.
7. **A Coach that learns your team** — local outcomes refine routing on your own stack; public-Lab prior seeding remains planned.

## Privacy

- **Local-first, by law.** No account or Roster API key. State lives in `~/.roster/`. Lexical full-text retrieval works without a model download; unless disabled, the optional dense path may fetch an embedding model from Hugging Face in the background. Permanently offline machines stay in lexical mode.
- **Your content never leaves.** Prompts, tool arguments, and results are never uploaded, persisted to the outcome database, or logged.
- **Telemetry is OFF by default and opt-in only.** `roster telemetry status|on|off` controls it; the published schema in [docs/telemetry-schema.md](docs/telemetry-schema.md) defines exactly what could ever be sent — coarse outcome events only, with hard exclusions for prompts, args, results, embeddings, hostnames, and paths. Aggregates publish only past k-anonymity thresholds. Full schema: [docs/telemetry-schema.md](docs/telemetry-schema.md). The upload endpoint does not exist yet, so today nothing leaves your machine even if you opt in. Before launch, the OFF default gets verified by packet capture.

## Status: pre-release

**Under active construction (July 2026). Nothing here is released, and nothing unvalidated will ship.**

- The original **July 28, 2026** launch target passed without a release; a revised date remains an owner decision.
- **Not on npm yet.** The package name is selected as `@roster/cli` (registry-available when checked on 2026-08-14); the CLI binary is `roster`. Publication and the remaining organization/domain/trademark clearance are still owner-controlled launch work.
- **No domains registered, nothing hosted.** The League generator exists and can build locally from the committed artifact, but the public League website, deployment, badges, and named signed scores are not finished or published. No telemetry endpoint exists.
- What exists today: a pnpm/TypeScript monorepo (`packages/router`, `coach`, `cli`, `combine`, `playbook`, `shared`) with CI, built against the milestones in [ROSTER-BUILD-HANDOFF.md](ROSTER-BUILD-HANDOFF.md). Strategy and decision records: [ROSTER.md](ROSTER.md), [ROSTER-STATE-AND-DECISIONS.md](ROSTER-STATE-AND-DECISIONS.md).
- Day-to-day build status: [STATUS-FOR-MO.md](STATUS-FOR-MO.md) · design docs: [docs/](docs/).

## Built with agents, reviewed by hand

Roster is developed with heavy agentic AI assistance, under written discipline: specs are amended before code, security-critical paths (eject/config rewriting, credential passthrough, telemetry redaction) are committed to line-by-line human review before launch, and no named public score ever comes from a verifier a human didn't sign. The full disclosure, the rules, and the running human-review log live at [docs/PROVENANCE.md](docs/PROVENANCE.md).

## License

[MIT](LICENSE).
