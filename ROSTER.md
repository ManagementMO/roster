# ROSTER

> **Your agent has 200 tools. Only five get to start.**
>
> A neutral, open-source tool router for AI agents that serves the right ~5 tools per task, **learns from every call's outcome**, and turns its telemetry into the first **performance league for AI tools** — starters, benchings, box scores, and all.

**Status:** Ideation complete, validated, ready for design → build.
**Date:** July 3, 2026 (all research current to this date; 5 deep research passes + direct validation).
**Author:** Mo (build-in-public, solo-first).
**Launch target:** **July 28, 2026** — the day the new MCP spec ships.

---

## Table of contents

1. [TL;DR](#1-tldr)
2. [What this is](#2-what-this-is)
3. [Origin & scope decisions](#3-origin--scope-decisions)
4. [The problem, with receipts](#4-the-problem-with-receipts)
5. [Market map (as of 2026-07-03)](#5-market-map-as-of-2026-07-03)
6. [Differentiation verdicts (kill-checked)](#6-differentiation-verdicts-kill-checked)
7. [Product design](#7-product-design)
8. [Validation log & adversarial review](#8-validation-log--adversarial-review)
9. [Virality playbook (evidence-mapped)](#9-virality-playbook-evidence-mapped)
10. [Go-to-market: the 25-day launch plan](#10-go-to-market-the-25-day-launch-plan)
11. [Business model](#11-business-model)
12. [Moat analysis](#12-moat-analysis)
13. [Risks & mitigations](#13-risks--mitigations)
14. [Naming](#14-naming)
15. [MVP build plan](#15-mvp-build-plan)
16. [Success metrics](#16-success-metrics)
17. [Ideas folded in (the roads not taken)](#17-ideas-folded-in-the-roads-not-taken)
18. [Open questions](#18-open-questions)
19. [Appendix A: The metaphor dictionary](#appendix-a-the-metaphor-dictionary)
20. [Appendix B: Full source library](#appendix-b-full-source-library)

---

## 1. TL;DR

**The product:** One MCP endpoint in front of every tool/server an agent uses. Instead of dumping 200 tool schemas into context (which burns up to 72% of a 200K window and collapses selection accuracy from 43% to ~14%), Roster serves the best **five** tools for the task at hand — for **every** client (Claude, GPT, Gemini, OpenClaw, LangGraph), not just the one vendor that solved it for themselves.

**The adoption thesis:** None of it matters unless people actually install and keep it — the flywheel runs on installed routers. So agnosticism and frictionlessness are design laws, not features: it speaks plain MCP so **every** client hooks in with one line (`claude mcp add` / `codex mcp add` / `hermes mcp add` / one `mcpServers` entry in OpenClaw / one-click deeplinks in Cursor & VS Code), installs in under 60 seconds with no account and no API key, starts in transparent passthrough mode (zero behavior change), shows you your own waste immediately (the Day-0 receipt), delivers seven personal utilities before the leaderboard even enters the picture, and uninstalls byte-for-byte with one command. See §7.6.

**The moat:** It **learns**. Every tool call reports its outcome (success, error, latency, retry, drift), and a nightly job refines routing toward what actually works — the [OATS method](https://arxiv.org/abs/2603.13426) (March 2026), which lifted selection quality from 0.869 → 0.940 NDCG@5 and runs offline with no GPU. **No shipped product does this** (verified July 3, 2026).

**The show:** Opt-in, anonymized telemetry + a controlled probe fleet power the first **outcome-quality leaderboard** for AI tools — success rates, latency, drift — not the volume/SEO rankings that exist today. Tools are players: they start, they get benched, they have box scores. Nobody has made tool quality a spectator sport; nobody has made routing watchable (verified: "NO" — no live routing feed or tool arena exists anywhere).

**The launch:** July 28, 2026 — MCP spec day — with an exposé ("We crash-tested the top 200 MCP servers; X% failed basic calls"), a one-line install, and one GIF: a context meter falling from 143K tokens to ~4K while the task *succeeds*.

**The flywheel:** Utility drives installs → installs generate outcome data → data powers the league → the league generates weekly shareable content and README badges → badges and content drive installs.

---

## 2. What this is

Roster is three layers that feed each other:

### Layer 1 — The Rotation (the utility)
An aggregating MCP proxy. Your agent config goes from twenty `mcpServers` entries to one. The agent sees a couple of meta-tools (`draft` / `call`); the router serves the best five tools for the current need and swaps them mid-task as the task evolves (substitutions).

**Agnosticism is a design law:** Roster is a standard MCP server (stdio + streamable HTTP, spec 2026-07-28), which makes it compatible with *every* MCP-speaking client by construction — the protocol is the universal adapter. Verified hook-ins as of July 2026:

| Client | How Roster plugs in (one line each) | Their native gap |
|---|---|---|
| **Claude Code / Claude Desktop** | `claude mcp add roster -- npx -y roster` (or `.mcp.json` / `claude_desktop_config.json`); deeper: returns native `tool_reference` blocks via the API's third-party-search hook | Native tool search is keyword/BM25, Claude-only, no learning, no public data |
| **Codex CLI + IDE extension** | `codex mcp add roster -- npx -y roster` → `[mcp_servers.roster]` in `~/.codex/config.toml`; CLI and IDE share the config ([docs](https://developers.openai.com/codex/mcp)) | No tool search at all — static config |
| **OpenClaw** | One `mcpServers` entry (stdio or HTTP/SSE) or via the built-in `mcporter` skill ([docs](https://docs.openclaw.ai/cli/mcp)) | No first-party router; live feature requests (#15717, #29053) |
| **Hermes Agent (Nous)** | `hermes mcp add roster --command "npx -y roster"` → `~/.hermes/config.yaml`; hot-reload via `/reload-mcp` ([docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)) | Users are openly requesting selective tool loading ([issue #690](https://github.com/NousResearch/hermes-agent/issues/690)) |
| **Cursor** | One-click: `cursor://anysphere.cursor-deeplink/mcp/install?name=roster&config=<base64>` badge in the README ([install-links docs](https://cursor.com/docs/mcp/install-links)); or `~/.cursor/mcp.json` | No tool search; context bloat hits hard |
| **VS Code (Copilot)** | One-click: `vscode://mcp/install?<url-encoded JSON>` badge; or `mcp.json` ([generator](https://vscodemcp.com/)) | Static config |
| **Gemini CLI** | `mcpServers` block in `~/.gemini/settings.json` | Google punts dynamic selection to developers; docs say cap tools at 10–20 |
| **OpenAI Agents SDK / hosted MCP** | Standard remote MCP endpoint | Static `allowed_tools` filtering only |
| **Windsurf / Cline / Zed / others** | Same `mcpServers`-family configs (Windsurf `serverUrl`, Cline extensions, Zed `context_servers`) | Static config |
| **LangGraph / CrewAI / custom** | MCP client or thin SDK adapter | `langgraph-bigtool` semi-stale (545 stars, last release Jun 2025) |

One build, ten-plus surfaces — the same reason context-mode could support 18 platforms: speak the protocol, and the clients come to you.

### Layer 2 — The Coach (the brain)
Local-first outcome learning. Every call's result feeds a success-signal stack; a nightly job (cron, CPU-only, single-digit-millisecond serving cost) refines tool embeddings toward the queries where each tool historically succeeded. Your router gets measurably better at *your* stack every night — and the accuracy curve is public content.

### Layer 3 — The League (the spectacle)
Two public tables:
- **The Lab** — controlled rankings from The Combine, a standardized probe fleet running identical task suites against every listed server (reproducible, fair, publishable from day zero).
- **The Street** — observational stats from opt-in production telemetry: usage share, in-the-wild error rates, latency percentiles, schema-drift incidents.

Per-category ladders, weekly box scores, README performance badges, Rookie of the Year, and a live "who got benched today" feed.

---

## 3. Origin & scope decisions

- **Scope is TOOL/API routing, not model routing.** Decided explicitly on 2026-07-03. Model routing (OpenRouter et al.) is commoditized and out of scope. Everything here routes an agent's *capability* calls — MCP servers, tools, APIs.
- **Build-in-public project first, startup optional.** Monetization is a nice-to-have, not the goal. Every design choice favors: fast time-to-magic-demo, OSS-friendly, self-generating content.
- **Named "Roster"** after the original working name "Loadout" died in research (two direct collisions in this exact niche + a YETI trademark — see §14).

---

## 4. The problem, with receipts

Every number below is sourced and dated.

| Fact | Number | Source |
|---|---|---|
| Context consumed by tool schemas before the first user query | 143K of 200K tokens = **72%** | [AgentMarketCap, Apr 8 2026](https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget) |
| Tool-selection accuracy collapse as toolsets bloat | **43% → ~13.6%** | [WRITER RAG-MCP research](https://writer.com/engineering/rag-mcp/) |
| Cost of the waste | ~$3.75/dev/day; **~$137K/year per 100 devs** | [AgentMarketCap](https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget) |
| GitHub's official MCP server schema weight alone | **~55K tokens** | [ToolRadar](https://toolradar.com/guides/best-mcp-servers) |
| GitHub Copilot's own fix | Cut 40 → 13 tools: **+2–5pp SWE-bench, −400ms latency** | [The New Stack](https://thenewstack.io/how-to-reduce-mcp-token-bloat/) |
| Best model on MCP-Atlas (1,000 real-server tasks) | **62.3%** at paper time; **83.6%** top pass after the Apr 2026 judge update — best systems still fail ~1 in 6 tasks | [Scale MCP-Atlas](https://labs.scale.com/leaderboard/mcp_atlas) |
| GPT-5-medium on MCPMark | **52.6% pass@1** | [MCPMark](https://mcpmark.ai/) |
| Live-endpoint reality (100 servers, 12K trials, Feb–Apr 2026) | Median server passes only **71%** of tasks; bottom decile **38%**; P95 latency 5.7× P50; schema mismatches = 38% of failures | [Digital Applied stress test](https://www.digitalapplied.com/blog/mcp-server-reliability-100-server-stress-test-study) |
| Proof the fix works (search-based tool loading) | **85% token cut; accuracy 49% → 74%** (Opus 4), 79.5% → 88.1% (Opus 4.5) | [Anthropic, Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use) |
| Proof the market rewards context savings | context-mode: **18,543 GitHub stars** within months (created 2026-02-23) | [mksglu/context-mode](https://github.com/mksglu/context-mode) *(repo path per kill-check research)* |

Demand quotes (verbatim, from research):

> "Claude Code loads all tool definitions upfront at session start, which consumes significant context tokens…" — [anthropics/claude-code#12836](https://github.com/anthropics/claude-code/issues/12836) (opened Dec 1 2025, now closed — Anthropic shipped the fix, validating the problem at platform level)

> "MCP wastes a lot of tokens compared to regular tool calling… if you try to mix and match servers things get out of hand really quickly." — [HN, Nov 2025](https://news.ycombinator.com/item?id=45954572)

> Per-agent skills allowlist requested so "agents don't waste tokens on irrelevant skill descriptions in system prompt." — [openclaw/openclaw#15717](https://github.com/openclaw/openclaw/issues/15717) (Feb 13, 2026)

> "Feature: MCP Server Management — Discovery, Selective Tool Loading, and hermes mcp CLI" — [NousResearch/hermes-agent#690](https://github.com/NousResearch/hermes-agent/issues/690) (open feature request; Hermes users asking for exactly this layer)

Ecosystem scale (why this matters now):
- **9,652 servers** in the official MCP Registry (May 24, 2026); ~9,400 distinct across 4 registries in April (**+38% in 4 months**); up to ~17,000 indexed across all sources ([H1 2026 retrospective](https://www.digitalapplied.com/blog/mcp-ecosystem-h1-2026-retrospective-adoption-data-points)).
- **10,000+ active public servers; 97M+ monthly SDK downloads** (Anthropic, Dec 9 2025); MCP now under the Linux Foundation ([stats roundup](https://mcpmanager.ai/blog/mcp-adoption-statistics/)).
- **41% of software orgs** in limited/broad production with MCP (Stacklok survey, same roundup).
- PulseMCP indexing **~1,000+ new servers/month** through H1 2026 ([PulseMCP](https://www.pulsemcp.com/statistics)).
- **177,000+ public MCP tools by February 2026**, up from ~4,900 in early 2025 ([tool-selection crisis analysis](https://micheallanham.substack.com/p/ai-agents-2026-the-tool-selection)) — the haystack grows ~35× per year while context windows don't.

---

## 5. Market map (as of 2026-07-03)

### 5.1 Platform natives (the absorbed layer)

| Platform | What they shipped | What they DON'T do |
|---|---|---|
| **Anthropic / Claude Code** | MCP Tool Search **native & on by default** since Jan 14, 2026 (Claude Code ≥2.1.7); auto-defers when tool defs exceed 10% of context; ~77K → 8.7K tokens for 50+ tools; API-side Tool Search Tool (regex/BM25 variants, ≤10,000 deferred tools, returns ≤5 `tool_reference`s) + Programmatic Tool Calling (37% token cut) — [announcement analysis](https://tessl.io/blog/anthropic-brings-mcp-tool-search-to-claude-code/), [docs](https://code.claude.com/docs/en/agent-sdk/tool-search), [engineering post](https://www.anthropic.com/engineering/advanced-tool-use) | Keyword search only (no learning); single-vendor; **explicitly supports third-party search** — any tool may return `tool_reference` blocks ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)) — which is Roster's plug-in point |
| **OpenAI** | Hosted MCP tool with static `allowed_tools` filtering; AgentKit Connector Registry (governance, beta) ([docs](https://developers.openai.com/api/docs/guides/tools-connectors-mcp), [AgentKit](https://openai.com/index/introducing-agentkit/)) | No search, no learning, no rankings |
| **Google** | Gemini Enterprise Agent Platform remote MCP server GA June 30, 2026; Agent Registry for governance ([blog](https://cloud.google.com/blog/products/ai-machine-learning/gemini-enterprise-agent-platform-remote-mcp-server/)); docs advise capping tools at 10–20 ([function calling docs](https://ai.google.dev/gemini-api/docs/function-calling)) | Dynamic selection explicitly punted to developers |
| **Docker** | Dynamic MCP (`mcp-find`/`mcp-add`/code-mode), default-on in MCP Toolkit but still flagged experimental ([blog](https://www.docker.com/blog/dynamic-mcps-stop-hardcoding-your-agents-world/), [docs](https://docs.docker.com/ai/mcp-catalog-and-toolkit/dynamic-mcp/)) | Docker-gateway-only; no learning; no rankings |

### 5.2 Commercial routers & gateways

| Player | State | Gap vs Roster |
|---|---|---|
| **Composio Tool Router** | GA ~May 2026, "the core way of building with Composio"; per-user pre-signed MCP sessions; auto app/tool selection from 10–20k+ tools; $29–$229/mo ([overview](https://docs.composio.dev/tool-router/overview), [migration guide](https://docs.composio.dev/docs/migration-guide/tool-router-beta), [pricing](https://composio.dev/pricing)); $29M Series A ([blog](https://composio.dev/blog/series-a)) | Selection is search/plan at session time — **no outcome learning anywhere in docs**; publishes zero tool-quality data; **sells the catalog it would rank** (structural conflict) |
| **ToolHive / Stacklok** | MCP Optimizer: hybrid FTS5+embedding search, ≤8 tools/request, 60–85% token cut, 94% selection-accuracy claim; in K8s-native vMCP since Mar 9, 2026 ([updates](https://docs.stacklok.com/toolhive/updates/2026/03/09/updates), [guide](https://docs.stacklok.com/toolhive/guides-vmcp/optimizer)); 1,924 stars | **Docs confirm stateless** — no outcome/latency feedback loop; manual ratio tuning; enterprise-aimed |
| **Apigene** | Gateway, 251+ vendor-verified servers, session-context dynamic loading, "up to 70%" overhead cut ([site](https://www.apigene.ai/mcp-gateway)) | No learning; no public data |
| **Bifrost (Maxim)** | Go LLM+MCP gateway, 11µs overhead, Code Mode ~50% token cut ([repo](https://github.com/maximhq/bifrost)) | Governance-focused; no learned routing |
| **Obot** | OSS gateway+catalog platform, $35M seed ([news](https://finance.yahoo.com/news/obot-ai-secures-35m-seed-120000083.html)); 872 stars | Manual trust levels; enterprise sales-led |
| **MintMCP** | Curated Virtual MCP Bundles, SCIM, SOC2, custom quotes ([pricing](https://www.mintmcp.com/pricing)) | Manual curation, not learned |
| **Smithery** | Toolbox meta-MCP routing since Apr 2025 ([announcement](https://x.com/Calclavia/status/1911638656345153559)); pivoted to skills ("15k+ Claude-compatible skills"); runs a **24h usage leaderboard** ([leaderboard](https://smithery.ai/leaderboard)) | Leaderboard is volume-only — no quality/outcome signal; routing doesn't learn |
| **Klavis AI (Strata)** | YC-backed; open-source unified MCP router with progressive tool discovery — and it *tops MCPMark's server leaderboard*, beating GitHub's official server 31.5% vs 16.3% Pass@1 and Notion's 34.8% vs 21.4% ([leaderboard](https://mcpmark.ai/leaderboard/mcp)) | No outcome learning; publishes no quality data of its own — and its benchmark wins are the best proof that *official ≠ best*, i.e., the League's entire narrative |

### 5.3 OSS aggregators (all static — none learn)

Star counts from the July 2026 kill-check sweep: [mcp-use](https://github.com/mcp-use/mcp-use) 10,234 · [IBM ContextForge](https://github.com/IBM/mcp-context-forge) 4,014 · agentgateway 3,659 · [sparfenyuk/mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) 2,642 · [MetaMCP](https://github.com/metatool-ai/metamcp) 2,491 · mcphub 2,204 · Unla 2,164 · mcp-router 2,077 · mcpjungle 1,132 · mcpm.sh 975 · [microsoft/mcp-gateway](https://github.com/microsoft/mcp-gateway) 726 · MCP-Zero 488 (stale since Jul 2025) · [Lasso security gateway](https://github.com/lasso-security/mcp-gateway) 377. Gateway commoditization is so complete there are ["13 best MCP gateways" listicles](https://obot.ai/blog/the-13-best-mcp-gateways-for-enterprise-teams/).

### 5.4 Rankings that exist today (and why they're not the League)

| Ranking | Method | Why it's not this |
|---|---|---|
| [Glama](https://glama.ai/mcp/methodology) | Static LLM-evaluated score: 70% tool-definition quality + 30% server coherence | Grades the *description*, not the *performance* |
| [mcp.so Call Ranking](https://mcp.so/ranking) | Call volume per timeframe (data source unverified) | Popularity, not quality |
| [PulseMCP](https://www.pulsemcp.com/statistics) | "Estimated downloads" blended from SEO/social/registry signals | Proxy metrics, not telemetry |
| [Smithery leaderboard](https://smithery.ai/leaderboard) | 24h raw usage | Volume, no outcome signal |
| [Scale MCP-Atlas](https://labs.scale.com/leaderboard/mcp_atlas) | Rigorous — but ranks **models**, not tools | Wrong axis |
| [MCPMark server leaderboard](https://mcpmark.ai/leaderboard/mcp) | **The closest prior art, found in final verification:** benchmarks server *implementations* on a fixed model baseline (Pass@1/@4, tokens, cost) | Static benchmark runs, only 3 categories (GitHub/Notion/Postgres), **last updated Nov 6, 2025** — 8 months stale; no live traffic, no continuity, no league layer |
| [Digital Applied 100-server stress test](https://www.digitalapplied.com/blog/mcp-server-reliability-100-server-stress-test-study) | One-off study (Apr 2026): 100 live servers, 12K trials — median 71% pass | **Anonymized** (no named per-server scores), no tracker; rerun planned Oct 2026 |

(Roster's Lab differs from all of the above by construction: automated weekly reruns from day one, a live-traffic Street pipeline, provenance-flagged methodology, and the league layer — continuity is the product, not a snapshot.)

Adjacent observability products — all verified **private** on 2026-07-03, none publish public quality data: [mcpevals.io](https://www.mcpevals.io/) (CI eval package for server owners), [MCPcat](https://mcpcat.io/) (owner-side analytics), [Snyk Agent Scan](https://github.com/invariantlabs-ai/mcp-scan) (local security scanner, 2.7K stars — results stay on-machine; large-scale API scanning explicitly forbidden).

### 5.5 Direct-premise neighbors (cite these generously)

- **[ToolRoute](https://github.com/grossiweb/ToolRoute)** (toolroute.io) — the closest existing thing, verified directly on 2026-07-03: routes across MCP servers *and* models using a weighted scorecard (quality 35 / reliability 25 / efficiency 15 / cost 15 / trust 10) that **does** update from reported outcomes; 132 blind A/B executions; v0.2.1 (Mar 28, 2026), 432 commits, MIT, Next.js/Supabase/Vercel. **1 GitHub star. No public leaderboard.** It validates the premise and teaches the lesson: *distribution is the product*. Differences: scorecard weights vs. embedding-level learning; no league; no probe fleet; no privacy-first local mode; scope creep into model routing.
- **[Agent402](https://github.com/MikeyPetrillo/Agent402)** — "Find·Route·Leaderboard" for 1,346 x402 pay-per-call tools; 3 stars (Jun 11, 2026). Same instinct, crypto-payments niche.
- **context-mode** — 18,543 stars for sandboxed tool output (98% context cut). Adjacent proof of appetite, not a router.
- **Research**: [OATS](https://arxiv.org/abs/2603.13426) is the method nobody productized; [ToolRM (reward models for tool calls)](https://arxiv.org/abs/2509.11963), [pairwise tool-preference RMs](https://arxiv.org/abs/2510.26167), [Red Hat's "Tool RAG" framing](https://next.redhat.com/2025/11/26/tool-rag-the-next-breakthrough-in-scalable-ai-agents/).

---

## 6. Differentiation verdicts (kill-checked)

Three claims were adversarially audited against the live market on July 3, 2026:

1. **"No outcome-learned tool router has shipped with any traction."** ✅ **CONFIRMED.** Composio (GA, search-based), ToolHive (explicitly stateless), Docker, Apigene, Bifrost, Smithery all select statically per request. Sole counterexample: ToolRoute at 1 star (cite it preemptively and graciously).
2. **"No real-traffic tool-quality leaderboard exists."** ⚠️ **NARROWED TWICE, SURVIVES PRECISELY PHRASED.** Volume boards exist (Smithery, mcp.so, PulseMCP estimates). Final verification (2026-07-03) also found [MCPMark's server-implementation leaderboard](https://mcpmark.ai/leaderboard/mcp) — static benchmark runs, 3 categories, last updated Nov 2025 — and Digital Applied's *anonymized* one-off stress test (Apr 2026). The claim that survives, verbatim: **no continuous, named, cross-category tool-quality league fed by live traffic and standing probes exists.** That is exactly what the League is. Bonus: MCPMark's own data supplies the drama thesis — an aggregator (Klavis Strata) beats GitHub's official server 31.5% vs 16.3%.
3. **"No neutral, cross-vendor, learned routing exists."** ✅ **CONFIRMED.** Anthropic/Docker/Google/OpenAI mechanisms are vendor-tied and non-learning; Composio is cross-app but conflicted and non-learning. **Caveat that shapes everything:** the naive "fewer tools in context" pitch is being absorbed by platforms (Claude Code, Jan 2026). Differentiation lives in **learning + neutrality + public data**, never in raw context savings alone.

Also verified as genuinely open: **nobody has made routing watchable** — no live routing feed, no tool arena, anywhere (virality research returned an explicit "NO").

---

## 7. Product design

### 7.1 The Rotation — aggregating proxy

**Flow (meta-tool pattern, the established standard):**
1. Agent connects to Roster as its only MCP server; sees `draft(need)` and `call(tool, args)` (+ optional transparent mode that injects top-K schemas directly).
2. On `draft`, the router embeds the stated need, searches the aggregated tool index, returns the top-5 as compact schemas — or as native `tool_reference` blocks for Claude clients.
3. `call` proxies to the underlying server, captures outcome signals, streams the result back.
4. **Substitutions:** the roster is per-need, cached per-session (new spec's `ttlMs`/`cacheScope`); a change of intent re-drafts mid-task.
5. **The Sixth Man (novel utility feature):** on a starter's hard failure, automatically retry with the next-ranked equivalent tool (e.g., a second search server). Failover routing between redundant tools is something **no current gateway ships** — and it's a killer live-demo moment.

**Why K=5:** matches Anthropic's own ≤5 `tool_reference` return budget; ToolHive caps at 8. Configurable; 5 is the brand.

**Spec alignment (2026-07-28 — verified against the [RC post](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)):**
- Stateless core (no `initialize` handshake, no `Mcp-Session-Id`) — "a remote MCP server can now run behind a plain round-robin load balancer."
- `Mcp-Method`/`Mcp-Name` routing headers (SEP-2243) — added *explicitly* so gateways can route without body inspection.
- `requestState` resumption tokens; `ttlMs`/`cacheScope` caching (SEP-2549); W3C Trace Context in `_meta` (SEP-414).
- Burdens to engineer around: merging Extensions capability maps across heterogeneous backends; Tasks-as-extension passthrough; auth issuer binding (SEP-2352, RFC 9207 `iss` validation per SEP-2468) complicates credential pass-through — v1 keeps credentials local per-backend, no re-issuing.
- Deprecated features keep working ≥12 months — safe compat window for older servers.

**Architecture verification (2026-07-03, direct deep-search pass — core confirmed, three best-practice rules adopted):** the meta-tool pattern is not just industry-converged (Anthropic's 85% / 49→74% numbers) — it is **immune to the ecosystem's biggest client gap**: mid-session `tools/list_changed` notifications are [ignored by Cursor CLI](https://forum.cursor.com/t/mcp-notifications-tools-list-changed-not-acted-on-mid-session/161459), [absent in Gemini CLI](https://github.com/google-gemini/gemini-cli/issues/13850), and [uneven across clients generally](https://www.pulsemcp.com/posts/mcp-client-capabilities-gap). Draft/call never changes the client-visible tool list, so roster substitution works on every client, while dynamic-injection designs silently break. Rules adopted into the build spec from this pass: (1) **adaptive engagement** — per Anthropic's own guidance, below ~10K tokens of definitions plain injection beats indirection, so transparent stays default there and five mode engages above; (2) **Sixth Man schema guard** — auto-substitute only when the original args validate against the candidate's schema (equivalent tools rarely share schemas), otherwise return a soft-substitution hint; (3) **deprecation-window passthrough** — the 07-28 spec dissolves the documented gateways-break-sampling pitfall (sampling deprecated per SEP-2577; interactions become payload-carried Multi Round-Trip Requests per SEP-2322, which flow through a stateless proxy naturally), with bidirectional passthrough for legacy backends meanwhile. Also verified: flat retrieval is correct at local scale, with hierarchical Tool-to-Agent-style routing as the registry-scale upgrade path — and proxy-level enforcement is now [academically endorsed as the correct control point](https://arxiv.org/pdf/2605.18414).

**The Playbook — skills are first-class in v1 (owner decision, 2026-07-04, after a dedicated research pass):** tools are players, skills are plays, one roster. The case: SKILL.md is an [open standard adopted by 26+ platforms](https://agentskills.io/specification) (Claude Code, Codex, Gemini CLI, Copilot/VS Code, Cursor, OpenClaw…); OpenClaw's skills bloat is quantified (~70+52+25 skills injected into every prompt, deterministic char cost) and their [per-agent allowlist mechanism already shipped](https://docs.openclaw.ai/tools/skills-config) — Roster writes it; SOTA research ([SkillRouter](https://arxiv.org/html/2603.22455v4), ~80K-skill scale) says the decisive routing signal is the **full skill body**, which our full-text ladder already indexes; dumb skill→tool bridge shims ([Skillz](https://github.com/intellectronica/skillz), [mcp-skill-hub](https://github.com/undermybelt/mcp-skill-hub)) prove the universal-serving pattern but have zero routing intelligence, learning, or trust layer; an official [Skills-over-MCP working group](https://github.com/modelcontextprotocol/experimental-ext-skills) confirms the protocol is heading this way; and ClawHavoc's 1,184 malicious skills make a trust-gated Skills Division the missing institution. Full spec: handoff §6.7. This also dissolves the red team's beachhead objection — OpenClaw's #1 pain is now squarely addressed.

### 7.2 The Coach — outcome learning (local-first)

**Success-signal stack** (per call, strongest-first):
1. MCP `isError: true` on `tools/call` results + JSON-RPC error class ([spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools); guides: [mcpcat](https://mcpcat.io/guides/error-handling-custom-mcp-servers/), [alpic](https://alpic.ai/blog/better-mcp-toolscall-error-responses-ai-recover-gracefully), [mcpevals](https://www.mcpevals.io/blog/mcp-error-codes)).
2. Input/output schema validation (drift detection doubles as a league stat).
3. Retry-as-soft-failure: the agent re-calling the same tool with adjusted args is a negative signal.
4. Timeouts and latency percentiles.
5. Optional end-of-task completion signal (client hook), OATS's suggested "downstream signal."

**Learning rule** ([OATS, verified](https://arxiv.org/abs/2603.13426)): nightly, per tool *i*:
`ê_i = (1−α)·e(d_i) + α·ē(Q_i⁺) − β·ē(Q_i⁻)`, α=0.3 (pull toward the centroid of queries where the tool succeeded), β=0.1 (push from hard negatives), renormalized; N=3 refinement iterations. Zero serving-time cost (single-digit-ms CPU), no GPU, base mechanism worked with as few as 4 positive / 7 negative examples; optional tiny MLP re-ranker (2,625 params) from ~10 outcomes/tool. Results: NDCG@5 **0.869 → 0.940** (MetaTool, 199 tools), 0.834 → 0.848 (ToolBench, 2,413 APIs).

**Attribution fairness (critical):** [MCP-Atlas](https://arxiv.org/abs/2602.00933) found **63.3% of agent failures are cognitive** (bad plan), not tool faults. So the Coach separates *tool error rate* (isError/timeout/drift — attributable) from *task failure* (ambiguous), stratifies by model family and intent category, and never downgrades a tool on thin or single-model evidence.

**Local-first:** the Coach learns on-device from *your* traffic (your router tunes to your team). New installs are seeded with priors from the public Lab table, so day-one routing is already smart — the league makes every local router better; opt-in local routers make the league better. That's the network effect.

**Method verification (2026-07-03, direct deep-search pass):** the Coach's design was checked against every competing method family before being confirmed. (1) The field's tool-retrieval benchmark, [ToolRet (7.6K tasks, 43K tools)](https://arxiv.org/abs/2503.01763), found that even embedding models strong on general IR benchmarks **perform poorly on tool retrieval** — which is precisely why a static-embedding router underperforms and why outcome-adjustment is a corrective, not a gimmick. (2) Dedicated trained retrievers/rerankers (Tool-Embed/Tool-Rank, SOTA on ToolRet) and newer directions ([Tool-to-Agent retrieval](https://arxiv.org/html/2511.01854v1), +17.7% Recall@5 on LiveMCPBench; ToolDreamer; multi-step query planning) are watchlist items — if open weights exist at build time they slot in as the *base* embedding, and OATS still refines whatever base is used. (3) [Contextual-bandit routing](https://arxiv.org/pdf/2510.07429) is real 2025–26 research — adopted not as a replacement but as a fix for OATS's one weakness (exploitation-only feedback lock-in): a small ε-exploration "challenger slot" in each draft, which also generates the counterfactual data that later powers Bradley-Terry matches. (4) [Document expansion](https://arxiv.org/pdf/2510.22670) ("tools are under-documented") adds cheap, evidenced index-time gains — synthetic example-queries per tool, shipped inside the Lab priors so the local default stays API-free. (5) Cross-encoder reranking (15–40% accuracy lift in general RAG) costs ~100–300ms/50 pairs on CPU — too slow for the default <50ms draft budget, so it ships as optional accuracy-mode [P2]. (6) LLM-judge routing and RL rejected: serving cost violates local-first. Defaults updated accordingly: EmbeddingGemma-300M base (built for on-device: <200MB quantized, ~22ms embeds, near-larger-model MTEB quality; MiniLM-L6 low-RAM fallback), transformers.js v4 runtime (Node WebGPU, ~4× BERT-class speedup), sqlite-vec store. The full stack — strong small base + expanded docs + OATS nightly refinement + ε-exploration + optional reranker + Wilson/BT league math — is layered so each piece is independently evidenced and independently replaceable.

**Second verification pass (same day — resolving every "check at build time"):** EmbeddingGemma's ONNX build is **confirmed working in transformers.js/Node** ([onnx-community/embeddinggemma-300m-ONNX](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX), [HF launch post](https://huggingface.co/blog/embeddinggemma)) — but it carries the Gemma license, so weights are downloaded at first run, never bundled. The ToolRet-SOTA retrievers (Tool-Embed) turn out to be built on **Qwen3-Embedding-0.6B — Apache 2.0** — which therefore becomes the clean `--quality` tier (and the slot Tool-Embed's own weights would fill if released). The BM25 evidence (ToolRet N@10 ≈36 as a workable floor, but dense winning single-tool NDCG@1 ~58 vs ~18) produced the final adoption upgrade: a **progressive retrieval ladder** — instant lexical FTS5 at install (zero download, the same mechanism Claude's native search uses), silent upgrade to hybrid BM25+dense when the background download lands, OATS on top, reranker optional. First run now waits on *nothing*. And [sqlite-vec is confirmed healthy](https://github.com/asg017/sqlite-vec/releases) (Mozilla-backed, v0.1.9 Mar 2026) with a trivial fallback anyway — at ≤2,000 tools, brute-force cosine is milliseconds, so ANN is a convenience, not a dependency.

### 7.3 The League — Lab + Street

**The Lab (controlled — credible from day zero):**
- **The Combine**: an open-source probe harness running standardized, category-specific task suites against every listed server. Read-only intents probe live servers; stateful/write tasks run against sandboxed self-hosted instances with MCPMark-style programmatic state verification ([MCPMark](https://arxiv.org/abs/2509.24002): initial state + per-task script checking final environment state — no LLM judge needed). Failure classification borrows [MCP-Atlas's 11-category taxonomy](https://arxiv.org/abs/2602.00933).
- Identical tasks for every server in a category → scientifically defensible rankings, reproducible by anyone (the harness is OSS — server authors run it pre-listing, like a draft combine).
- **Feasibility is empirically proven and the field is time-limited:** Digital Applied probed 100 *live* endpoints (~60K tool calls, Feb–Apr 2026) solo-team-style — so the Combine is mechanically doable — but published no named scores and plans a 200-server rerun in **October 2026**: the named, continuous version of this space is claimable for roughly one quarter. Their findings calibrate our suites (schema mismatches 38% / timeouts 24% / auth 19% of failures; browser-automation category at 47% vs file-system at 89%). Telemetry and probe metrics adopt [OpenTelemetry semantic conventions with tail-based sampling per the MCP SLO framework](https://www.digitalapplied.com/blog/mcp-server-reliability-metrics-slo-design-framework-2026); prior-art credit and task-format inspiration: [MCPMark's server leaderboard](https://mcpmark.ai/leaderboard/mcp).

**The Street (observational — grows with adoption):**
- Opt-in telemetry aggregates: usage share, in-the-wild success rate, latency percentiles, drift incidents. Explicitly labeled observational.

**Rating math (published, versioned, open):**
- Primary: per-category success rate ranked by **Wilson score lower bound** ([Evan Miller](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html) — the math behind Reddit's "best" sort; humble with small samples by construction).
- Graduation: synthetic Bradley-Terry matches (router ranked A over B for the same intent; A succeeded → win) fed to [Arena-Rank](https://github.com/lmarena/arena-rank) (LMArena's open-sourced MLE + bootstrap CIs) once traffic densifies; minimum-sample inclusion thresholds à la LMArena's ~5,000-vote bar, scaled to our volumes.
- Precedent for rating items from solo trials: Lichess rates puzzles by treating solver-vs-puzzle as a match ([Lichess FAQ](https://lichess.org/faq)).
- Confounding guard: routing is non-random → stratify by category and difficulty; the Lab (randomized) is the controlled backbone; the Street is the garnish.

**Artifacts:** per-category standings; All-Star teams (category champions); the Benched list; Sixth Man of the Week (best failover save); Rookie of the Year (best new server); weekly **box scores** (deltas, upsets, streaks — deltas are what travel); README badges (league-signed SVG shields keyed to server ID — install badges exist at [mcpbadge.dev](https://mcpbadge.dev/), performance badges don't); live routing/benching feed on the homepage.

### 7.4 Telemetry & privacy (the Go model)

Designed against the documented backlash pattern ([Go's opt-out proposal → hundreds of hostile replies → reversed to opt-in](https://github.com/golang/go/discussions/58409); [Go 1.23 shipped local-mode default](https://devclass.com/2024/08/14/go-1-23-released-with-telemetry-uploaded-to-google-but-opt-in-after-developer-feedback/); [GitHub CLI's Apr 22, 2026 opt-out got roasted](https://www.theregister.com/2026/04/22/github_opts_all_cli_users/)):

- **Local-first:** all outcome data collects on disk; learning happens locally regardless.
- **Upload is opt-in**, one command (`roster telemetry on|off|status`), schema published in the repo, announced before shipping.
- What uploads (when opted in): server ID/version, tool name, coarse intent category, outcome class, latency bucket, model family. **Never:** prompts, arguments, results, or raw embeddings.
- k-anonymity: a server appears on the Street board only with ≥N distinct reporting installs.

### 7.5 Security posture (the Bouncer, folded in)

The router is a natural checkpoint, and 2026's incident record is the marketing: [Microsoft's June warning on poisoned tool descriptions](https://thehackernews.com/2026/06/microsoft-warns-poisoned-mcp-tool.html), [CSA's "MCP Security Crisis" note (May 4)](https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-security-crisis-20260504-csa-styled/), [ClawHavoc: 1,184 malicious skills, 247K installs, $2.3M stolen](https://www.termdock.com/en/blog/clawhub-malicious-skills-incident), [Censys: 21K+ exposed servers](https://censys.com/blog/mcp-servers-on-the-internet/), [Bitsight: 1,467 no-auth](https://www.bitsight.com/blog/exposed-mcp-servers-reveal-new-ai-vulnerabilities), [~200K instances at risk via SDK default](https://www.theregister.com/2026/04/16/anthropic_mcp_design_flaw/).

v1 features: description-poisoning heuristics at index time; schema-drift quarantine ("this server changed 3 tool schemas overnight — benched pending review" — drift alerting is confirmed unfilled white space); allowlist mode; Trust as a scored League column. Curated listings only — ClawHavoc made "unvetted marketplace" a liability. The position is now academically backed: prompt-level defenses don't hold, and [architectural enforcement via an MCP proxy is the endorsed control point (May 2026)](https://arxiv.org/pdf/2605.18414); the [MCP Pitfall Lab attack taxonomy (Apr 2026)](https://arxiv.org/pdf/2604.21477) feeds the Combine's security suites.

### 7.6 Adoption engineering — agnostic, frictionless, sticky

> The flywheel runs on installed routers. Virality and the dataset are downstream of one thing: **people install it, it works great immediately, and it earns its place before asking for anything.** This section is that guarantee, built from evidence.

**The blueprint validated at scale:** context-mode reached **18.5K stars** across 18 client platforms, and its adoption anatomy (verified from its repo) reads like a spec for us — its winning path was a 2-command install with automatic registration and *no files written to the project*; its documented friction was manual JSON editing on other platforms; its "key enablers" were per-platform config templates and auto-detecting the client via the MCP handshake's `clientInfo.name`. Its value framing was pain-first: "After 30 minutes, 40% of your context is gone." We adopt all four lessons wholesale.

**The 60-second path (install UX spec):**

1. **One command:** `npx roster init` (Node) or `uvx roster init` (Python folks). No account. No API key. No cloud calls at runtime — retrieval serves **instantly in lexical mode with zero download**, the local embedding model fetches once in the background (checksummed, never bundled), and after that everything runs offline; permanently-offline machines simply stay in lexical mode.
2. **Auto-import:** the wizard scans the known config locations for every installed client — `~/.claude/settings.json` + `.mcp.json` + `claude_desktop_config.json`, `~/.codex/config.toml` (`[mcp_servers.*]` TOML), `~/.cursor/mcp.json`, `~/.gemini/settings.json`, `~/.hermes/config.yaml`, `openclaw.json`, Windsurf/Cline/VS Code variants ([the 8-format fragmentation is documented](https://mcpplaygroundonline.com/blog/complete-guide-mcp-config-files-claude-desktop-cursor-lovable) — there are even [converter tools](https://mcp.directory/tools/mcp-config-converter) because this mess is that bad) — and imports every server it finds into one roster. Nothing to retype, nothing to remember.
3. **The Day-0 receipt (the aha moment, before any behavior change):** the wizard immediately prints your personal audit — *"Found 3 clients, 14 servers, 187 tools. Tool schemas ≈ 96K tokens loaded per session. Estimated waste: ~$X/month. Projected reduction with Roster: ~85%."* You see your own number in the first minute. That receipt is a shareable card — the personal-virality artifact exists before the leaderboard does.
4. **One-keystroke swap, fully reversible:** `roster sync` writes the single Roster entry into each detected client (originals backed up); `roster eject` restores every config byte-for-byte. Reversibility is what makes trying it a no-risk decision — the uninstall story is a *feature*, advertised up front.
5. **Transparent mode by default (progressive trust ladder):** on day one Roster is a pure passthrough proxy — identical behavior, zero routing changes, just observability (the flight recorder starts filling). Then, at the user's pace: **observe → route** (`--five` mode, top-K serving) **→ learn** (local Coach) **→ share** (opt-in telemetry). Nobody is asked to trust routing before they've watched it observe correctly.
6. **Every install surface pre-built:** one-click deeplink badges for Cursor (`cursor://anysphere.cursor-deeplink/mcp/install?...`) and VS Code (`vscode://mcp/install?...`) in the README; a Claude Code plugin-marketplace listing (context-mode's highest-converting channel); `claude mcp add` / `codex mcp add` / `hermes mcp add` copy-paste lines per client; per-platform config templates in `configs/` for everything else.

**Day-one value stack — seven reasons it earns its place before the League exists:**

| # | Utility | Why it matters immediately |
|---|---|---|
| 1 | **Context savings in every client** | The 85%-class win Claude Code users already enjoy — delivered to Codex, Cursor, Gemini CLI, OpenClaw, Hermes, and friends who have nothing |
| 2 | **One roster, synced everywhere** | Ends the 8-format config sprawl: add a server once, every agent gets it; remove it once, it's gone everywhere. A standalone reason to install even with five tools |
| 3 | **The Sixth Man** | Automatic failover to the next-ranked equivalent tool when a call hard-fails — your agent stops dying because one server had a bad day. No gateway ships this |
| 4 | **The flight recorder** | A local dashboard of every tool call across all your agents: what ran, what failed, what's slow, what changed. The pi-hole pattern — people love watching their own counters |
| 5 | **Drift alarms, personally** | "The GitHub server changed 3 tool schemas overnight" as a local notification before it silently breaks your workflows — confirmed unfilled white space, delivered as personal utility first |
| 6 | **Secrets hygiene** | API keys live in one place instead of being pasted across five client configs |
| 7 | **A Coach that knows *your* team** | Routing tuned to your actual stack and habits, seeded with Lab priors so it's smart on day one — and it all stays on your machine |

**The retention loop (works with telemetry off):** a weekly *local* box score — "your agents made 412 tool calls, saved ~61K tokens/session on average, Sixth Man rescued 7 tasks, 1 drift alarm" — value that recurs whether or not the user ever opts into sharing. The public League is the cherry; the sundae is local.

### 7.7 The Hook, meta-reviewed (is the install incentive actually strong enough?)

A dedicated adversarial pass on the single most important question — *will people actually install this?* — scored the hook against the documented mechanics of things that verifiably drove mass adoption, and produced one honest weakness plus four upgrades, all now part of the spec.

**The honest weakness first:** for **Claude Code users specifically**, the headline "save 85% of your context" hook is weakened — they've had native tool search since January. Messaging to that segment must never lead with token savings or it reads as ignorant. Their hooks, in order: (1) routing that *learns* (Claude's search is keyword/BM25 and remembers nothing — ours gets measurably better on your stack every night), (2) the Sixth Man (failover Claude doesn't do), (3) one roster synced across every other agent they run, (4) the flight recorder + drift alarms. For everyone else — Codex, Cursor, Gemini CLI, OpenClaw, Hermes, where *nothing* native exists — the full savings hook fires at full strength. **Rule: segment-differentiated first-lines, one product.**

**Upgrade 1 — give the receipt an identity layer (the Wrapped mechanic).** Spotify Wrapped's documented formula is exactly ours to borrow: personal data → identity narrative → designed-for-sharing card → scarcity moments; it drove [500M+ shares within the first day in 2025, +41% YoY](https://nogood.io/blog/spotify-wrapped-marketing-strategy/), and its recent growth features are literally ["user archetypes" and top-X% comparisons](https://www.idomoo.com/blog/why-spotify-wrapped-works-and-how-you-can-do-it-too/). So the Day-0 receipt gains: **an archetype** ("Tool Hoarder" — 187 tools, 9 used; "Minimalist"; "Franchise Owner" — 3 clients, one roster; "Benchwarmer Collector" — 40 tools that have never once been called), **a percentile** ("your setup carries more schema weight than ~92% of configurations we've measured" — seeded from Combine + published survey data, methodology labeled), and **a quarterly "Season Wrapped"** recap card (recurring share moment, not just install day).
**Upgrade 2 — the roast lever.** Roast-format AI cards are a proven 2025–26 share mechanic ([#AIRoastMe / roastedby.ai genre](https://www.claila.com/blog/roast-ai)) and trash talk is native to our sports brand. `roster receipt --roast` adds one brutal line ("187 tools and your agent still couldn't schedule a meeting. Bold roster construction."). Opt-in flag, tasteful default — the meme lever exists for those who pull it.
**Upgrade 3 — proof on their machine, not ours (`roster bench`).** The free-audit genre converts because the value lands before the ask (Lighthouse's whole model; [Trivy at 32K+ stars](https://www.aikido.dev/blog/top-code-vulnerability-scanners); Snyk's dev-first freemium). We extend it from *audit* to *self-run proof*: a 60-second command that runs three sample tasks through raw-config vs Roster on the user's own machine and prints the diff — tokens, latency, selection hit-rate. "Don't trust our benchmark. Run yours." Kills skepticism and produces a second shareable artifact.
**Upgrade 4 — founding scarcity, both audiences.** Wrapped runs on scarcity; Product Hunt runs on early-adopter status. Ours: **Founding Roster** flair (permanent Season One mark, local-first, shown publicly only if they ever opt in) for installs before season one closes — and for the *other* install audience nobody was counting: **server authors**, who get `roster combine self` ("test your server exactly like the League does") plus a **Day One Franchise** mark for claiming their profile pre-launch. Authors are installers too — and they arrive with distribution.

**Post-review verdict:** the original hook (receipt → utility → reversibility) was solid but *numbers-only*; numbers inform, identity spreads. With archetypes, percentile, roast, self-run proof, and founding scarcity layered on per the priority tiering below — the P0 numbers-receipt carries launch; the identity layers arrive as P2/P3 add-ons — and with segment-honest messaging for Claude Code, the install story fires across every documented mechanism as those tiers ship: loss aversion (the waste number), curiosity (what's my archetype?), identity & comparison (Wrapped's engines), humor (roast), evidence (bench), status & FOMO (founding marks), and zero risk (transparent mode + eject). The hook-health metrics in §16 make this measurable rather than hoped-for.

> **Priority note (owner decision, 2026-07-03):** the four upgrades above are **nice-to-have add-ons, not primary scope**. The primary hook remains the numbers receipt + day-one utility + reversibility; the core product remains router + Coach + Combine/League + the install path. Tiering (mirrored in the build handoff §4/§13): **P1** `combine self` (nearly free, load-bearing for author adoption) · **P2, when idle** archetypes, Founding Roster/Day One Franchise flags · **P3, post-launch** `--roast`, `roster bench`, `roster wrapped`, percentile line (gated on real baseline data). None of these may consume pre-launch runway.

---

## 8. Validation log & adversarial review

### Directly verified by me on 2026-07-03 (no subagents)

| Check | Verdict |
|---|---|
| npm `roster` / `starting-five` | **Both 404 — available** |
| "Roster" dev/AI collisions | **None found** in search (only Netflix's NBA docuseries "Starting 5" — different market; do formal TM/domain check before shipping) |
| OpenClaw MCP support | **Confirmed native** — `mcpServers` config, stdio + HTTP/SSE, plus `mcporter` skill ([docs](https://docs.openclaw.ai/cli/mcp)); open feature request [#29053](https://github.com/openclaw/openclaw/issues/29053) confirms appetite. Drop-in story: "replace 20 entries with 1" |
| Claude Code native tool search | **Confirmed** — announced Jan 14, 2026 (Thariq Shihipar), default-on ≥2.1.7, 10%-of-context auto-defer threshold, ~77K → 8.7K tokens ([tessl](https://tessl.io/blog/anthropic-brings-mcp-tool-search-to-claude-code/), [docs](https://code.claude.com/docs/en/agent-sdk/tool-search)) |
| ToolRoute reality | **Confirmed & upgraded** — it does outcome-updated scoring (weighted scorecard), 132 blind A/Bs, v0.2.1 Mar 28 2026, 432 commits… 1 star, no public leaderboard ([repo](https://github.com/grossiweb/ToolRoute)) |
| OATS paper | **Confirmed exactly as cited** — title, authors, method, NDCG 0.869→0.940 / 0.834→0.848, offline, no serving overhead ([arXiv](https://arxiv.org/abs/2603.13426)) |
| MCP spec date & proxy-friendliness | **Confirmed** — final ships July 28, 2026; routing headers explicitly for gateways; "plain round-robin load balancer" quote ([RC post](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)) |

### Final adversarial sweep (same day, second pass — deep search, no subagents)

| Check | Verdict |
|---|---|
| Any live/continuous tool-quality leaderboard anywhere? | **Claim narrowed, survives:** found MCPMark's *static* server board (3 categories, stale since Nov 2025) and Digital Applied's *anonymized* one-off (Apr 2026, rerun due Oct 2026). No continuous, named, live-traffic league exists. §5.4/§6 updated |
| Do observability products publish public quality data? | **No** — mcpevals (private CI evals), MCPcat (owner analytics), Snyk Agent Scan (local-only, bulk API scanning forbidden). White space holds |
| New funded competitors (YC W26/S26)? | None found doing tool routing; Klavis Strata (YC, progressive-discovery router) added to §5.2 — no learning, no public data, and its MCPMark wins prove the "official ≠ best" drama thesis |
| Is the Combine feasible solo? | **Empirically yes** — a small team already probed 100 live endpoints / 60K calls; they left the named+continuous version unclaimed |
| Beachhead still hot? | Hotter: OpenClaw at 378K stars / 3.2M MAU / mobile launch Jun 30 |
| Legal exposure for naming servers in benchmarks? | Real but manageable — DeWitt-clause risk added to §13 with mitigations; MCPMark publishing named scores is live precedent |
| Better build resources than planned? | Added: FastMCP proxy scaffold, Snyk config-auto-discovery precedent, OTel SLO conventions (§15) |
| Name residuals | GitHub org `roster` taken (dormant Dutch entity) → use `starting-five`; npm + .dev clear |

### Adversarial design review (hard questions → design answers)

1. **"The router can't see the prompt — how does it know what to serve?"** Meta-tool flow (`draft`), the pattern used by Smithery Toolbox, Docker `mcp-find`, Composio sessions, and Claude's own MCPSearch. One extra round-trip on intent change, amortized by sticky rosters + spec-blessed caching.
2. **"Success labels are noisy — you'll rank tools on garbage."** Layered signal stack (§7.2); *tool error rate* separated from *task failure*; Lab-vs-Street separation keeps the controlled and observational claims distinct; MCP-Atlas's 63.3%-cognitive-failure finding is designed around, not ignored.
3. **"Non-random routing biases the leaderboard."** Correct — which is why the Lab (randomized, identical tasks) is the backbone of quality claims and the Street is labeled observational. Same reason LMArena (controlled votes) and OpenRouter (usage) coexist — we ship both genres in one site.
4. **"Probing 200 servers is expensive/rude."** Read-only probes for live servers; sandboxed self-hosted instances for write suites (MCPMark approach); the harness is OSS so authors self-test; probe cadence weekly, not continuous, per server.
5. **"What if Anthropic ships outcome learning?"** They'd see Claude-only traffic and would never run a cross-ecosystem public league. Neutrality + cross-client dataset + the league brand is the durable position (OpenRouter's playbook against every LLM vendor).
6. **"ToolRoute already exists."** 432 commits, 1 star. The idea is necessary but nowhere near sufficient — the launch plan (§10) *is* the differentiation. Cite them graciously; speed and spectacle win.
7. **"Won't badge incentives get gamed?"** Wilson bounds (small-n humility), install-diversity minimums, anomaly detection, Lab-vs-Street cross-checks (Street numbers wildly above Lab = flag), versioned open methodology ([LMArena's trust erosion](https://www.trendingtopics.eu/lmarena-is-a-cancer-how-llm-rankings-distort-the-ai-sector/) is the cautionary tale), and zero tolerance for star-gaming ([6M fake stars are already an academic subject](https://arxiv.org/html/2412.13459v2)).
8. **"Five tools can't cover a long multi-step task."** Substitutions: per-step re-drafting is cheap (embedding search, ms-scale). K is configurable; 5 is the default and the brand.

---

## 9. Virality playbook (evidence-mapped)

Every mechanic below is tied to a 2026 case study, ranked by evidenced shareability:

| Rank | Format | Evidence | Roster artifact |
|---|---|---|---|
| 1 | **Exposé with one damning ratio** | Koi Security's "341 of 2,857 skills malicious" — months of syndication ([THN](https://thehackernews.com/2026/02/researchers-find-341-malicious-clawhub.html)); rolling MCP-exposure scans as recurring news (Censys/Bitsight/Trend Micro); the genre already worked for MCP reliability specifically (anonymized Apr 2026 study: "median server passes 71%") | Launch report: "We crash-tested the top 200 MCP servers. X% failed basic calls." — **with names and a permanent standings page**, which is exactly what the existing one-off, anonymized study declined to do |
| 2 | **Leaderboard deltas & upsets** | OpenRouter rankings cited as market data exactly when share *shifts* ([61% headline](https://dataconomy.com/2026/02/25/chinese-ai-models-hit-61-market-share-on-openrouter/)); Arena raised **$150M at $1.7B** (Jan 2026) ([guide](https://uper.pl/en/blog/arena-ai-llm-leaderboard-guide-2026/)); Agent Arena logged 1,004,092 sessions by Jun 29 ([leaderboard](https://arena.ai/leaderboard/agent)) | Weekly box scores built around movement: benchings, streaks, upsets |
| 3 | **Before/after receipts** | Anthropic's "85% token cut" spawned derivative virals for ~6 months ([validation thread](https://github.com/orgs/modelcontextprotocol/discussions/629), [Hermes shipping it](https://www.marktechpost.com/2026/05/29/hermes-agent-ships-tool-search-for-mcp-anthropic-evals-show-49-to-74-accuracy-gain-on-opus-4/)) | Per-session box score: tokens saved, calls succeeded, cost avoided — one shareable card |
| 4 | **Watchable agents** | OpenClaw: 100K stars in 48h came from *watching it work* in Discord, not announcements ([Fast Company](https://www.fastcompany.com/91550800/how-peter-steinberger-built-openclaw)) | Live routing/benching feed; livestreamed Combine runs |
| 5 | Learning-curve updates | Only work welded to demos | Coach accuracy chart inside weekly box scores |

**Launch-day package** (correlates of Show HN/X hits — one-line install + watchable demo + one hard number in the title; median Show HN is 2 points, 50 = top 6% ([Syften](https://syften.com/blog/hacker-news-marketing/))):
- `npx roster init` → auto-imports every client's config, prints the Day-0 receipt, `roster sync` — working across Claude Code, Codex, Cursor, OpenClaw, and Hermes in under 60 seconds, reversible with `roster eject`.
- One-click "Add to Cursor" / "Add to VS Code" deeplink badges at the top of the README; Claude Code plugin-marketplace listing live on day one.
- The GIF: context meter 143K → ~4K, task succeeds, Sixth Man saves a failed call.
- Title carries the crash-test ratio; the copy line is "replace twenty config entries with one."

**Channels (evidence-based):** X-first ignition — all 2026 breakout repos traveled X/Discord/HN ([500-company study: X = 5× brand awareness; LinkedIn = 3× enterprise leads](https://blog.mean.ceo/linkedin-vs-x-for-startups/)). LinkedIn as weekly repackaging: **PDF carousels at 6.6% engagement** (top format; external links −60% reach) ([Feb 2026 algorithm analysis](https://www.dataslayer.ai/blog/linkedin-algorithm-february-2026-whats-working-now)). X mechanics: profile clicks weighted 12× ([analysis](https://posteverywhere.ai/blog/how-to-get-more-x-followers)).

**Anti-patterns engineered against:** AI-slop launches get unmasked and destroyed ([283-point Show HN imploded over a deleted marketing.md](https://news.ycombinator.com/item?id=48146369)); opt-out telemetry backlash (GitHub CLI, Apr 2026); methodology opacity (LMArena drama); bought stars ([ICSE 2026: 6M fake stars, $0.03 each](https://arxiv.org/html/2412.13459v2)); unvetted listings (ClawHavoc).

---

## 10. Go-to-market: the 25-day launch plan

**Beachhead: OpenClaw** — 176,458-member Discord ([invite](https://discord.com/invite/clawd)), typical setups run 26 tools + 53 skills ([tutorial evidence](https://yu-wenhao.com/en/blog/openclaw-tools-skills-tutorial/)), live routing feature requests (#15717, #29053), **no first-party router**, and native MCP support makes Roster a one-line drop-in. Freshness re-verified 2026-07-03 — the beachhead got *bigger* since the first research pass: **378K GitHub stars, 3.2M monthly active users, 38M monthly site visits**, mobile apps launched June 30, mainstream coverage the week of launch planning ([Forbes, Jul 1](https://www.forbes.com/sites/johnwerner/2026/07/01/openclaw-matures-amid-swarm-culture/), [stats](https://www.getpanto.ai/blog/openclaw-ai-platform-statistics)) — with security still its bleeding wound, which our Trust column speaks to directly. **Update (2026-07-04):** with The Playbook in v1, the red team's beachhead objection dissolves — OpenClaw's #1 pain (skills bloat, not tools) is now directly addressed through their own shipped allowlist mechanism, so the beachhead is dual: **OpenClaw** (skills + tools) **and Cursor/Codex** (tool search where none exists natively). Then: r/mcp (~89K members), MCP Discord (~13.1K), registry/PulseMCP/Smithery listings, then Show HN.

| Dates | Milestone |
|---|---|
| **Jul 6–12** | Proxy core (aggregate, index, `draft`/`call`, outcome log) + `init` wizard (config auto-import for all 8+ client formats) + **Day-0 receipt** + `sync`/`eject` + Combine harness v0 (read-only suites, 3 categories). Build in public from day one: daily X thread, live Discord dev sessions (the Steinberger lesson: demos > announcements) — and the receipt gives every early tester something to post immediately |
| **Jul 13–19** | League site (Lab table + box-score generator) + run the Combine against top ~200 servers (by Smithery/PulseMCP usage) + OpenClaw integration polish + Sixth Man failover |
| **Jul 20–27** | Dry-run content; recruit 5–10 OpenClaw power users as day-one testimonials; draft the exposé; pre-brief 2–3 newsletter/security writers (the scan-story genre has a proven press lane) |
| **Jul 28 — SPEC DAY** | Ship everything at once into the ecosystem's biggest news cycle of the year: exposé + OSS repo + live League + "built for the 2026-07-28 spec from hour one" |
| **Every Monday after** | Auto-generated box scores (X thread + LinkedIn carousel); Benched-list drama as it happens; monthly "State of the Toolverse" |

---

## 11. Business model

Per project goals: **monetization optional; distribution first.** The league is distribution, never revenue (PulseMCP publishes stats free — don't fight free with a paywall).

| Wedge | Evidence | Timing |
|---|---|---|
| **OSS local router** | Free forever — the flywheel's engine | Day 1 |
| **Hosted router** (auth/secrets/teams) | The proven wedge at indie ACV: Composio **$29/$229/mo** ([pricing](https://composio.dev/pricing)), Arcade Growth $25/mo ([pricing](https://www.arcade.dev/blog/pricing-updates/)); OpenRouter proves neutral-aggregator take-rates scale — 5.5% fee, **$113M Series B at ~$1.3B, 8M users** ([FAQ](https://openrouter.ai/docs/faq)) | Post-traction |
| **Enterprise drift/security alerts** | Strongest WTP evidence: Obot $35M seed, ~$40M+ into MCP security/governance, Microsoft Agent 365 at **$15/user/mo** (GA May 1, 2026) | Later; sales-led |
| **Certified Server program** | Microsoft already runs [MCP certification](https://learn.microsoft.com/en-us/microsoft-agent-365/mcp-certification); Docker Verified Publisher precedent (pricing undisclosed) | Only after league credibility is unimpeachable |

---

## 12. Moat analysis

1. **Neutrality** — Composio sells the catalog it would rank (fox/henhouse); every platform vendor is single-ecosystem. Switzerland won for OpenRouter; it's structurally available here.
2. **The outcome dataset compounds** — cross-client, cross-model outcome telemetry accrues to whoever aggregates it first; it cannot be bought retroactively.
3. **The league brand** — rankings authority is winner-take-most (LMArena for models, OpenRouter for usage). First credible outcome-quality board for tools sets the default citation.
4. **Local-first trust** — OSS + on-device learning + opt-in telemetry is a position the funded, cloud-first competitors can't cheaply copy without cannibalizing themselves.
5. **The metaphor** — a coherent, infinitely memeable content universe (Appendix A) that turns infrastructure telemetry into culture. Nobody else in this market has a *voice*.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Platforms absorb more of the utility layer | Already happened once (Claude Code, Jan 2026) — the product is learning + neutrality + league, not raw context savings; revisit positioning quarterly |
| League credibility attacked | Open methodology, versioned; bootstrap CIs; Lab/Street separation; publish the probe harness; respond to every methodology critique in public |
| Gaming once badges matter | Wilson bounds, install-diversity minimums, anomaly detection, Lab-vs-Street cross-flagging |
| Telemetry backlash | Go-model local-first opt-in (§7.4); announce before shipping |
| Solo-dev grind | Box scores fully automated from day 1; Combine containerized; scope discipline (K=5 core, no marketplace, no auth brokering in v1) |
| **Velocity-induced re-creep** — agentic development makes every cut feel restorable in a weekend, producing the worst failure mode for a measurement product: *everything exists, half unvalidated* | Owner-endorsed law (2026-07-04): amend the docs BEFORE unleashing build agents (they faithfully implement spec bugs — a wrong spec ships wrong software faster); the no-restore list in `ROSTER-STATE-AND-DECISIONS.md` §4.3 is locked; releases gate on **"validated-only ships"** |
| ToolRoute or a funded player wakes up | Ship in 25 days; the spec-day window and the league land-grab are the answer; graciously cite prior art to own the narrative |
| Probe costs/ToS friction | Read-only live probes; sandboxed write suites; weekly cadence; authors self-run the OSS harness |
| Name/trademark surprise | Final name **Roster** (2026-07-04); full Roster-family clearance sweep pending in D8 — `roster` is a common word (npm may be contested; fallbacks `rosterhq`/`getroster`/`roster-mcp`; CLI binary stays `roster`). Prior 2026-07-03 clearance applied to the former name only |
| **DeWitt-style benchmark clauses** — some hosted-server ToS prohibit publishing named benchmark results ([history](https://danluu.com/anon-benchmark/), [explainer](https://cube.dev/blog/dewitt-clause-or-can-you-benchmark-a-database)) | Precedent on our side: MCPMark already publishes named hosted-server scores publicly; mitigations: prefer self-hosted OSS instances (most of the catalog), per-ToS review for hosted first-party servers, published methodology + vendor right-of-reply section, and the [DeWitt-embrace framing](https://www.databricks.com/blog/2021/11/08/eliminating-the-dewitt-clause-for-database-benchmarking.html) — vendors increasingly drop these clauses under transparency pressure |

---

## 14. Naming

**"Loadout" is dead** (original working name). Kill-check found: Aaron Francis building "Loadout" — a desktop AI-tool/MCP config manager ([faster.dev/projects/loadout](https://faster.dev/projects/loadout)); **LoadoutHQ** — an MCP-native private skills registry in design-partner phase ([loadouthq.dev](https://www.loadouthq.dev/)); YETI's LOADOUT trademark covering downloadable software ([USPTO SN 97447385](https://trademarks.justia.com/974/47/loadout-97447385.html)); ~6 small agent-skill managers on GitHub. Also checked and rejected: PatchBay (music-biz agentic platform, [launched Mar 31, 2026](https://www.billboard.com/pro/patchbay-agentic-ai-platform-music-biz-public-launch/)), Switchboard (crowded), Dialtone (usedialtone.com agent orchestration + Dialpad's design system).

**Final name — ROSTER** (owner decision, 2026-07-04). Dead simple, instantly understood, CLI-perfect (`roster add`, `roster sync`), and it unlocks the transaction-wire drama format ("🚨 ROSTER MOVE: …") — a proven viral genre. The lowercase phrase "the starting five" survives as the *feature term* for the ≤5 tools served into context (Appendix A). Naming history: "Loadout" died in clearance (above); the interim two-word basketball name (styled **StartingFive**) passed npm/GitHub checks on 2026-07-03 but was superseded by Roster for punch and cleanliness. **Important: all prior clearance applied to the former name only — the Roster-family sweep is still pending (part of D8):** npm `roster` is a common word and may be contested (fallback package names: `rosterhq`, `getroster`, `roster-mcp` — the CLI binary stays `roster` regardless); GitHub org; domains (roster.dev likely taken; getroster.dev / roster.tools as candidates); @rosterhq-style X handle; USPTO class 9/42. **Do not register anything without the owner's approval.**

---

## 15. MVP build plan

**Stack (suggested):** TypeScript. Proxy: Node + official MCP SDK (spec 2026-07-28 RC, stateless HTTP + stdio; beta SDKs shipped June 29). Retrieval per the progressive ladder (§7.2): SQLite FTS5 instantly, then local dense embeddings via transformers.js v4 (EmbeddingGemma-300M, first-run download; MiniLM-L6 low-RAM fallback) — no API dependency for routing. Store: SQLite (outcomes, ratings, roster cache). Combine: containerized runners (Docker) + per-task verification scripts (MCPMark-style). League site: Next.js + static box-score generation. All MIT/Apache-2.0.

**Build accelerators (verified 2026-07-03):** [FastMCP (Python)](https://gofastmcp.com/servers/proxy) already ships multi-server proxy/mounting with automatic namespacing and component forwarding — a credible alternative scaffold or a fast prototype path (caveat: proxied components are mirrored/read-only, so our `draft`/`call` meta-layer stays custom either way). [Snyk Agent Scan](https://github.com/invariantlabs-ai/mcp-scan) (2.7K stars) is working precedent for the `init` wizard's config auto-discovery across Claude/Cursor/Windsurf — and a complementary integration (local security scan results feeding the Trust column). Telemetry/probe metric names follow [OpenTelemetry semantic conventions per the MCP SLO framework](https://www.digitalapplied.com/blog/mcp-server-reliability-metrics-slo-design-framework-2026).

**Repo layout:**
```
roster/
├─ packages/
│  ├─ router/        # MCP proxy: aggregate, index, draft/call, Sixth Man failover
│  ├─ coach/         # outcome log, success classifier, nightly OATS refinement
│  ├─ combine/       # probe harness: suites/, verifiers/, sandboxes/
│  ├─ league/        # rating math (wilson.ts, bt.ts), box-score generator
│  └─ badges/        # signed SVG shields service
│  └─ cli/           # init (auto-import + Day-0 receipt), sync, eject, dashboard, telemetry cmds
├─ apps/site/        # league tables (Lab/Street), live feed, methodology page
├─ suites/           # category task suites (github, browser, filesystem, search, db)
├─ configs/          # per-platform templates + deeplink badge generators (the context-mode lesson)
├─ docs/             # methodology.md (versioned), telemetry-schema.md, integrations/
└─ examples/         # claude-code/, codex/, openclaw/, hermes/, cursor/, gemini-cli/, langgraph/
```

**Build discipline (owner-endorsed law, 2026-07-04):** development is agentic and fast, which makes the *spec*, not the code, the safety-critical artifact. Docs are amended before agents build — never retrofitted after; the no-restore list (`ROSTER-STATE-AND-DECISIONS.md` §4.3) is locked regardless of how cheap restoration looks; nothing ships unvalidated. The planning unit is founder-verification hours, not code hours — and anything an agent built that no human verified is not an asset on launch day, it is the exhibit.

**Milestones:** M0 (weekend): router core routes 3 real servers end-to-end with outcome logging. M1 (Jul 12): Combine v0, 3 categories, 30 servers. M2 (Jul 19): league site live internally; box-score generator; OpenClaw example; Sixth Man. M3 (Jul 27): 200-server Combine run complete; exposé written; methodology.md v1.0 published. **M4 (Jul 28): launch.**

**Definition of done for v1:** a stranger replaces N `mcpServers` entries with one, sees ≥80% context reduction on a 50+ tool setup, watches one Sixth Man save, and can find their favorite server on the League with an honest, explained score.

## 16. Success metrics

- **Adoption & stickiness (the gating metrics):** time-to-value < 60 seconds from `npx` to Day-0 receipt; install completion rate of the `init` wizard; clients-detected-per-install (agnosticism proof); D7/D30 retention of active routers; `eject` rate (target: low, but publicly reported — trust artifact); receipts generated and voluntarily shared.
- **Hook health (§7.7):** receipt→share rate, `--roast` usage, `roster bench` run rate, archetype distribution (are the cards fun enough to differ?), Founding Roster claims, `combine self` runs by server authors. If receipt-share is near zero in week one, the identity layer isn't landing — iterate the cards, not the router. (Per the §7.7 tiering, roast/bench/archetype metrics activate only when those P2/P3 items ship; at launch, hook health = receipt→share rate + `combine self` runs.)
- **Utility:** installs, weekly-active routers, median context reduction (target: >80% on 50+ tool setups — Anthropic's 85% is the benchmark), Sixth Man saves/week, drift alarms delivered.
- **Learning:** local routing NDCG vs. static baseline (target: reproduce OATS's ~+0.07); published accuracy curve slope.
- **League:** servers listed (200 at launch), server authors who self-run the Combine, badges embedded in third-party READMEs (the truest distribution metric), external citations of the League ("per Roster rankings…").
- **Content engine:** box scores auto-published without manual work; weekly impressions; the ratio of content generated by the system vs. written by hand (target: >80% automated).
- **Community:** OpenClaw/Discord adoption anecdotes, GitHub stars (vanity, but the market's sourcing signal — Redpoint's seed median is 2,850).

## 17. Ideas folded in (the roads not taken)

The ideation round produced four concepts; three became features of the fourth:
- **CrashTest** ("NCAP for MCP servers") → became **The Combine** + the launch exposé.
- **Bouncer** (security router) → became the Trust column, poisoning scans, drift quarantine (§7.5).
- **Polyglot** (skill-vs-tool-vs-code-mode arbitration) → **partially pulled into v1** (owner decision 2026-07-04): skills *indexing, serving, and ranking* now ship at launch as The Playbook (§7.1, handoff §6.7) — one unified capability index across tools and skills, which is exactly the "Skills+MCP unification layer" research flagged as unfilled, and a direct answer to the ["MCP is dead vs Skills" flamewar](https://medium.com/@alonisser/mcp-is-dead-or-mcp-vs-skills-revisited-daaa51b9a519) (Roster's answer: use both, ranked). What remains v2: cost-optimal *arbitration* — deciding per-task whether a skill, a tool call, or code execution is the cheapest capable modality.

## 18. Open questions

1. Formal name clearance: domains (roster.dev/.tools), USPTO class 9/42 search, @roster on X.
2. Combine sandbox costs at 200 servers × weekly cadence — budget and prune.
3. Telemetry schema v1: exact intent-category taxonomy (start with ~12 categories mirroring League divisions).
4. ~~Transparent vs meta-tools~~ **Decided:** ship both — transparent passthrough is the *default* (progressive trust ladder, §7.6); `--five` routing mode is one flag away. Remaining sub-question: per-client quirks in schema injection for clients without `tool_reference` support.
5. OpenClaw skills ranking (ClawHub) at launch or fast-follow — huge community pull, but ClawHavoc makes safety-scanning table stakes first.
6. Hosted tier timing — only after the OSS flywheel proves itself (per project goals, may never be needed).

---

## Appendix A: The metaphor dictionary

The entire product speaks one language. This is the virality substrate — infrastructure telemetry rendered as sports culture:

| Term | Product meaning |
|---|---|
| **The starting five** (feature term, lowercase) | The ≤5 tools served into context for the current task — Roster's namesake mechanic |
| **The Rotation** | The aggregating router itself |
| **The Coach** | The local outcome-learning engine |
| **The League** | The public rankings (Lab + Street tables) |
| **The Combine** | The standardized probe suite every server runs before/after listing |
| **Draft (verb)** | The `draft(need)` meta-tool call that picks the five |
| **Draft Day** | New server onboarding + first Combine run |
| **Substitution** | Mid-task re-draft when intent shifts |
| **The Sixth Man** | Automatic failover to the next-ranked equivalent tool on a starter's failure |
| **Benched** | Demoted from default rosters (performance or drift quarantine) |
| **Box score** | The per-session and weekly stats artifact (tokens saved, success rate, saves) |
| **All-Star team** | Per-category champions |
| **Rookie of the Year** | Best new server this season |
| **Season** | Quarterly rating epochs (methodology-versioned resets) |
| **Scouting report** | A server's full League profile (Lab scores, Street stats, Trust, drift history) |

## Appendix B: Full source library

### Papers & benchmarks
- OATS — outcome-aware tool selection (Mar 13, 2026): https://arxiv.org/abs/2603.13426 · [HTML](https://arxiv.org/html/2603.13426)
- MCP-Atlas (Scale; 1,000 tasks, 36 servers, 11-category failure taxonomy, 63.3% cognitive failures): https://arxiv.org/abs/2602.00933 · [leaderboard](https://labs.scale.com/leaderboard/mcp_atlas)
- MCPMark (127 CRUD tasks, programmatic state verification): https://arxiv.org/abs/2509.24002 · https://mcpmark.ai/
- ToolRM — outcome reward models for tool calls: https://arxiv.org/abs/2509.11963 · pairwise variant: https://arxiv.org/abs/2510.26167
- ToolWeaver: https://arxiv.org/pdf/2601.21947 · UniToolCall: https://arxiv.org/pdf/2604.11557
- Fake-stars study (ICSE 2026; 6M fake stars): https://arxiv.org/html/2412.13459v2
- Red Hat "Tool RAG": https://next.redhat.com/2025/11/26/tool-rag-the-next-breakthrough-in-scalable-ai-agents/
- Ranking math: Wilson lower bound — https://www.evanmiller.org/how-not-to-sort-by-average-rating.html · Arena-Rank — https://github.com/lmarena/arena-rank · https://arena.ai/blog/arena-rank/ · LMSYS Elo origins — https://www.lmsys.org/blog/2023-12-07-leaderboard/ · Lichess puzzle ratings — https://lichess.org/faq

### Specs & platform docs
- MCP 2026-07-28 RC (routing headers, stateless core): https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- MCP tools spec (isError): https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- Enterprise-Managed Auth (Jun 18, 2026): https://blog.modelcontextprotocol.io/posts/enterprise-managed-auth/
- MCP Registry: https://github.com/modelcontextprotocol/registry · https://modelcontextprotocol.io/registry/about
- Anthropic advanced tool use (85% cut, 49→74%): https://www.anthropic.com/engineering/advanced-tool-use · Tool Search Tool docs (third-party search via tool_reference): https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool · Claude Code tool search docs: https://code.claude.com/docs/en/agent-sdk/tool-search · analysis: https://tessl.io/blog/anthropic-brings-mcp-tool-search-to-claude-code/
- OpenAI hosted MCP / connectors: https://developers.openai.com/api/docs/guides/tools-connectors-mcp · https://openai.github.io/openai-agents-python/mcp/ · AgentKit: https://openai.com/index/introducing-agentkit/
- Google: https://ai.google.dev/gemini-api/docs/function-calling · Gemini Enterprise MCP GA: https://cloud.google.com/blog/products/ai-machine-learning/gemini-enterprise-agent-platform-remote-mcp-server/
- OpenClaw MCP: https://docs.openclaw.ai/cli/mcp · feature requests: https://github.com/openclaw/openclaw/issues/29053 · https://github.com/openclaw/openclaw/issues/15717

### Competitors & adjacent products
- Composio: https://docs.composio.dev/tool-router/overview · https://docs.composio.dev/docs/migration-guide/tool-router-beta · https://composio.dev/pricing · https://composio.dev/blog/series-a · https://composio.dev/blog/introducing-tool-router-(beta)
- ToolHive/Stacklok: https://github.com/stacklok/toolhive · https://docs.stacklok.com/toolhive/guides-vmcp/optimizer · https://docs.stacklok.com/toolhive/updates/2026/03/09/updates · https://stacklok.com/blog/cut-token-waste-from-your-ai-workflow-with-the-toolhive-mcp-optimizer/
- Docker Dynamic MCP: https://www.docker.com/blog/dynamic-mcps-stop-hardcoding-your-agents-world/ · https://docs.docker.com/ai/mcp-catalog-and-toolkit/dynamic-mcp/
- Smithery: https://smithery.ai/ · https://smithery.ai/leaderboard · Toolbox origin: https://x.com/Calclavia/status/1911638656345153559
- ToolRoute (closest premise, 1★): https://github.com/grossiweb/ToolRoute · Agent402: https://github.com/MikeyPetrillo/Agent402
- Others: https://www.apigene.ai/mcp-gateway · https://github.com/maximhq/bifrost · https://obot.ai/ · https://www.mintmcp.com/pricing · https://github.com/metatool-ai/metamcp · https://github.com/IBM/mcp-context-forge · https://github.com/microsoft/mcp-gateway · https://github.com/lasso-security/mcp-gateway · https://github.com/sparfenyuk/mcp-proxy · https://github.com/mcp-use/mcp-use · https://github.com/langchain-ai/langgraph-bigtool · https://www.arcade.dev/
- Rankings today: https://glama.ai/mcp/methodology · https://mcp.so/ranking · https://www.pulsemcp.com/statistics · gateway listicles: https://obot.ai/blog/the-13-best-mcp-gateways-for-enterprise-teams/ · https://www.truefoundry.com/blog/best-mcp-gateways · Q1 2026 aggregator survey: https://www.heyitworks.tech/blog/mcp-aggregation-gateway-proxy-tools-q1-2026

### Problem evidence & demand
- 72% context stat: https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget
- 43%→13.6% accuracy: https://writer.com/engineering/rag-mcp/ · Copilot 40→13 tools: https://thenewstack.io/how-to-reduce-mcp-token-bloat/
- Context-window problem: https://www.junia.ai/blog/mcp-context-window-problem · tool-calling failures: https://labs.adaline.ai/p/ai-agent-tool-calling-failures · MCP overload: https://eclipsesource.com/blogs/2026/01/22/mcp-context-overload/
- HN threads: https://news.ycombinator.com/item?id=45947444 · https://news.ycombinator.com/item?id=45954572 · "MCP is dead / Skills" debate: https://medium.com/@alonisser/mcp-is-dead-or-mcp-vs-skills-revisited-daaa51b9a519
- Claude Code tool-search request (closed=shipped): https://github.com/anthropics/claude-code/issues/12836 · follow-on: https://github.com/anthropics/claude-code/issues/18298
- Adoption stats: https://www.digitalapplied.com/blog/mcp-ecosystem-h1-2026-retrospective-adoption-data-points · https://mcpmanager.ai/blog/mcp-adoption-statistics/ · popular servers: https://toolradar.com/guides/best-mcp-servers · https://mcpmanager.ai/blog/most-popular-mcp-servers/
- Communities: OpenClaw Discord (176K): https://discord.com/invite/clawd · r/mcp (~89K): https://gummysearch.com/r/mcp/ · MCP Discord (~13.1K): https://discord.com/invite/model-context-protocol-1312302100125843476 · OpenClaw setup norms: https://yu-wenhao.com/en/blog/openclaw-tools-skills-tutorial/

### Security (the Trust column's evidence base)
- Microsoft poisoned-descriptions warning (Jun 2026): https://thehackernews.com/2026/06/microsoft-warns-poisoned-mcp-tool.html
- CSA "MCP Security Crisis" (May 4, 2026): https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-security-crisis-20260504-csa-styled/
- ClawHavoc: https://unit42.paloaltonetworks.com/openclaw-ai-supply-chain-risk/ · https://www.termdock.com/en/blog/clawhub-malicious-skills-incident · tracking repo: https://github.com/joylarkin/openclaw-security-news · Koi 341/2,857: https://thehackernews.com/2026/02/researchers-find-341-malicious-clawhub.html
- Exposure scans: https://censys.com/blog/mcp-servers-on-the-internet/ · https://www.bitsight.com/blog/exposed-mcp-servers-reveal-new-ai-vulnerabilities · https://www.theregister.com/2026/04/16/anthropic_mcp_design_flaw/ · https://www.trendmicro.com/vinfo/us/security/news/vulnerabilities-and-exploits/update-on-exposed-mcp-servers-the-threat-widens-to-the-cloud · https://aembit.io/blog/the-ultimate-guide-to-mcp-security-vulnerabilities/ · 2026 incident roundup: https://blog.cyberdesserts.com/ai-agent-security-risks/
- MCP certification precedent: https://learn.microsoft.com/en-us/microsoft-agent-365/mcp-certification · Lasso×Portkey: https://portkey.ai/blog/securing-mcp-to-deliver-enterprise-grade-agentic-ai-protection/

### Virality case studies & channel data
- OpenClaw 100K stars/48h: https://www.fastcompany.com/91550800/how-peter-steinberger-built-openclaw · https://blog.bytebytego.com/p/top-ai-github-repositories-in-2026 · Lex Fridman #491: https://lexfridman.com/peter-steinberger-transcript/
- OpenHuman (PH sweep + trending streak): https://www.techtimes.com/articles/316731/20260516/agent-that-reads-you-first-openhuman-tops-github-trending-inverting-playbook.htm
- xAI algo drop (1,600★/6h): https://fireply.ai/blog/best-ai-tools-grow-x-2026 · Ableton MCP Show HN: https://news.ycombinator.com/item?id=47999656
- OpenRouter rankings as market data: https://dataconomy.com/2026/02/25/chinese-ai-models-hit-61-market-share-on-openrouter/ · https://www.globaltimes.cn/page/202604/1358300.shtml · https://pro.stockalarm.io/blog/openrouter-llm-rankings-investor-analysis · https://openrouter.ai/data · weekly-delta genre: https://macgpu.com/en/blog/2026-0606-openrouter-weekly-token-rankings-billing-truth.html · https://www.digitalapplied.com/blog/openrouter-rankings-april-2026-top-ai-models-data
- Arena $150M @ $1.7B: https://uper.pl/en/blog/arena-ai-llm-leaderboard-guide-2026/ · Agent Arena (1,004,092 sessions): https://arena.ai/leaderboard/agent
- Tool-search derivative virals: https://github.com/orgs/modelcontextprotocol/discussions/629 · https://www.marktechpost.com/2026/05/29/hermes-agent-ships-tool-search-for-mcp-anthropic-evals-show-49-to-74-accuracy-gain-on-opus-4/
- Badges: https://mcpbadge.dev/ · https://github.com/jamesmontemagno/mcp-badge-creator
- Channel data: LinkedIn algo (carousels 6.6%, links −60%): https://www.dataslayer.ai/blog/linkedin-algorithm-february-2026-whats-working-now · X algo (profile clicks 12×): https://posteverywhere.ai/blog/how-to-get-more-x-followers · X vs LinkedIn study: https://blog.mean.ceo/linkedin-vs-x-for-startups/ · Show HN stats: https://syften.com/blog/hacker-news-marketing/
- Anti-patterns: slop-launch implosion: https://news.ycombinator.com/item?id=48146369 · https://www.adriankrebs.ch/blog/design-slop/ · LMArena trust erosion: https://www.trendingtopics.eu/lmarena-is-a-cancer-how-llm-rankings-distort-the-ai-sector/ · gamed trending: https://aiforautomation.io/news/2026-05-13-ai-agents-github-trending-star-ranking-broken · AI-washing failures: https://ideaproof.io/failures/ai-startups · fake-star sourcing: https://www.startuphub.ai/ai-news/cybersecurity/2026/github-fake-stars-reputation-as-a-service
- Hook mechanics (§7.7): Wrapped analysis (archetypes, top-X%, 500M day-one shares): https://nogood.io/blog/spotify-wrapped-marketing-strategy/ · https://www.idomoo.com/blog/why-spotify-wrapped-works-and-how-you-can-do-it-too/ · https://www.binghamton.edu/news/story/5948/why-spotify-wrapped-goes-viral-every-year-binghamton-university-experts-weigh-in · roast-format genre: https://www.claila.com/blog/roast-ai · audit-first adoption: https://developer.chrome.com/docs/lighthouse/overview · https://www.aikido.dev/blog/top-code-vulnerability-scanners
- Telemetry norms: Go debate: https://github.com/golang/go/discussions/58409 · https://www.theregister.com/2023/02/10/googles_go_programming_language_telemetry_debate/ · reversal: https://www.theregister.com/2023/05/17/googles_go_data_collection/ · Go 1.23 local mode: https://devclass.com/2024/08/14/go-1-23-released-with-telemetry-uploaded-to-google-but-opt-in-after-developer-feedback/ · GitHub CLI backlash (Apr 22, 2026): https://www.theregister.com/2026/04/22/github_opts_all_cli_users/
- Success-detection guides: https://mcpcat.io/guides/error-handling-custom-mcp-servers/ · https://alpic.ai/blog/better-mcp-toolscall-error-responses-ai-recover-gracefully · https://www.mcpevals.io/blog/mcp-error-codes

### Client integration & adoption engineering
- Codex MCP (CLI + config.toml, `codex mcp add`): https://developers.openai.com/codex/mcp · https://developers.openai.com/codex/config-reference · guide: https://composio.dev/content/how-to-mcp-with-codex
- Hermes Agent MCP (`hermes mcp add`, config.yaml, presets, hot reload): https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp · https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference · https://github.com/nousresearch/hermes-agent · selective-tool-loading request: https://github.com/NousResearch/hermes-agent/issues/690
- Cursor one-click install deeplinks: https://cursor.com/docs/mcp/install-links · VS Code deeplink format + button generators: https://danywalls.com/create-one-click-mcp-installation-links-cursor-vscode · https://vscodemcp.com/ · https://github.com/merill/vscode-mcp-install-link-creator · MCP badges: https://mcpbadge.dev/
- Config-format fragmentation (the 8+ formats `init` auto-imports): https://mcpplaygroundonline.com/blog/complete-guide-mcp-config-files-claude-desktop-cursor-lovable · converter existence-proof: https://mcp.directory/tools/mcp-config-converter · cross-client install reference: https://github.com/Moh4696/50-essential-mcp-servers
- Adoption blueprint at scale (18 platforms, 18.5K stars — 2-command install, per-platform templates, `clientInfo.name` auto-detection): https://github.com/mksglu/context-mode
- Telemetry trust pattern adopted (§7.4): Go local-mode design — https://devclass.com/2024/08/14/go-1-23-released-with-telemetry-uploaded-to-google-but-opt-in-after-developer-feedback/

### Pricing & business comps
- Composio: https://composio.dev/pricing · Arcade: https://www.arcade.dev/blog/pricing-updates/ · MintMCP: https://www.mintmcp.com/pricing · Smithery: https://smithery.ai/pricing · Obot $35M: https://finance.yahoo.com/news/obot-ai-secures-35m-seed-120000083.html · Microsoft Agent 365 $15/seat: https://softwarestrategiesblog.com/2026/03/28/agentic-ai-security-startups-funding-mna-rsac-2026/ · OpenRouter fee/valuation: https://openrouter.ai/docs/faq · https://www.truefoundry.com/blog/openrouter-pricing · Docker Verified Publisher: https://docs.docker.com/trusted-content/dvp-program/ · ToolHive enterprise: https://docs.stacklok.com/toolhive/enterprise

### Final verification pass (2026-07-03, direct — second sweep)
- MCPMark server-implementation leaderboard (closest prior art; Klavis 31.5% vs GitHub official 16.3%): https://mcpmark.ai/leaderboard/mcp
- Digital Applied 100-server stress test (median 71%, anonymized, one-off, Oct 2026 rerun planned): https://www.digitalapplied.com/blog/mcp-server-reliability-100-server-stress-test-study · SLO/OTel framework: https://www.digitalapplied.com/blog/mcp-server-reliability-metrics-slo-design-framework-2026
- Private-only observability (no public data): https://www.mcpevals.io/ · https://mcpcat.io/ · Snyk Agent Scan: https://github.com/invariantlabs-ai/mcp-scan
- FastMCP proxy/composition (build accelerator): https://gofastmcp.com/servers/proxy
- DeWitt clause: https://danluu.com/anon-benchmark/ · https://cube.dev/blog/dewitt-clause-or-can-you-benchmark-a-database · https://www.databricks.com/blog/2021/11/08/eliminating-the-dewitt-clause-for-database-benchmarking.html · https://dwheeler.com/essays/dewitt-clause.html
- OpenClaw freshness (378K stars, 3.2M MAU): https://www.forbes.com/sites/johnwerner/2026/07/01/openclaw-matures-amid-swarm-culture/ · https://www.getpanto.ai/blog/openclaw-ai-platform-statistics · https://releasebot.io/updates/openclaw
- MCP 2026 roadmap (LF working groups): https://a2a-mcp.org/blog/mcp-2026-roadmap

### Coach method verification (2026-07-03, direct)
- ToolRet — generic IR models are weak at tool retrieval: https://arxiv.org/abs/2503.01763 · https://github.com/mangopy/benchmarking-tool-retrieval
- Document expansion boosts tool retrieval: https://arxiv.org/pdf/2510.22670 · ToolDreamer: https://arxiv.org/pdf/2510.19791 · Tool-to-Agent retrieval (+17.7% Recall@5, LiveMCPBench): https://arxiv.org/html/2511.01854v1 · multi-step retrieval via query planning: https://arxiv.org/pdf/2601.07782 · SING active tool discovery (Jun 2026): https://arxiv.org/pdf/2606.16591
- Bandit routing (exploration rationale): https://arxiv.org/pdf/2510.07429 · bandit algorithms overview lib: https://github.com/singhsidhukuldeep/contextual-bandits
- Embedding model picks: EmbeddingGemma-300M / Qwen3-0.6B / MiniLM comparisons: https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models · https://milvus.io/blog/choose-embedding-model-rag-2026.md
- Runtime & store: transformers.js v4 (Node WebGPU): https://huggingface.co/blog/transformersjs-v4 · sqlite-vec usage: https://dev.to/stephenc222/how-to-use-sqlite-vec-to-store-and-query-vector-embeddings-58mf
- Reranker CPU economics (P2 accuracy mode): https://localaimaster.com/blog/reranking-cross-encoders-guide · https://aimultiple.com/rerankers
- Second pass (build-time checks resolved): EmbeddingGemma ONNX for JS: https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX · https://huggingface.co/blog/embeddinggemma · https://developers.googleblog.com/introducing-embeddinggemma/ · in-browser demo: https://github.com/glaforge/embedding-gemma-semantic-search · Tool-Embed/Tool-Rank details (Qwen3-0.6B base; Tool-DE): https://www.emergentmind.com/topics/tool-de · https://arxiv.org/html/2510.22670 · sqlite-vec health (Mozilla-backed, v0.1.9 Mar 2026): https://github.com/asg017/sqlite-vec/releases · https://github.com/asg017/sqlite-vec/issues/226

### Architecture verification (2026-07-03, direct)
- list_changed client gap (validates draft/call robustness): https://www.pulsemcp.com/posts/mcp-client-capabilities-gap · https://forum.cursor.com/t/mcp-notifications-tools-list-changed-not-acted-on-mid-session/161459 · https://github.com/google-gemini/gemini-cli/issues/13850 · https://github.com/anthropics/claude-code/issues/31893
- Proxy as enforcement point: https://arxiv.org/pdf/2605.18414 · MCP Pitfall Lab (attack taxonomy → Combine suites): https://arxiv.org/pdf/2604.21477 · gateway sampling/elicitation pitfall in the wild: https://github.com/BerriAI/litellm/issues/23761
- Spec 07-28 changes explained (sampling deprecated SEP-2577, Multi Round-Trip SEP-2322): https://stacktr.ee/blog/mcp-2026-spec-changes · https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- Meta-tool threshold guidance & scale: https://micheallanham.substack.com/p/ai-agents-2026-the-tool-selection (177K tools) · https://www.anthropic.com/engineering/advanced-tool-use
- Hierarchical routing as scale-up path: https://arxiv.org/pdf/2402.04253 (AnyTool) · https://arxiv.org/html/2511.01854v1 (Tool-to-Agent)
- Failover-chain precedent (Sixth Man): https://openrouter.ai/docs/guides/routing/model-fallbacks
- Code-mode convergence (context for the v2 note in §17, no v1 action): https://www.anthropic.com/engineering/code-execution-with-mcp · https://blog.cloudflare.com/code-mode/

### Naming
- Loadout collisions: https://faster.dev/projects/loadout · https://www.loadouthq.dev/ · YETI TM: https://trademarks.justia.com/974/47/loadout-97447385.html · PatchBay: https://www.billboard.com/pro/patchbay-agentic-ai-platform-music-biz-public-launch/

---

*Document generated July 3, 2026, from five deep research passes (MCP ecosystem · competitive kill-check · virality mechanics · technical blueprint · demand & monetization) plus direct validation of all load-bearing claims. Methodology promise carried into the product: every number above has a link; anything unverifiable is marked or excluded.*
