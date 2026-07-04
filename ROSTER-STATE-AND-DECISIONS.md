# ROSTER — State of Play & Decision Brief

> **What this document is:** the synthesis of the entire ideation → research → verification → red-team cycle (July 3–4, 2026), written for two readers: **Mo**, to finalize the open decisions, and **future agents**, to understand exactly where truth lives before touching anything.
>
> **Precedence rule (updated 2026-07-04): the D5 consolidation pass has been EXECUTED.** The handoff (`ROSTER-BUILD-HANDOFF.md`) is authoritative for build; this file is the decision log, binding-laws record, and red-team archive. The 11 contradictions in §3.4 are resolved.
>
> **File family:**
> 1. `ROSTER.md` — strategy & research master doc (evidence, market, virality playbook, ~170 sources)
> 2. `ROSTER-BUILD-HANDOFF.md` — build spec + agent boot prompt (authoritative for build)
> 3. **This file** — decision log (all resolved), binding laws, red-team archive
>
> All three live in the repo root — currently `/Users/mo/Downloads/roster/`.

---

## 1. Where the project stands (one page)

**The product (unchanged, verified, still the right thesis):** an open-source, local-first **tool router** for AI agents. One MCP endpoint fronts all of a user's servers; agents get the best ~5 tools per task instead of 200 schemas. Three layers: **The Rotation** (router — the utility), **The Coach** (local outcome-learning — the moat), **The League** (public tool-quality rankings — the distribution engine). Adoption is engineered as a law: <60s install, no API keys, no cloud, instant lexical start, transparent-passthrough default, byte-for-byte `eject`.

**What has been verified (5 deep research passes, July 3):**
- The pain is real and quantified (up to 72% of context eaten by schemas; selection accuracy collapse 43%→14%; 177K+ public tools growing ~35×/yr).
- The three differentiation claims survive, precisely phrased: **no outcome-learned tool router with traction exists; no continuous, named, live-traffic tool-quality league exists; no neutral cross-vendor learned routing exists.**
- The methodology is optimal under our constraints (OATS + progressive retrieval ladder + Wilson/BT math; every layer independently evidenced and swappable).
- The architecture is optimal (meta-tool pattern is provably immune to the `list_changed` client gap; stateless proxy aligns with the July 28 spec; proxy-level enforcement is academically endorsed).

**What has been red-teamed (2 adversarial passes, July 3–4):** both converged on the same verdict — **the product is sound; the original launch plan was not.** The centerpiece (200-server, 12-category, named crash test in 23 solo days) was arithmetically, logistically, and legally impossible. The revised plan (§4) fixes this. Red Team #2 added the deeper insight: with agentic development, **code is no longer the bottleneck — founder verification hours are.** Plan in founder-hours.

**Current status (end of 2026-07-04 session):** ALL DECISIONS D1–D8 ✅ RESOLVED · D5 consolidation EXECUTED · name **ROSTER** · repo initialized at `/Users/mo/Downloads/roster/` with docs committed · build phase begins — next step is **M0** per handoff §10.

---

## 2. What survived everything (the load-bearing truths)

| # | Truth | Status after all passes |
|---|---|---|
| 1 | Tool/API routing only — never model routing | LAW (owner decision) |
| 2 | The three white-space claims (§1 above) | CONFIRMED, phrasing locked |
| 3 | OATS + ε-exploration + retrieval ladder as the Coach | OPTIMAL under constraints (ε ships OFF — see D7) |
| 4 | draft/call meta-tool architecture | CONFIRMED — and client-gap-immune (its killer property) |
| 5 | Lab/Street two-table league; Wilson lower bound; evidence tiers | CONFIRMED — with honesty amendments (n = distinct tasks; held-out rotation) |
| 6 | Adoption laws (<60s, no API key, lexical-instant, eject) | CONFIRMED — with footprint honesty (publish cold-install size; daemon later) |
| 7 | The evaluation pyramid (universal protocol checks → 12 category suites → Street behavioral → community suites) | CONFIRMED as scaling answer |
| 8 | Build-in-public + leaderboard-delta + exposé virality playbook | CONFIRMED — with praise asymmetry now mandatory |
| 9 | Monetization optional; league never paywalled | UNCHANGED |
| 10 | July 28 spec-day as a launch moment | KEPT — but decoupled from the land-grab (§4, D1/D4) |

---

## 3. The consolidated red-team record

### 3.1 Kill risks → resolutions (all accepted)

| Kill risk (RT1) | RT2 re-adjudication under AI velocity | Resolution adopted |
|---|---|---|
| K1 Combine arithmetic doesn't close (360 tasks/200 servers/14 days = fiction) | SOFTENS: drafting is free; **human signing (~15 tasks/day) is the cap** | Launch Lab = **4–6 self-hostable categories, ~50–60 human-signed tasks, ~40–60 servers**; 200-server run in September |
| K2 SaaS categories un-sandboxable (Gmail/Slack/Notion need test orgs, OAuth, ToS, money) | STANDS: agents can't click "I agree" | SaaS divisions launch **September**, after accounts/ToS work; never headline counts we didn't write-test |
| K3 Naming losers day one = libel risk + burns the authors we need | STANDS, **amplified** by AI-drafted verifier errors | **Praise asymmetry law:** name top tiers only; anonymized distribution for the rest ("X% failed" stays as headline); 14-day author reply window (opens ~Jul 14); named-bottom only after |
| K4 Timeline ~3× oversubscribed | SOFTENS by half: build exits critical path, **founder enters it** (~15–20 of 25 days is human-only work) | Revised scope §4; plan in founder-hours; cut/restore list locked |
| K5 Receipt prints FALSE numbers for Claude Code users (native deferral) | SOFTENS to 1-day fix — but must be spec'd BEFORE agents build (they ship spec bugs faster) | **Client-aware truthful receipt:** model native deferral per client; print measured ranges; universal "85%" line banned; Claude Code receipt leads with learning/failover/sync |

### 3.2 Major findings → resolutions

| Finding | Resolution |
|---|---|
| M1 draft/call cooperation unmeasured across clients | Pre-launch **draft-utilization harness** across 4–5 clients (agent-built, ~Jul 12); publish numbers; launch GIF must depict the actual default mode |
| M2 ε-exploration = consent scandal | **Ships OFF.** Post-launch: opt-in, disclosed, visible off-switch, explored-failures counted visibly (D7) |
| M3 Beachhead mismatch (OpenClaw's real bloat is SKILLS — 26 tools + 53 skills; issue #15717 is a skills request) | OPEN DECISION D3. RT2 warns: velocity makes pulling skills-routing forward *technically possible* — that's the trap, resist it |
| M4 Launch league = the static thing we mocked | **DIES:** weekly automated rerun CI, live from day one — restored aggressively |
| M5 stdio = N routers × 200MB model per client; cold npx = hundreds of MB | Launch: FTS5-first ladder + **published honest footprint**; shared local daemon fast-follows (Sept) |
| M6 Wilson CIs over fixed deterministic suite = pseudo-statistics | Methodology states **n = distinct tasks**; versioned suites with **held-out task rotation** per season |
| M7 k-anonymity broken by monthly UUID rotation | **DIES:** seasonal salted pseudonym / HMAC(install, epoch); privacy logic joins the human-review list |
| M8 "Smart on day one" overclaims Lab priors | Reframe: **"reliability-aware defaults, seeded — it gets smart on YOUR traffic"**; central description-expansion (restored) adds real affinity signal |

### 3.3 New risks from agentic development (Red Team #2's distinctive contribution)

1. **NR1 — Verifier verification is the new hard cap.** Only human-signed tasks feed named scores. Adversarial two-agent drafting (one writes the verifier, one attacks it), mutation-testing against seeded known-bad states, per-task provenance flags. Founder signing bandwidth (~15 tasks/day) sets Combine scope — not codegen speed.
2. **NR2 — Provenance optics.** "Route all your agents' traffic + secrets through a 25-day-old AI-built proxy" is the slop-unmasking anti-pattern aimed at ourselves. **Fix = disclose first and loudly:** README "built with agents, reviewed by hand" section, published human-review log for the security core, self-run security scan report. Converts the liability into build-in-public content — this is on-brand, do it proudly.
3. **NR3 — Velocity-exempt human-review list (line-by-line, no exceptions):** (a) sync/eject config rewriting, (b) credential/env passthrough (agents habitually add debug logging — one leaked token is terminal), (c) telemetry redaction + packet-capture-verified OFF default, (d) write/idempotency classification, (e) HTTP auth surface. ~2–4K LOC; reserve ~3 founder-days.
4. **NR4 — Founder attention is the critical path.** Human-only backlog ≈ 15–20 days: verifier signing (~4), security review (~3), cross-client live validation (~4), vendor reply-window correspondence, tester recruitment, ToS reads, name/TM clearance, owner-approval gates. Anything consuming founder attention is the real expense; code cost ≈ 0.
5. **NR5 — Velocity-induced re-creep & spec drift.** At 10× speed every cut feels restorable in a weekend → "everything exists, half unvalidated" — fatal for a measurement product. **Rules: amend docs BEFORE unleashing build agents; single source of truth; written no-restore list (§4.3); validated-only ships.** ✅ **EXECUTED 2026-07-04 (owner-endorsed):** propagated as binding law into all three docs — handoff (top banner + working agreement #8 + agent-prompt law + inline overrides on the two known spec bugs: ε default and receipt token math) and master doc (§13 risk row + §15 build-discipline paragraph).

### 3.4 The 11 contradictions (✅ ALL RESOLVED in the D5 pass, 2026-07-04 — kept for the record)

1. Handoff §5 + master §15 still say fastembed/bge-small (pre-upgrade stack) vs §6.2/§13 EmbeddingGemma/transformers.js
2. Handoff §9 "model bundled" vs §6.2 "do NOT bundle" (Gemma license)
3. Master §7.6 "works offline" vs mandatory first-run HF download (truth: offline = permanent lexical mode — state it)
4. Master §10 week-1 Combine "read-only" vs handoff M1 "sandboxed"
5. Master §16 hook-health metrics measure P2/P3 features that don't ship at launch
6. §7.7 verdict ("fires on every mechanism") vs its own priority note demoting those mechanisms
7. Master §7.6 "seven day-one utilities" + launch GIF lean on P1 features ("if timeline holds")
8. Master sells Lab+Street; handoff cuts Street UI from v1
9. Master §5.4 mocks MCPMark as "static" while our launch Lab was static (fixed by weekly-rerun restore — update framing)
10. Receipt integrity law vs Claude Code token number + universal "~85%" line (fixed by K5 resolution — update text)
11. Repo `suites/` lists 5 categories; §6.4/§13 say 12; M1 says 3 (new truth: 4–6 at launch, 12 by season end)

---

## 4. The revised plan (the one that survived both red teams)

### 4.1 The launch — single launch, everything ready by July 28 (owner decisions D1/D4)

- **Router:** transparent + five modes; stdio + localhost-only HTTP; namespacing; roster cache; adaptive ~10K-token engagement rule; SEP-2322 relay + legacy passthrough
- **Sixth Man: suggest-only** (structured error + `suggested_alternate` hint). Auto-substitution returns post-launch, qualified by suggestion field data — an AI-drafted idempotency regex must never auto-fire a write
- **Coach:** outcome classifier, nightly OATS, FTS5→hybrid retrieval ladder, **ε OFF**, Lab-prior seeding ("reliability-aware defaults")
- **CLI:** `init` with **read-import for all 8+ config formats**; **write/sync + torture-tested eject for 4 clients** (Claude Code, Cursor, Codex, OpenClaw); **client-aware truthful Day-0 receipt** (models native deferral; measured ranges only); receipt prints before model download; dashboard as one boring read-only page
- **Combine/League:** every category honestly verifiable by Jul 28 (self-hostable + readonly-live first; SaaS divisions gate on owner-provisioned test accounts + ToS review — owner task, can land pre-launch if provisioned) · **stretch target ~100 servers; hard floor = human-signed coverage only** (coverage never outruns signing) · **weekly rerun CI live at launch** · praise-asymmetric league (named top tiers + anonymized distribution + reply window from ~Jul 14) · static SVG badges · box-score generator · methodology v1 with per-task provenance flags
- **The Playbook (skills — D3):** unified full-body skills+tools index · universal skill-as-tool bridge (every MCP client) · OpenClaw per-agent allowlist writer · skills receipt line (deterministic OpenClaw injection formula) · Skills Division gated on Trust scan (handoff §6.7)
- **Trust/provenance:** "built with agents, reviewed by hand" page + published security-core review log + self-run scan report
- **Platforms:** macOS/Linux first-class; Windows CI-green + one human smoke pass
- **Launch content:** honest exposé (distribution stats + named top tier), the context-meter GIF (depicting the real default), one-click badges in README

### 4.2 Post-launch fast-follows (continuous weekly seasons — there is no "second launch")

SaaS divisions as owner-provisioned accounts/ToS land (before or after the 28th) · coverage growth toward and past 100 servers via weekly rerun seasons · Street table UI when telemetry crosses k-anonymity thresholds · Claude `tool_reference` deep integration · auto-Sixth-Man (qualified by suggestion field data) · opt-in disclosed ε · shared local daemon · Bradley-Terry/Arena-Rank · skills task-verification depth (launch ships structural + safety + behavioral)

### 4.3 The no-restore list (locked; velocity is not a reason — owner-amended 2026-07-04)

named bottom tiers at launch · ε default-on · `tool_reference` deep integration pre-launch · dynamic badge endpoint (static SVGs suffice) · write-path beyond 4 clients · auto-Sixth-Man (suggest-only until field data qualifies it) · **unsigned verifiers feeding named scores** · SaaS write-testing without provisioned accounts + ToS review · deep skills task-suites pre-launch (structural + safety + behavioral only)

*Owner amendments vs the original list: single launch (no September decoupling); server stretch raised to ~100 (still hard-gated on human signing); skills pulled into v1.*

### 4.4 The laws (cumulative, binding on all future agents)

1. Tool routing only; never model routing
2. No fabricated numbers, anywhere, ever — receipts client-aware; every public stat traces to a run artifact; CIs and n always shown
3. Content never leaves the machine or enters logs; telemetry opt-in, local-first, packet-capture-verified off by default; k-anon via seasonal salted pseudonyms
4. **Human-signed-only:** no named public score from an unsigned verifier
5. **Praise asymmetry at launch** + author reply window before any named-bottom publication
6. **Provenance honesty:** disclose agentic development loudly; publish the human-review log
7. **Validated-only ships**; amend specs before unleashing build agents; respect the no-restore list
8. The NR3 human-review list is velocity-exempt (eject, credentials, telemetry redaction, write classification, HTTP auth)
9. Consent: no deliberate suboptimal routing without disclosure and an off switch
10. Stop-and-ask gates: registering anything, publishing anything, deploying public endpoints, naming servers publicly, any spend

---

## 5. OPEN DECISIONS — for Mo to finalize

| ID | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| **D1** | Launch structure | — | ✅ **RESOLVED 2026-07-04: single launch, everything ready by Jul 28** (owner). Honesty gates preserved: human-signed-only coverage (stretch ~100 servers), praise asymmetry, SaaS gated on accounts. No second launch — post-launch = continuous weekly seasons | Milestones (handoff §10) |
| **D2** | Name | — | ✅ **RESOLVED 2026-07-04: ROSTER** (owner decision). All docs renamed (`ROSTER*.md`) and identifiers updated (`npx roster`, `~/.roster/`, CLI `roster`); "the starting five" survives only as the lowercase feature term for the served five. **Prior npm/org clearance applied to the former name only** — the Roster-family sweep moves into D8 | D8 |
| **D3** | Beachhead & skills | — | ✅ **RESOLVED 2026-07-04: skills ("The Playbook") pulled into v1** after a dedicated research pass (SKILL.md = 26+ platform open standard; OpenClaw allowlists already shipped; SkillRouter full-body finding; bridge-shim prior art; official Skills-over-MCP WG). Product = universal (tools + skills, every client). Beachhead = dual: OpenClaw (skills+tools) + Cursor/Codex (tool search) | Handoff §6.7 |
| **D4** | Launch date | — | ✅ **RESOLVED 2026-07-04: (a)** — everything targets ready-by-Jul-28 or sooner; owner chooses the exact rollout moment(s), day-of or across following days | Content calendar |
| **D5** | Consolidation pass | — | ✅ **EXECUTED 2026-07-04:** all 11 contradictions fixed; red-team resolutions + all owner decisions encoded in master + handoff; handoff authoritative again | — |
| **D6** | Sixth Man | — | ✅ **RESOLVED: suggest-only at launch** (owner); auto-substitution returns post-launch, qualified by suggestion field data | Handoff §6.1 |
| **D7** | ε-exploration | — | ✅ **RESOLVED: (b)** — OFF at launch; post-launch opt-in, disclosed, visible switch, excluded from personal stats | Handoff §6.2 |
| **D8** | Repo setup | — | ✅ **EXECUTED 2026-07-04:** folder `/Users/mo/Downloads/roster/` created, docs moved in, git initialized + initial commit. Clearance sweep **deferred by owner** — ⚠️ standing caution: nothing registered/published; run the Roster-family sweep (npm/org/domains/@handle/USPTO; fallbacks `rosterhq`/`getroster`/`roster-mcp`) before any public artifact uses the name | — |

**All decisions D1–D8 ✅ resolved as of 2026-07-04. Build phase begins: M0 per handoff §10.**

### 5.1 Second owner pass — P-decisions (2026-07-04, post-M0)

| ID | Decision | Status |
|---|---|---|
| **P1** | npm package name | ✅ **RESOLVED: ship as `roster`**; revisit only if the clearance sweep forces it (fallback list from D8 stands) |
| **P2** | Strategy docs at public flip | ✅ **RESOLVED: publish everything** — gated on a personal/work-info sweep of all docs before the flip (owner: "all public… as long as no personal work stuff") |
| **P3** | Flip date | ⏳ **DEFERRED** — owner decides later, with agent; repo stays private until then |
| **P4** | Combine signing | 🔶 **PARTIAL** — owner signs later; agent runs all pre-signing verification + guided checklist (`docs/signing/session-1-checklist.md`). ⚠️ Owner's "you do signing" is **not executable as written**: the human-signed-only law (§4.4) means an agent flipping `signed: true` would falsify the provenance the League sells. Interpreted as "do the verification legwork" (done). If the owner ever truly wants agent-signing, this law must be consciously amended here first — recommendation: never |
| **P5** | Next build | ✅ **RESOLVED: League site** — built 2026-07-04 (`apps/league` — the frontend extension's own top-level home, per owner; static, artifact-driven, honesty rules enforced in code) |
| **P6** | Rollout shape | ⏳ **OPEN** (one drop vs staged over 2–3 days) — needed before Jul 28 content planning |

---

## 6. Instructions for future agents

1. **Read order:** this file → `ROSTER-BUILD-HANDOFF.md` → `ROSTER.md` (at minimum §4–§7.7, §13, Appendix B).
2. **Precedence:** this file wins over both until D5 is marked executed here; then the handoff is authoritative for build, the master for strategy/claims.
3. **The laws (§4.4) are non-negotiable.** The no-restore list (§4.3) is not a suggestion. The stop-and-ask gates apply to you.
4. **Dates matter:** research verified as of 2026-07-03. If materially later, re-verify: MCP spec final status, Claude Code native search behavior, Composio/Klavis/MCPMark/Digital Applied moves (their 200-server rerun ~Oct 2026), sqlite-vec/transformers.js versions, competitor launches.
5. **Plan in founder-hours.** Before proposing work, state its founder-verification cost, not its code cost. Anything needing human signing, review, accounts, or outreach is the expensive part.
6. **When drafting Combine tasks:** two-agent adversarial drafting, mutation-test the verifiers, flag provenance. Unsigned = never feeds named scores.
7. **Status flags (end of 2026-07-04 session):** ALL decisions D1–D8 ✅ RESOLVED · D5 consolidation EXECUTED (handoff authoritative; former inline overrides are now native spec) · repo initialized at `/Users/mo/Downloads/roster/`, three docs committed · name **Roster** — ⚠️ clearance sweep deferred by owner; nothing registered/published; sweep before any public artifact · skills ("The Playbook") in v1 · ε OFF · Sixth Man suggest-only · single launch targeting Jul 28 · next step: **M0** (handoff §10).

## 7. How we got here (compressed timeline)

Jul 3: scope set (tool router, NOT model router) → 5 research passes (MCP ecosystem · competitive kill-check · virality evidence · technical blueprint · demand/monetization) → concept locked (router + learning + league) → "Loadout" killed (collisions), provisional two-word basketball name (**StartingFive**) adopted — superseded 2026-07-04 by final name **ROSTER** → master doc + build handoff written → adoption engineering pillar added (agnostic, <60s, day-one value) → hook meta-review (Wrapped/roast/bench/founding upgrades, then tiered P2/P3 as add-ons by owner decision) → Coach method verification (OATS optimal; EmbeddingGemma/Qwen3/transformers.js v4/sqlite-vec; progressive retrieval ladder; ε-slot) → architecture verification (meta-tool client-gap immunity; adaptive threshold; Sixth Man schema guard; spec passthrough) → evaluation Q&A (Lab/Street split defended; implicit-feedback science; evaluation pyramid) → naming rounds (podium: Roster/Clutch/Benched + Dime) → Red Team #1 (kill risks on Combine math, SaaS sandboxing, naming losers, timeline, false receipt) → Red Team #2 (agentic-velocity lens: founder-hours as bottleneck, verifier-verification cap, provenance optics, restored cuts) → this synthesis (Jul 4) → velocity-discipline law propagated to all docs (owner-endorsed) → name finalized **ROSTER**, docs renamed → dedicated skills-routing research pass (SKILL.md standard on 26+ platforms; OpenClaw allowlists shipped; SkillRouter full-body finding; bridge-shim prior art; Skills-over-MCP WG) → **ALL decisions D1–D8 resolved** (single Jul-28 launch; ~100-server stretch, human-signed floor; Playbook into v1; ε off; Sixth Man suggest-only; sweep deferred) → D5 consolidation executed → repo initialized at `~/Downloads/roster/`.

*This document is the project's current single source of truth for decisions and status. Update §5 statuses and §6.7 flags as decisions land.*
