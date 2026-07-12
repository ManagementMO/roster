# Roster

> **Your agent has 200 tools. Only five get to start.**

Roster is a neutral, open-source, local-first **tool router** for AI agents. One MCP endpoint fronts every server and skill you use; your agent gets the best ≤5 tools for the task at hand — the starting five — instead of every schema at once. It learns from call outcomes, on your machine, and it works with any MCP client: Claude Code, Codex, Cursor, Gemini CLI, OpenClaw, Hermes, VS Code, and anything else that speaks the protocol.

**The eject promise, up front: `roster eject` puts every client back exactly as Roster found it**, from backups taken before Roster touches anything — byte-for-byte for dedicated MCP config files (comments and formatting included), and key-level for live state files the client itself rewrites (like `~/.claude.json`: your original servers come back, roster is removed, and every setting or server you changed since sync is preserved; `--force` does a raw byte restore instead). Trying Roster is built to be a no-risk decision — the uninstall story is a feature, not a footnote.

## Why

Tool schemas can consume [72% of a 200K context window before the first user query](https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget). Tool-selection accuracy collapses [from 43% to ~13.6% as toolsets grow](https://writer.com/engineering/rag-mcp/). In a 100-server live stress test, [the median MCP server passed only 71% of tasks; the bottom decile passed 38%](https://www.digitalapplied.com/blog/mcp-server-reliability-100-server-stress-test-study). And the haystack keeps growing: [177,000+ public MCP tools as of February 2026](https://micheallanham.substack.com/p/ai-agents-2026-the-tool-selection).

Search-based tool loading is a proven fix — Anthropic measured [an 85% token cut, with accuracy going 49% → 74%](https://www.anthropic.com/engineering/advanced-tool-use) — but shipped it for Claude. Roster's bet is that the fix should be **neutral** (every client), **learned** (outcomes, not just keywords), and **public** (a league, not a listicle).

## What it is

Four parts, one product:

- **The router ("the Rotation").** An aggregating MCP proxy. Your client configs go from N `mcpServers` entries to one. Default mode is **transparent**: a faithful passthrough — every backend tool re-exported (namespaced), with titles, annotations, and error codes preserved — outcomes logged locally. Opt into **five mode** and the agent sees two meta-tools — `draft(need)` returns the best ≤5 tools for the stated task (K configurable 1–10), `call(tool, args)` proxies the invocation. When a drafted tool hard-fails, Roster attaches a structured suggestion for the next-ranked equivalent (the Sixth Man — suggest-only at launch; the agent decides).
- **The Coach.** Local outcome learning. Every call's result — success, error class, latency, drift — is logged on-device, and a nightly CPU-only job refines routing toward the tools that actually work on *your* stack. No cloud, no GPU, no API key.
- **The League.** Public performance rankings for MCP servers and skills, fed by an open-source probe harness (the Combine) running identical, human-signed task suites against every listed server — plus, later, opt-in k-anonymous field telemetry, clearly labeled observational. Ranked by Wilson lower bound with confidence intervals shown. See [docs/methodology.md](docs/methodology.md).
- **The Playbook.** Skills (SKILL.md) are first-class alongside tools: one unified index, a bridge that serves skills as callable tools in any MCP client, per-agent skill allowlists where clients support them, and a trust scan before any skill is listed.

## Quickstart

> **Not yet published — coming July 28, 2026.** Roster is not on npm. The commands below are the planned install path and will not work today.

```sh
npx roster init   # detect clients, import every server, print your Day-0 receipt
roster sync       # swap N config entries for one (originals backed up first)
roster serve      # run the router
roster eject      # put every config back exactly as found (byte-for-byte for dedicated files)
roster receipt    # re-print your audit  ·  roster unquarantine <id>  # re-admit a drift-benched tool
```

`init` is designed to take under 60 seconds: no account, no API key, no cloud. It prints a Day-0 receipt of your setup — clients, servers, and skills discovered — modeled truthfully per client: clients that already defer tool schemas natively, like Claude Code, are reported as such rather than credited with savings they don't need. (Per-tool counts and a schema-token/$ estimate land with the receipt-depth work — `STATUS-FOR-MO.md` §4B; token estimates will carry a labeled tokenizer-dependent range, not a single ±% figure.)

## Seven day-one utilities

The League is the show; these earn the install without it:

1. **Context relief in every client** — best-five serving for the clients that have nothing native, honestly skipped for the ones that do.
2. **One roster, synced everywhere** — add a server once, every agent gets it; remove it once, it's gone everywhere. Ends the multi-format config sprawl.
3. **The Sixth Man** — failover *suggestions* when a tool hard-fails, so one bad server doesn't kill the task. Suggest-only at launch; automatic substitution returns later, if field data earns it.
4. **The flight recorder** — a local dashboard of every tool call across all your agents: what ran, what failed, what's slow, what changed.
5. **Drift alarms** — a local heads-up when a server changes its tool schemas overnight, before it silently breaks your workflow.
6. **Secrets hygiene** — API keys live in **one place** (`~/.roster/roster.json`, owner-only `0600`, alongside the config backups that hold your original files) and are passed through to backends only. They are never sent anywhere, never written to the outcome database, and never logged — but be clear-eyed: importing a server copies its `env` block, so those keys are on disk, exactly as they already were in each client's own config.
7. **A Coach that knows your team** — reliability-aware defaults seeded from public Lab data, then nightly learning on your own traffic. It gets smart on *your* stack, and it all stays on your machine.

## Privacy

- **Local-first, by law.** No account, no API key, no cloud calls at runtime. State lives in `~/.roster/`. First run serves instantly in lexical (full-text) search mode with zero downloads; a small embedding model is fetched once from Hugging Face in the background (never bundled) to upgrade retrieval. Permanently offline machines simply stay in lexical mode — that's the honest trade, stated here rather than hidden.
- **Your content never leaves.** Prompts, tool arguments, and results never leave the machine, never enter telemetry, and never appear in logs above debug level (debug redacts string values by default).
- **Telemetry is OFF by default and opt-in only.** `roster telemetry status|on|off` controls it; the published schema in [docs/telemetry-schema.md](docs/telemetry-schema.md) defines exactly what could ever be sent — coarse outcome events only, with hard exclusions for prompts, args, results, embeddings, hostnames, and paths. Aggregates publish only past k-anonymity thresholds. Full schema: [docs/telemetry-schema.md](docs/telemetry-schema.md). The upload endpoint does not exist yet, so today nothing leaves your machine even if you opt in. Before launch, the OFF default gets verified by packet capture.

## Status: pre-release

**Under active construction (July 2026). Nothing here is released, and nothing unvalidated will ship.**

- Launch target: **July 28, 2026** — the day the new MCP spec ships.
- **Not on npm yet.** Package-name clearance is pending; the CLI binary will be `roster` regardless of the final package name.
- **No domains registered, nothing hosted.** The League site, badge origin, and telemetry endpoint do not exist yet.
- What exists today: a pnpm/TypeScript monorepo (`packages/router`, `coach`, `cli`, `combine`, `playbook`, `shared`) with CI, built against the milestones in [ROSTER-BUILD-HANDOFF.md](ROSTER-BUILD-HANDOFF.md). Strategy and decision records: [ROSTER.md](ROSTER.md), [ROSTER-STATE-AND-DECISIONS.md](ROSTER-STATE-AND-DECISIONS.md).
- Day-to-day build status: [STATUS-FOR-MO.md](STATUS-FOR-MO.md) · design docs: [docs/](docs/).

## Built with agents, reviewed by hand

Roster is developed with heavy agentic AI assistance, under written discipline: specs are amended before code, security-critical paths (eject/config rewriting, credential passthrough, telemetry redaction) are committed to line-by-line human review before launch, and no named public score ever comes from a verifier a human didn't sign. The full disclosure, the rules, and the running human-review log live at [docs/PROVENANCE.md](docs/PROVENANCE.md).

## License

[MIT](LICENSE).
