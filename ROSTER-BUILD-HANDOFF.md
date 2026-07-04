# ROSTER — Build Handoff & Agent Brief

> **Purpose of this file:** a complete, self-contained handoff for a **fresh coding-agent session with zero prior context** to build Roster end-to-end. It contains the mission, the full v1 technical specification (architecture, schemas, algorithms, CLI UX, client matrix, probe harness, site, telemetry), milestones with acceptance criteria, working agreements, and — at the bottom — **the copy-paste agent prompt** that boots a new session into this project.
>
> **Companion file (the strategy/research master doc):** `ROSTER.md` (repo root — currently /Users/mo/Downloads/roster/) — read it FIRST. It holds the why, the market evidence, the virality playbook, the launch plan, and ~150 sourced links. This file holds the *how to build*.
>
> **Prepared:** July 3, 2026. All research verified as of this date. **Launch target: July 28, 2026 (MCP spec day).**

---

> **⚠️ VELOCITY DISCIPLINE (binding law — owner-endorsed 2026-07-04).** Agentic development makes code cheap and spec bugs fast: agents faithfully implement whatever is written here, so a wrong spec ships wrong software at 10× speed — and every cut scope-item will *feel* restorable in a weekend. That is the trap: for a measurement product, "everything exists, half unvalidated" is the worst failure mode. Three rules, no exceptions:
> 1. **Docs first.** Amend this handoff BEFORE building, never after. If reality contradicts the spec, stop, fix the doc, then code.
> 2. **The no-restore list is locked.** See `ROSTER-STATE-AND-DECISIONS.md` §4.3. Velocity is never a reason to restore a cut item.
> 3. **Validated-only ships.** Anything an agent built that no human verified is not an asset on launch day — it is the exhibit.
>
> **D5 CONSOLIDATION EXECUTED (2026-07-04).** This handoff is now authoritative for build; `ROSTER-STATE-AND-DECISIONS.md` remains the decision log and laws record. All owner decisions are encoded here: **single launch targeting July 28** (everything ready by then; owner chooses exact rollout), Combine stretch target ~100 servers (hard gate: only human-signed results feed named scores), **skills ("The Playbook") in v1 scope** (§6.7), Sixth Man **suggest-only**, ε-exploration **OFF by default**, praise-asymmetric league.

## 1. Mission brief

Build **Roster**: a neutral, open-source, local-first **tool router** for AI agents. One MCP endpoint fronts all of a user's MCP servers/tools; the agent gets the best ≤5 tools per task instead of 200 schemas in context. The router **learns from call outcomes** (nightly, on-device, OATS method), and its probe fleet + opt-in telemetry power a public **performance league** for AI tools (standings, benchings, box scores, README badges).

Three layers, one flywheel:
1. **The Rotation** (aggregating MCP proxy — the utility that earns the install),
2. **The Coach** (local outcome learning — the moat),
3. **The League** (public quality rankings — the distribution engine).

Success = a stranger runs one command, sees their own token waste in 60 seconds, swaps 20 config entries for 1, everything still works (but cheaper and more reliable), and the public League page is credible enough to screenshot.

## 2. Context capsule (what a zero-context agent must know)

**The problem (all sourced in master doc §4):** MCP tool schemas can consume 72% of a 200K context window before the first user query; tool-selection accuracy collapses from 43% to ~14% as toolsets grow; the median live MCP server passes only 71% of tasks (bottom decile: 38%). Anthropic proved search-based tool loading works (85% token cut, accuracy 49%→74%) — but only for Claude.

**The competitive facts that define our lane (master doc §5–6, kill-checked July 3, 2026):**
- Claude Code has native keyword tool search (default-on since Jan 14, 2026). OpenAI has static filtering. Gemini punts. So: **raw context savings alone is NOT the product** — cross-client neutrality + outcome learning + public data is.
- **No shipped product does outcome-learned tool routing** (Composio Tool Router GA = search-based, no learning; ToolHive optimizer = explicitly stateless; sole same-premise attempt ToolRoute has 1 star).
- **No continuous, named, live-traffic tool-quality league exists.** Closest prior art to cite graciously in all public content: MCPMark's *static* server leaderboard (3 categories, stale since Nov 2025 — and its data shows Klavis Strata beating GitHub's official server 31.5% vs 16.3%, proving "official ≠ best") and Digital Applied's *anonymized* one-off 100-server stress test (Apr 2026; they plan a 200-server rerun in **Oct 2026** — our window to own the named+continuous space).
- The **MCP spec finalizing July 28, 2026** explicitly blesses gateways: stateless core, `Mcp-Method`/`Mcp-Name` routing headers, `ttlMs` caching, resumption tokens.

**Adoption laws (non-negotiable, master doc §7.6):** agnostic across ALL MCP clients; <60s install; no account/API key/cloud; transparent passthrough by default (progressive trust: observe → route → learn → share); `eject` restores everything byte-for-byte; telemetry is local-first and opt-in (Go model); seven day-one utilities independent of the League.

**Name:** **ROSTER** (finalized by the owner 2026-07-04; interim name was the two-word basketball one, styled **StartingFive** — all prior npm/org clearance applied to that former name only). CLI binary: `roster`. The lowercase phrase "the starting five" survives only as the feature term for the ≤5 served tools. The **Roster-family clearance sweep is pending (D8)**: npm `roster` is a common word and may be contested (fallback package names `rosterhq`/`getroster`/`roster-mcp` — binary stays `roster` regardless), GitHub org, domains (getroster.dev / roster.tools candidates), @handle, USPTO. This sweep is a pre-launch human task — **do not register anything without the owner's approval.**

**Beachhead (updated 2026-07-04):** dual — **OpenClaw** (378K stars, 3.2M MAU; their #1 pain is *skills* bloat — ~70+52+25 skills injected into every system prompt — which Roster's Playbook now addresses directly via their shipped allowlist mechanism) **+ Cursor/Codex** (the exact MCP tool-bloat pain, zero native tool search). Then r/mcp, then Show HN on spec day. Product scope is universal by owner decision: MCP tools *and* SKILL.md skills, for every client (Claude Code, Codex, Gemini CLI, Cursor, OpenClaw, Hermes, VS Code…).

## 3. Required reading order (for the agent)

1. This file, fully.
2. `/Users/mo/Downloads/ROSTER.md` — at minimum §4 (problem receipts), §5–6 (competitive verdicts — these constrain public claims), §7 (product design, incl. 7.6 adoption), §9–10 (launch artifacts the code must produce), §13 (risks that shape engineering), Appendix B (sources).
3. Live docs before coding (versions move): MCP spec 2026-07-28 RC + SDK status (`blog.modelcontextprotocol.io`), official TypeScript SDK repo, Anthropic Tool Search Tool docs (tool_reference contract), OATS paper (arxiv.org/abs/2603.13426), FastMCP proxy docs (if Python path chosen).
4. If today's date is materially later than 2026-07-03: re-verify the §2 competitive facts before repeating them publicly.

## 4. v1 scope

**IN — P0 (core, launch-blocking):** router (stdio + localhost streamable HTTP; transparent + five modes; draft/call meta-tools; session roster cache; adaptive ~10K-token engagement rule), coach (outcome log, success classifier, nightly OATS job, Lab priors, FTS5→hybrid retrieval ladder, ε OFF), CLI (`init`/`serve`/`sync`/`eject`/`telemetry`/`receipt` — receipt is the *numbers* version, client-aware truthful per §6.3), **read-import for ALL 8+ config formats** (write/sync+eject for 4 clients), **The Playbook v0 (§6.7):** unified skills+tools index (full-body indexing) + universal skill-as-tool bridge + skills receipt line + skills Trust scan, Combine harness (sandboxed + readonly-live suites — every category we can honestly verify by Jul 28; stretch target ~100 servers, hard-gated on human-signed verifiers), League site (Lab standings, server+skill profiles, methodology with provenance flags, box-score generator, static badges), **weekly automated rerun CI live at launch**, opt-in telemetry scaffolding, provenance page ("built with agents, reviewed by hand" + security-core review log).

**IN — P1 (core-adjacent, in v1 if founder-hours hold):** Sixth Man **suggest-only** (§6.1), minimal `dashboard` (one boring read-only page), `combine self` (reuses the harness; load-bearing for author adoption), OpenClaw skills-allowlist writer + native-skills-dir sync (§6.7 L2/L3), central description expansion (shipped in priors), per-client examples + one-click deeplink badges, Windows CI-green + one human smoke pass.

**ADD-ON tier (nice-to-have garnish — explicitly NOT primary; never let these consume pre-launch runway):** **P2** receipt archetypes · Founding Roster/Day One Franchise flags. **P3 (post-launch)** `--roast` · `roster bench` · `roster wrapped` · receipt percentile line (hard-gated on real baseline data — never fake it). Rationale in master doc §7.7; severable by design.

**OUT (v1):** hosted/cloud service, auth brokering/OAuth re-issuing, marketplace, payments, model routing (NEVER — explicit owner decision), full modality *arbitration* (skill-vs-tool-vs-code-mode cost optimization — v2; skills *indexing/serving* IS v1 per owner decision 2026-07-04), Street table UI (activates when telemetry crosses k-anonymity thresholds — the pipeline ships, the public table waits for real data), Elo/Bradley-Terry (phase 2 — Wilson first), auto-Sixth-Man (returns with field data), deep skills task-verification suites (launch = structural + safety + behavioral; task-depth grows weekly), SaaS write-testing without owner-provisioned accounts + ToS review (owner task — flag which accounts are wanted and they can land before Jul 28).

## 5. Architecture

```
┌─────────────────────────── user's machine ───────────────────────────┐
│  agents/clients: Claude Code · Codex · OpenClaw · Hermes · Cursor …  │
│        │ (each has ONE mcpServers entry → roster)              │
│        ▼                                                             │
│  ┌──────────── router (MCP server, stdio+HTTP) ────────────┐         │
│  │ transparent mode: pure passthrough + logging            │         │
│  │ five mode: draft(need)→top-K · call(tool,args)→proxy    │         │
│  │ sixth-man failover · roster cache (per session)         │         │
│  └───────┬──────────────────────────────┬─────────────────-┘         │
│          ▼ backends (stdio/HTTP)        ▼ outcomes                   │
│   [srv A][srv B][srv C]…         ┌── coach (SQLite) ──┐              │
│                                  │ classifier · vecs  │              │
│                                  │ nightly OATS cron  │              │
│                                  └─────┬──────────────┘              │
│  cli: init·sync·eject·dashboard        │ opt-in, k-anon              │
└────────────────────────────────────────┼─────────────────────────────┘
                                         ▼
                     league.roster.* ◄── combine runners (CI/docker)
                     (Lab standings · profiles · box scores · badges)
```

**Monorepo** (pnpm workspaces, TypeScript, MIT):
```
roster/
├─ packages/router/    packages/coach/    packages/cli/
├─ packages/combine/   packages/league/   packages/badges/
├─ apps/site/          suites/            configs/
├─ docs/ (methodology.md versioned · telemetry-schema.md · integrations/)
└─ examples/ (claude-code/ codex/ openclaw/ hermes/ cursor/ gemini-cli/ langgraph/)
```
Default stack: Node ≥20 + official MCP TS SDK (2026-07-28 RC line; beta SDKs shipped Jun 29). Retrieval per §6.2's progressive ladder: SQLite FTS5 instantly (zero download) → local dense embeddings via **transformers.js v4** (EmbeddingGemma-300M ONNX, fetched at first run — never bundled, Gemma license; MiniLM-L6 low-RAM fallback) → nightly OATS. Store: SQLite (better-sqlite3 + sqlite-vec) at `~/.roster/`. Site: Next.js static. Combine runners: Docker. Alternative accelerator if TS SDK RC proves rough: FastMCP (Python) proxy/mounting for the passthrough layer — meta-tools stay custom either way.

## 6. Component specs

### 6.1 Router
**Meta-tools exposed in five mode:**
```json
{"name":"draft","description":"Describe the next thing you need to do. Returns the best ≤K tools (the starting five) for it. Call again whenever your need changes.","inputSchema":{"type":"object","properties":{"need":{"type":"string","description":"plain-language description of the immediate task"},"k":{"type":"integer","minimum":1,"maximum":10,"default":5}},"required":["need"]}}
{"name":"call","description":"Invoke a drafted tool by its full id.","inputSchema":{"type":"object","properties":{"tool":{"type":"string","description":"namespaced id: <server>.<tool>"},"args":{"type":"object"}},"required":["tool","args"]}}
```
- `draft` returns compact tool cards (id, one-line description, trimmed inputSchema) — and, for Claude-family clients, native `tool_reference` blocks (per Anthropic Tool Search Tool docs) so it plugs into Claude's own mechanism.
- **Transparent mode (default):** no meta-tools; every backend tool is re-exported under namespace `<server>__<tool>` (double underscore; sanitize to `[a-zA-Z0-9_-]`), calls pass through unchanged, outcomes logged. Identical behavior = trust. **Adaptive engagement rule (Anthropic's own threshold guidance):** below ~10K tokens of total tool definitions, plain injection beats indirection — stay transparent and don't push five mode; suggest it only above the threshold, where search provably pays. **Client-compat rule:** transparent mode keeps a STATIC tool list — never rely on `tools/list_changed` for mid-session changes (Cursor CLI ignores it, Gemini CLI lacks it, support is uneven everywhere). This is exactly why five mode is robust: its client-visible list never changes, so roster substitution works on every client regardless of notification support.
- **Roster cache:** per (session, need-embedding) → top-K, TTL 10 min, invalidated on drift/quarantine events. Use spec `ttlMs`/`cacheScope` on list responses.
- **Sixth Man — SUGGEST-ONLY at launch (owner decision 2026-07-04, red-team accepted):** on failure class ∈ {timeout, transport, http_5xx, tool_fail:internal}, return a structured error carrying `{"_roster":{"suggested_alternate":{"tool":Y,"reason":Z,"args_compatible":bool}}}` — the AGENT decides and re-calls; Roster never auto-fires a second tool. `args_compatible` is computed by validating the original args against the candidate's `inputSchema` (equivalent tools rarely share schemas — the flag tells the agent whether its args carry over or need rebuilding). Candidate selection: shares the capability tag, cosine ≥0.85 to the drafted need. Log every suggestion and whether the agent took it — that field data is what qualifies auto-substitution to return post-launch (read-only/idempotent classes first, never writes).
- **Backend management:** spawn/attach stdio servers, connect streamable-HTTP; health-check on boot; per-server timeout (default 30s); concurrency limit per backend; lazy connect for servers unused >7 days.
- **Spec compat:** speak 2026-07-28 stateless core; tolerate 2025-06-18-era backends for ≥12 months (per spec deprecation policy); set `Mcp-Method`/`Mcp-Name` headers on HTTP. Relay SEP-2322 Multi Round-Trip Requests transparently (`InputRequiredResult`/`requestState`/`inputResponses` travel in the payload — stateless-proxy-friendly by design). For pre-07-28 backends still using deprecated server-initiated sampling/elicitation, pass those through bidirectionally for the deprecation window — silently breaking them is the documented gateway pitfall.
- **Privacy law (hard):** tool args/results NEVER leave the machine, never enter telemetry, never appear in logs above debug level (debug logs redact string values by default).

### 6.2 Coach
**SQLite schema (sketch — refine, don't bloat):**
```sql
CREATE TABLE outcome(id INTEGER PRIMARY KEY, ts INTEGER, session TEXT, server TEXT, tool TEXT,
  need_hash TEXT, intent_cat TEXT, class TEXT, latency_ms INTEGER, model_family TEXT,
  substituted INTEGER DEFAULT 0, spec_ver TEXT);
CREATE TABLE tool_vec(tool_id TEXT PRIMARY KEY, server TEXT, base_vec BLOB, adj_vec BLOB, updated_at INTEGER);
CREATE TABLE rating(tool_id TEXT, category TEXT, n INTEGER, successes INTEGER, wilson_lb REAL,
  p50_ms INTEGER, p95_ms INTEGER, updated_at INTEGER, PRIMARY KEY(tool_id, category));
```
**Success classifier (exact precedence):**
1. transport/JSON-RPC error → `hard_fail:transport|protocol`
2. `result.isError === true` → `tool_fail:<auth|quota|schema|timeout|internal|other>` (classify by error-text heuristics; taxonomy aligned with MCP-Atlas's 11 categories + Digital Applied's classes: schema 38%/timeout 24%/auth 19%)
3. output violates declared output schema → `schema_drift_suspect` (also raises a drift event)
4. same tool re-called ≤3 turns later with modified args → append `soft_fail` marker to prior outcome
5. else `success`, latency bucketed `<250 | 250–1000 | 1000–4000 | >4000 ms`
Never attribute agent confusion to tools: ratings use only classes 1–3 (attributable); soft_fail is a routing signal, not a League stat.

**Nightly OATS job** (cron/launchd; CPU-only; from arXiv 2603.13426):
```
for each tool i with ≥4 positive outcomes in last 90d (cap 500/tool):
  Qp = embeddings of needs where i succeeded ; Qn = needs where i was drafted #1 but failed
  ê_i = normalize((1−α)·e(desc_i) + α·mean(Qp) − β·mean(Qn))   # α=0.3, β=0.1
  repeat 3 iterations; store adj_vec
else: adj_vec = base_vec blended with Lab priors (shipped as static file, refreshed with releases)
```
Paper results to sanity-check against: NDCG@5 0.869→0.940 (MetaTool). Add an offline eval script (`coach eval`) replaying logged outcomes to report routing NDCG before/after — this number feeds the public "Coach learning curve" content.

**Method-verification addenda (researched 2026-07-03 — these are part of the Coach spec):**
- **ε-exploration challenger slot — OFF BY DEFAULT (owner decision 2026-07-04):** the mechanism (with probability ε=0.05, replace the K-th roster slot with the next-best unexplored candidate; never for write-classified tools) is implemented but DISABLED at launch. It becomes available post-launch strictly as **opt-in** ("help train the league"), with first-run disclosure, a visible `roster telemetry`-style switch, `explored: true` logging, and explored outcomes **excluded from the user's personal stats**. Rationale for eventually offering it: pure OATS is exploitation-only and locks in early winners (ToolRet shows base embeddings start partly wrong); opted-in exploration un-biases data and produces the A-vs-B counterfactuals that feed phase-2 Bradley-Terry. Rationale for OFF: undisclosed deliberate suboptimal routing on the user's token bill, in a privacy-branded OSS tool, is a consent scandal waiting to be read in the source.
- **Index-time description expansion [P1]:** tools are under-documented and simple expansion measurably boosts retrieval (arXiv 2510.22670). Generate 3–5 synthetic example-queries per catalog tool centrally, ship them inside the Lab priors file, and index them alongside descriptions. Local default stays API-free; `roster index expand` optionally regenerates locally if the user has a model available.
- **Progressive retrieval ladder [P0 — supersedes single-mode retrieval]:** serve draft from day zero with NO model download: (1) **instant lexical** — SQLite FTS5/BM25 over names+descriptions+expanded docs (zero download, same mechanism as Claude's native search and ToolHive's hybrid; ToolRet BM25 baseline N@10≈36 proves it's a workable bootstrap); (2) **hybrid** once the embedding model finishes its background download — BM25+dense score fusion (~30/70, tunable), because dense decisively wins where it matters most (single-tool NDCG@1 ~58 vs ~18 for BM25); (3) **+OATS** nightly refinement; (4) optional reranker [P2]. Each rung upgrades silently — the user never waits and never configures.
- **Base model [resolved 2026-07-03]:** default **EmbeddingGemma-300M** — ONNX + transformers.js/Node confirmed working (`onnx-community/embeddinggemma-300m-ONNX`; in-browser/Node demos exist). **Gemma license ⇒ do NOT bundle weights in the npm package — download from HF at first run with checksum + license notice.** `--quality` tier: **Qwen3-Embedding-0.6B (Apache 2.0)** — notable because the ToolRet-SOTA retrievers (Tool-Embed) are built on exactly this base; if Tool-Embed's own weights are ever released open, they slot in here. Low-RAM fallback: all-MiniLM-L6-v2 (46MB). OATS refines whichever base is active.
- **Optional reranker [P2, `--accuracy` flag]:** mxbai-rerank-xsmall (70M) or bge-reranker-v2-m3 (278M) over the top-30 shortlist; CPU cost ~100–300ms/50 pairs — never in the default <50ms draft path.
- **Watchlist (do not build now):** Tool-to-Agent retrieval (2511.01854), ToolDreamer, multi-step query-planning retrieval (2601.07782), SING (2606.16591).

### 6.3 CLI (`roster`)
**`init`** — the 60-second path: detect clients by probing config paths (table §8) → parse (JSON/JSON5/TOML/YAML) → import all `mcpServers`-family entries into `~/.roster/roster.json` (dedupe by command+args/url hash) → print the **Day-0 receipt** → offer `sync`. **Ordering rule:** the receipt needs only the tokenizer, not the embedding model — print it FIRST, and the router is FULLY USABLE immediately in lexical (FTS5) mode with zero download; the embedding model fetches in the background and the retrieval ladder upgrades to hybrid silently (§6.2). There is no moment where the user waits on a download.
**Day-0 receipt spec:** per client: servers found, tool count (introspect via short-lived connections where cheap; else estimate from schema files), schema token estimate (serialize tool JSON, count via a local tokenizer approximation — document ±15% accuracy), $/month estimate (tokens × sessions/day default 10 × $ per Mtok default table, all overridable). Output: terminal card + `~/.roster/receipt.json` + a `--share` flag rendering an anonymized PNG/SVG card (no server names unless `--named`). NEVER inflate: conservative rounding, methodology one-liner on the card. **TRUTHFUL-BY-CLIENT OVERRIDE (2026-07-04, kill-risk K5 fix — STATE doc §3.1): the receipt MUST model each client's native behavior. Claude Code auto-defers schemas past 10% of context since Jan 2026, so "tokens loaded" computed by serializing schemas is FALSE for that segment — report "deferred, not loaded" there and lead with learning/failover/sync instead. Print measured or clearly-bounded per-client ranges only; the universal "~85% projected" line is banned. This is the exact spec bug velocity would have shipped faster.**
**Skills line [P0, ships with the Playbook]:** the receipt also reports the plays side — installed-skills count per client, and for OpenClaw the *exact* per-prompt injection cost via the deterministic formula (≈195 + Σ(97 + field lengths) chars) with the projected savings from allowlisting only the skills actually used.
**Receipt identity layer — ADD-ON tier, not primary (see §4 tiering; hook rationale in master doc §7.7).** The P0 receipt is the *numbers card only*. The following are tack-ons, severable by design: **[P2]** an **archetype** (rule-based on the stats: Tool Hoarder / Minimalist / Franchise Owner / Benchwarmer Collector — small data-driven ruleset in `packages/cli/src/archetypes.ts`); **[P2]** **founding flags** — installs before season-one close get `founding: true` in local state (surfaces in dashboard + any future opt-in public profile); **[P3, post-launch]** `--roast` (one tasteful-brutal template line), `roster wrapped` (quarterly recap card from local history), `roster bench` (3 bundled sample tasks through raw-schemas vs five-mode; token/latency/selection diff table; `--share` card), and the **percentile** line (hard-gated on real Combine/config-scan baseline distributions — omit entirely until the data exists; never fake it). **[P1, NOT an add-on]** `roster combine self` — runs the local Combine suite against an author's own server and prints a pre-listing scouting report (reuses the harness; drives author adoption). **Segment-aware messaging is P0:** when the only detected client is Claude Code, the receipt leads with learning/failover/sync lines, NOT token savings (they have native search; leading with savings reads ignorant — master doc §7.7).
**`sync`** — back up each client config file (full copy → `~/.roster/backups/<client>/<iso-ts>/`), then rewrite with the single roster entry (correct dialect per client: JSON `mcpServers`, TOML `[mcp_servers.roster]`, YAML `mcp_servers:`, VS Code `servers`, Zed `context_servers`). Idempotent; `--client <name>` to scope.
**`eject`** — restore byte-for-byte from the latest backup; if the file's hash changed since backup, show a 3-way diff and require `--force`. Eject must ALWAYS work — it's a headline trust feature; test it obsessively.
**`serve`** — run the router (stdio default; `--http :7345`). **`dashboard`** — local web UI at `127.0.0.1:7345/dash`: calls timeline, per-server success/latency, Sixth Man saves, drift alarms, weekly local box score. **`telemetry`** — `status|on|off`; prints schema and exactly what would be sent. **`receipt`** — re-print/update the audit.

### 6.4 Combine (probe harness)
Task file format:
```yaml
id: github.issue-create.v1
category: github          # Launch categories = every one honestly verifiable by Jul 28 (self-hostable +
mode: sandboxed           # readonly-live first: filesystem, memory, http/fetch, db/postgres, browser(local
                          # pages), git(Gitea), search(readonly-live); SaaS categories — email, calendar,
                          # slack-chat, notion-docs — gate on owner-provisioned test accounts + ToS review
                          # (owner task; can land pre-launch if provisioned). Stretch: ~100 servers total,
                          # hard-gated on human-signed verifiers — coverage never outruns signing.
setup: scripts/seed_repo.sh        # brings sandbox to known state
invoke: {tool: create_issue, args: {title: "Combine {{run_id}}", body: "…"}}
verify: scripts/verify_issue.py    # exit 0 = pass (MCPMark-style programmatic state check)
timeout_ms: 30000
```
Policy: **write-capable suites run ONLY against sandboxed self-hosted instances** (docker-compose per server under `suites/<category>/sandboxes/`); `readonly-live` suites (search/fetch/list) may hit live endpoints at ≤1 run/server/week with identifiable User-Agent and robots-style opt-out honored. Per-server ToS check recorded in the suite metadata (DeWitt-clause caution — master doc §13). Outputs: `lab-results.json` (per server: per-task pass/fail/class/latency, suite version, environment digest) — fully reproducible by third parties.

### 6.5 League site + badges
Pages: `/standings/<category>` (Wilson-ranked, CI bars, min n≥30 tasks), `/server/<id>` (scouting report: Lab scores, drift history, Trust flags, Combine version), `/methodology` (versioned, plain math), `/boxscore/<week>` (auto-generated deltas: climbers, benchings, streaks — the weekly content artifact, also emitted as markdown for X/LinkedIn). Badges: `GET /badge/<server>.svg` — tier-colored shield (Gold/Silver/Bronze by Wilson LB), served from our origin (authenticity = origin), 24h cache, links to the profile. Static-generate everything from `lab-results.json`; zero DB for v1.

### 6.6 Telemetry (opt-in, local-first — the Go model)
Event (only after explicit `telemetry on`):
```json
{"v":1,"install":"uuid-rotated-monthly","server":"github@1.2.3","tool":"create_issue","cat":"github",
 "class":"success","lat_bucket":"250-1000","model":"claude","spec":"2026-07-28"}
```
Hard exclusions: prompts, needs, args, results, embeddings, hostnames, paths. Street stats publish only at ≥5 distinct installs AND ≥200 calls per (server, category). Schema lives at `docs/telemetry-schema.md`; any change bumps `v` and is announced. The upload endpoint is stubbed until the owner approves standing it up.

### 6.7 The Playbook — skills routing (v1 scope, owner decision 2026-07-04)

Tools are players; skills are plays. Skills (SKILL.md directories) are now an **open standard adopted by 26+ platforms** — Claude Code, Codex CLI, Gemini CLI, GitHub Copilot/VS Code, Cursor, Cline, Windsurf, OpenClaw ([spec](https://agentskills.io/specification), [anthropics/skills spec](https://github.com/anthropics/skills/blob/main/spec/agent-skills-spec.md), [Codex skills docs](https://developers.openai.com/codex/skills)) — and the skills-bloat pain is quantified: OpenClaw injects EVERY installed skill's metadata into EVERY system prompt (~70 Claude Code + ~52 built-in + ~25 custom skills; deterministic cost ≈ 195 + Σ(97 + name+description+filepath chars); progressive disclosure remains an open feature request there, [#39945](https://github.com/openclaw/openclaw/issues/39945)).

**Design — three serving lanes over ONE unified index:**
- **Indexing [P0]:** skills join tools in the same capability index and the same retrieval ladder, with one skills-specific rule from SOTA research: **index the FULL SKILL.md body, not just frontmatter** ([SkillRouter, arXiv 2603.22455](https://arxiv.org/html/2603.22455v4): at ~80K-skill scale, metadata is insufficient — "the full skill body is the decisive routing signal"; retrieve-and-rerank, 74.0% Hit@1). Sources scanned by `init`: `~/.claude/skills/`, OpenClaw skills dirs, project `.claude/skills/`, configured paths. Same OATS refinement; same Wilson math for the League's **Skills Division**.
- **L1 — universal skill-as-tool bridge [P0]:** Roster's MCP surface serves top-K skills as callable tools (invoking one returns the skill body + resource manifest; bundled scripts exposed per policy). This makes skills work in EVERY MCP client — including ones with no native skills support. Prior art proves the pattern (dumb shims: [Skillz](https://github.com/intellectronica/skillz), [mcp-skill-hub](https://github.com/undermybelt/mcp-skill-hub)); none has routing intelligence, learning, or a trust layer — that is the gap. The protocol is heading our way too: an official [Skills-over-MCP working group](https://github.com/modelcontextprotocol/experimental-ext-skills) exists.
- **L2 — native-skills clients (Claude Code/Codex/Gemini CLI/…) [P1]:** they already do progressive disclosure, so the win is library management — one deduped, trust-gated skills library synced per client dir, with cross-client outcome telemetry ranking which plays actually work.
- **L3 — OpenClaw allowlist writer [P1]:** OpenClaw shipped per-agent skills allowlists ([skills-config docs](https://docs.openclaw.ai/tools/skills-config); the granted [#15717](https://github.com/openclaw/openclaw/issues/15717)) — `roster sync` writes `agents.list[].skills.allow`, turning 147-skill prompt bloat into a curated per-agent set. The deterministic cost formula makes the **skills receipt line exact**.
- **Trust [P0 — non-negotiable before any skill listing]:** ClawHavoc (1,184 malicious skills, $2.3M stolen) makes safety the entry ticket — poisoning heuristics on skill bodies, script static-scan, provenance flags; the Skills Division launches praise-asymmetric like everything else. Watchlist (not v1): [SkillComposer](https://skill-composer.github.io/) sequence composition; compositional skill routing (arXiv 2606.18051).

## 7. Algorithms quick-reference
- **Wilson lower bound** (rank key): `(p̂ + z²/2n − z·√(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n)`, z=1.96. Evidence: evanmiller.org/how-not-to-sort-by-average-rating.html.
- **OATS update:** §6.2. **Phase 2 (not v1):** synthetic Bradley-Terry matches ("router ranked A over B for same need; A succeeded → win") via lmarena/arena-rank with bootstrap CIs — gate on traffic density.
- **Drift detection:** hash each tool's (name, inputSchema, description) per connect; change → drift event → quarantine from default rosters pending re-Combine → dashboard alarm + (later) League drift column.

## 8. Client compatibility matrix (init/sync targets)
| Client | Config path (verify at build time — these move) | Dialect |
|---|---|---|
| Claude Code | `~/.claude/settings.json` + project `.mcp.json`; or `claude mcp add` | JSON `mcpServers` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%\Claude\` (Win) | JSON `mcpServers` |
| Codex CLI/IDE | `~/.codex/config.toml` (+ trusted project `.codex/config.toml`); or `codex mcp add` | TOML `[mcp_servers.*]` |
| Cursor | `~/.cursor/mcp.json` (+ project `.cursor/mcp.json`); deeplink `cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=<base64>` | JSON `mcpServers` |
| VS Code | user/workspace `mcp.json`; deeplink `vscode://mcp/install?<urlencoded-json>` | JSON `servers` |
| Gemini CLI | `~/.gemini/settings.json` | JSON `mcpServers` (`httpUrl` vs `url`) |
| Hermes | `~/.hermes/config.yaml`; or `hermes mcp add` | YAML `mcp_servers` |
| OpenClaw | `openclaw.json` `mcpServers` (or `mcporter`) | JSON |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` (verify) | JSON (`serverUrl` alias) |
| Cline / Zed | extension settings (verify) / `~/.config/zed/settings.json` | JSON / `context_servers` |
Prior art for auto-discovery: Snyk Agent Scan does exactly this across Claude/Cursor/Windsurf.

## 9. Non-functional requirements
Latency: `draft` <50ms local (embedding search over ≤2,000 tools); passthrough overhead <5ms. Zero network required after first run — and even the first run serves instantly in lexical mode (dense retrieval upgrades silently when the one-time, checksummed model download completes in the background; weights are never bundled — Gemma license; permanently-offline machines simply stay in lexical mode, stated honestly in docs). Cross-platform: macOS + Linux first, Windows before launch (config paths differ — test). Licenses MIT. **Integrity law: no fabricated numbers anywhere, ever** — receipts labeled as estimates, League shows CIs and n, every public stat traceable to a run artifact. Secrets: env passthrough to backends only; never persisted by us, never logged.

## 10. Milestones & acceptance criteria
- **M0 (weekend):** `roster init && roster serve` on a machine with Claude Code: transparent mode proxies 3 real servers (filesystem, fetch/search, github) end-to-end; outcomes in SQLite; receipt prints; unit tests green. *Verify: run a real Claude Code session through it; diff behavior vs direct config (must be identical).*
- **M1 (by Jul 12):** five mode (draft/call) + Sixth Man *suggestions* behind a flag; retrieval ladder live (FTS5 instant, dense background upgrade); **Playbook v0** (full-body skills index from local dirs + skill-as-tool bridge working in ≥2 clients); Combine v0 runs 3–4 categories × ~30 servers sandboxed → `lab-results.json`, ≥90% tasks deterministically verified; draft-utilization harness across 4 clients, numbers published. *Verify: `combine run --category github` twice → identical pass/fail sets.*
- **M2 (by Jul 19):** League site renders standings + server/skill profiles from real results (praise-asymmetric layout, per-task provenance flags); box-score generator; **weekly-rerun CI wired and scheduled**; `sync`/`eject` round-trip byte-identical on the 4 write clients (read-import verified on all detected formats); OpenClaw (incl. skills-allowlist write) + Codex + Cursor examples tested live; receipt `--share` card + skills line; **author reply-window invitations out (~Jul 14)**.
- **M3 (by Jul 27):** maximum human-signed Combine coverage (stretch: ~100 servers; floor: whatever is signed — **coverage never outruns signing**); skills Trust scan live; `methodology.md` v1.0; static badges; minimal dashboard; Coach nightly job + `coach eval` NDCG report; Windows CI-green + smoke pass; provenance page ("built with agents, reviewed by hand" + security-core review log).
- **M4 (Jul 28 — everything ready):** launch assets from real artifacts only: exposé with actual numbers (named top tiers + anonymized distribution), demo GIF script (context meter collapse + a Sixth Man suggestion saving a task), README with one-click badges. Owner chooses the exact rollout moment(s) — target is everything DONE by the 28th. *Nothing publishes without owner approval.*

## 11. Working agreements (for the agent)
1. TDD where there's logic (classifier, ratings, config parsers, eject); the eject path gets the most tests in the repo.
2. Verify before claiming done: run the real flow (a real client through the real router against real servers). Screenshots/transcripts in PRs.
3. Report honestly: failing tests, skipped steps, and estimate-quality caveats stated plainly.
4. **Stop and ask the owner before:** registering domains/orgs/handles, publishing packages, standing up any public endpoint (telemetry, badges, site), posting content, naming servers in any public artifact, or any spend.
5. Re-verify time-sensitive §2 facts if building weeks after 2026-07-03 (spec final status, Claude Code behavior, competitor moves — especially Composio, Klavis, MCPMark, Digital Applied's Oct rerun).
6. Keep the metaphor coherent in UX copy (starters/bench/box score — master doc Appendix A) but never at the expense of clarity.
7. Conventional commits; small reviewable increments; CI green before merge.
8. **Velocity discipline (owner-endorsed law, 2026-07-04):** specs are amended before code, every time; the no-restore list (`ROSTER-STATE-AND-DECISIONS.md` §4.3) is locked regardless of how cheap restoration looks; releases are gated on "validated-only ships." Plan and report work in **founder-verification hours**, not code hours — code cost ≈ 0, so anything consuming human signing/review/outreach is the real expense.

## 12. Pre-launch checklist
[ ] Name cleared — **Roster family** (npm `roster` or fallbacks `rosterhq`/`getroster`/`roster-mcp`; GitHub org; domains getroster.dev / roster.tools; @handle; USPTO 9/42) — owner task, agent prepares the sweep report
[ ] `npx roster init` cold-run tested on clean macOS/Linux/Windows VMs
[ ] Eject torture-tested (mutated configs, partial syncs, all dialects)
[ ] Combine 200-run reproduced twice; methodology.md matches implementation exactly
[ ] Every number in the exposé traces to `lab-results.json`; vendors get right-of-reply notes; ToS reviewed for any live-probed hosted server (DeWitt caution)
[ ] Telemetry OFF verified by packet capture in default mode
[ ] Skills Trust scan live before any skill appears on the League; skills receipt line verified against OpenClaw's deterministic injection formula
[ ] README: hero GIF, deeplink badges, one-line install, eject promise above the fold
[ ] Spec-day compatibility: router passes against 2026-07-28-final SDK release

## 13. Decision defaults (override only with stated reason)
| Decision | Default |
|---|---|
| Language / SDK | TypeScript + official MCP SDK (FastMCP-Python fallback for passthrough prototype) |
| K | 5 (configurable 1–10) |
| Retrieval | Progressive ladder: FTS5/BM25 instant → hybrid (BM25+dense ~30/70) after background model download → +OATS nightly → reranker only behind `--accuracy` |
| Embedding model | EmbeddingGemma-300M (ONNX confirmed in transformers.js/Node; Gemma license ⇒ first-run HF download, never bundled); `--quality` = Qwen3-Embedding-0.6B (Apache 2.0, base of ToolRet-SOTA retrievers); low-RAM fallback all-MiniLM-L6-v2 |
| Vector store | sqlite-vec v0.1.9+ pinned (Mozilla-backed, active as of Mar 2026); fallback = brute-force cosine in-process — at ≤2K tools it's milliseconds, so ANN is convenience, not dependency |
| Exploration | **OFF at launch** (owner decision); post-launch opt-in, disclosed, visible switch, excluded from personal stats |
| Sixth Man | **Suggest-only** at launch; auto-substitution returns post-launch with field data (read-only classes first, never writes) |
| Skills (Playbook) | v1: unified full-body index + universal skill-as-tool bridge [P0]; OpenClaw allowlist write + native-dir sync [P1]; Trust scan before any listing [P0] |
| Mode default | transparent; `--five` opt-in until M2 confidence, then prompt-suggested |
| Store | SQLite at `~/.roster/` |
| HTTP port | 7345 |
| Rating v1 | Wilson LB, min n=30, z=1.96; Elo/BT deferred |
| Telemetry | local-only until owner approves endpoint; k-anon ≥5 installs & ≥200 calls |
| License | MIT |
| Combine at launch | Every honestly-verifiable category (self-hostable + readonly-live first); **stretch ~100 servers, human-signed floor** — SaaS categories gate on owner-provisioned accounts (§6.4) |
| Extras discipline | P0 → P1 in order; P2 (archetypes, founding flags) only when idle; P3 (roast, bench, wrapped, percentile) strictly post-launch — see §4 tiering |

---

## 14. THE AGENT PROMPT (copy-paste into a fresh session)

```text
You are the lead engineer for ROSTER — a neutral, open-source, local-first TOOL ROUTER for AI agents with a learning layer and a public tool-quality league. You are starting with zero context; these two files are your complete context and your contract:

  1. ROSTER-BUILD-HANDOFF.md (repo root — currently /Users/mo/Downloads/roster/)  ← read FIRST, fully. It is the build spec: architecture, schemas, algorithms, CLI UX, client matrix, the Playbook (skills), milestones M0–M4 with acceptance criteria, working agreements, and decision defaults.
  2. ROSTER.md (repo root)  ← the strategy/research master doc. Read at minimum §4–§7.7, §9–§10, §13, Appendix B. Also skim ROSTER-STATE-AND-DECISIONS.md — the decision log and binding laws record. It constrains every public claim you may make and explains why each design choice exists. All facts in it were verified 2026-07-03; if significantly later, re-verify the time-sensitive ones (MCP spec status, Claude Code native tool search, Composio/Klavis/MCPMark/Digital Applied moves) before relying on them publicly.

THE PRODUCT IN ONE BREATH: one MCP endpoint fronts all the user's tool servers; agents get the best ≤5 tools per task ("the starting five") instead of hundreds of schemas; every call's outcome is logged locally and a nightly OATS job (arXiv 2603.13426: ê=(1−α)e+α·mean(success-needs)−β·mean(hard-negatives), α=.3 β=.1) makes routing smarter; a sandboxed probe harness ("the Combine") + opt-in k-anonymous telemetry feed a public league ranked by Wilson lower bound. SKILLS are first-class alongside tools ("The Playbook", handoff §6.7): one unified full-body index, a universal skill-as-tool bridge for every MCP client, and OpenClaw allowlist rostering. Client-agnostic by construction: Claude Code, Codex, OpenClaw, Hermes, Cursor, VS Code, Gemini CLI, everything MCP.

NON-NEGOTIABLE LAWS (from the owner):
- Tool/API routing only. Never model routing.
- Adoption first: <60s from `npx roster init` to the Day-0 receipt; no account, no API key, no cloud; transparent passthrough is the default mode; `roster eject` must restore every client config byte-for-byte, always.
- Privacy: args/results/prompts never leave the machine, never enter logs or telemetry. Telemetry is opt-in, local-first, schema-published.
- Integrity: no fabricated numbers anywhere — receipts are labeled estimates, league stats carry n and confidence intervals, every public number traces to a run artifact.
- Stop and ask the owner before: registering anything, publishing anything, deploying any public endpoint, or naming third-party servers in public artifacts.
- VELOCITY DISCIPLINE (binding): docs are amended BEFORE code — you will faithfully implement spec bugs, so keep this handoff true as you learn. D5 consolidation was executed 2026-07-04: THIS handoff is authoritative for build; ROSTER-STATE-AND-DECISIONS.md is the decision log and laws record. The no-restore list in that file's §4.3 is locked (owner-amended 2026-07-04); velocity is never a reason to restore a cut. Validated-only ships: anything you built that no human verified is not an asset on launch day — it is the exhibit.

EXECUTION ORDER: work milestones M0→M4 exactly as specified in the handoff §10, honoring the acceptance criteria as your definition of done. Begin with M0: scaffold the pnpm monorepo per handoff §5, then the transparent-mode router proxying 3 real servers (filesystem, fetch/search, github) with the outcome classifier from §6.2, then `init` + Day-0 receipt. Use TDD for classifier/parsers/eject; verify every milestone by driving a real client through the real router and reporting what actually happened, including failures. Keep commits small and conventional. PRIORITY DISCIPLINE: honor the §4 tiering strictly — P0 core first, then P1; the ADD-ON tier (P2: archetypes, founding flags · P3: --roast, bench, wrapped, percentile) is nice-to-have garnish the owner explicitly demoted: never let it consume pre-launch runway, and P3 items are post-launch only.

QUALITY BAR: this ships publicly on July 28, 2026 (MCP spec day) into a launch with press-style scrutiny — the code, the math, and the claims must all survive hostile review. When the spec and the handoff conflict with reality (an SDK API changed, a config path moved), reality wins: verify against live docs, fix the handoff file, and note the change in your report.

Begin now: read both files end-to-end, produce a short gap report (anything ambiguous, missing, or outdated — with your proposed resolutions and which defaults from handoff §13 you're adopting), then start M0.
```

---

## 15. Build-critical quick links
Proxy-enforcement paper (why the router is the control point): https://arxiv.org/pdf/2605.18414 · list_changed client-capability gap (why draft/call is robust): https://www.pulsemcp.com/posts/mcp-client-capabilities-gap · ToolRet (tool-retrieval benchmark — read before touching the Coach): https://arxiv.org/abs/2503.01763 · doc expansion: https://arxiv.org/pdf/2510.22670 · bandit routing: https://arxiv.org/pdf/2510.07429 · transformers.js v4: https://huggingface.co/blog/transformersjs-v4 · sqlite-vec: https://dev.to/stephenc222/how-to-use-sqlite-vec-to-store-and-query-vector-embeddings-58mf · MCP spec 2026-07-28 RC: https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/ · TS SDK: https://github.com/modelcontextprotocol/typescript-sdk · tools/isError spec: https://modelcontextprotocol.io/specification/2025-06-18/server/tools · Anthropic tool search / tool_reference: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool · advanced tool use: https://www.anthropic.com/engineering/advanced-tool-use · OATS: https://arxiv.org/abs/2603.13426 · MCPMark (verify method + prior art): https://arxiv.org/abs/2509.24002 · https://mcpmark.ai/leaderboard/mcp · MCP-Atlas taxonomy: https://arxiv.org/abs/2602.00933 · Wilson: https://www.evanmiller.org/how-not-to-sort-by-average-rating.html · Arena-Rank (phase 2): https://github.com/lmarena/arena-rank · FastMCP proxy: https://gofastmcp.com/servers/proxy · Snyk Agent Scan (auto-discovery precedent): https://github.com/invariantlabs-ai/mcp-scan · Codex MCP: https://developers.openai.com/codex/mcp · Hermes MCP: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp · OpenClaw MCP: https://docs.openclaw.ai/cli/mcp · Cursor deeplinks: https://cursor.com/docs/mcp/install-links · VS Code button gen: https://vscodemcp.com/ · config-format map: https://mcpplaygroundonline.com/blog/complete-guide-mcp-config-files-claude-desktop-cursor-lovable · SLO/OTel conventions: https://www.digitalapplied.com/blog/mcp-server-reliability-metrics-slo-design-framework-2026 · stress-test baseline: https://www.digitalapplied.com/blog/mcp-server-reliability-100-server-stress-test-study

*This handoff + the master doc are the project's complete brain as of July 3, 2026. Keep both updated as reality moves — they are living documents, and the next agent session starts exactly where you leave them.*
