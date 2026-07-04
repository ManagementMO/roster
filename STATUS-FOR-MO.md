# Roster — status & decision board for Mo

> **Single source of truth for where the project stands, what's left, and what awaits YOUR decision.** Last full update: 2026-07-04 (after the deep sweep: 3 specialist review agents + live Gemma verification + fix wave). Read top to bottom; §2 and §3 are yours.

---

## 1. TL;DR — where we are

**The M0+ core is built, seven-times-reviewed, live-verified, and green everywhere.**

| Gate | Status |
|---|---|
| Unit/integration tests | **92 passing** |
| CI (ubuntu · macos-26 · windows) | **green, zero warnings/annotations** |
| Real-server end-to-end (fs + memory through the real binary) | **passing** (transcript in `docs/verification/`) |
| Combine vs real filesystem server | **8/8, deterministic across runs** |
| Dense rung — MiniLM live (real inference) | **verified** (hybrid fusion + OATS: cos ~0 → 0.491 after 4 real outcomes) |
| Dense rung — Gemma via real `roster serve` | **verified**: auto-selected, downloaded in background, **warm in ~40s, 256-dim, drafts never blocked, memory tool #1 post-warm** |
| Trust laws (privacy/telemetry-off/suggest-only/eject) | **verified by 3 independent reviewers + hostile QA** |

**Answer to your question "is the dense-embedding path fully implemented and working?" — YES, now.** Both models live-verified end-to-end, plus this sweep hardened it: model-switch guard (stale learned vectors are wiped when the embedding model changes — previously they silently poisoned rankings and could read out-of-bounds memory), Gemma's mandated prompt prefixes added, real ONNX session disposal on idle (previously ~300MB waited on GC), bounded warmup retries with backoff (no more download-restart storms), chunked backfill for big rosters, and hybrid fusion made **signal-adaptive** (cosine channel min-max scaled per draft; when its span is noise-level the dense channel abstains and lexical decides — live-proven both ways: abstains on MiniLM blur, governs after OATS refinement).

Also hardened this sweep (multi-client safety): simultaneous `roster serve` boots can no longer crash on a write race (`BEGIN IMMEDIATE` + degrade-don't-die), a sibling process's freshly-synced server can't be pruned by a stale-config race, and `roster.json` writes are atomic.

Nothing is published, registered, or public. Private repo: `github.com/ManagementMO/roster`.

---

## 2. ⚖️ AWAITING YOUR DECISION (with my recommendation each)

| # | Decision | Options | My rec |
|---|---|---|---|
| **P1** | **npm package name fallback** — `roster` is a common word; the sweep may find it taken. CLI command stays `roster` regardless. | `rosterhq` · `getroster` · `roster-mcp` | `rosterhq` (cleanest, matches an @handle) |
| **P2** | **Strategy docs & the public repo** — the repo contains ROSTER.md + the decision log (competitive analysis, launch playbook). Going public publishes them. | (a) move strategy docs private, open code only · (b) publish everything (radical transparency) · (c) publish master doc + code, keep decision log private | (c) |
| **P3** | **When the repo flips public** | at launch (Jul 28) · ~1 week early for build-in-public momentum | ~1 week early, after the name sweep |
| **P4** | **Launch Combine scope = your signing hours** | floor: filesystem only (~2h signing) · comfortable: + memory, Gitea-git, sqlite (~4–6h total) | comfortable tier |
| **P5** | **My next build target** | League site (makes everything visible) · more suites first · dashboard | League site |
| **P6** | **Launch-day rollout shape** — everything targets ready-by-Jul-28; the release moment(s) are yours | one big drop · staged over 2–3 days | staged: repo+receipt demo day 1, League reveal day 2 |

*Reply in shorthand whenever ready — e.g. "P1 rosterhq, P2 c, P3 early, P4 comfortable, P5 league, P6 staged" — and I'll execute.*

---

## 3. 🧍 FOUNDER-ONLY TASKS (nobody else can do these)

1. **Signing session #1 (~2h).** Certify the 8 filesystem tasks: run each pass case, force a fail case, flip `signed: true`. **This is THE unlock** — until then, the League may not publish a single named score (`signedWilsonLb` is the only number allowed to back one, and it's currently n=0). I'll prep a guided checklist.
2. **Name clearance sweep (~30–60 min).** npm / GitHub org / domains (`getroster.dev`, `roster.tools`) / @handle / USPTO glance. Blocks anything public.
3. **SaaS test accounts (optional, ~1–2h).** Fresh Gmail/Slack/Notion orgs unlock those divisions; launch is honest without them.
4. **Early testers (launch week).** 3–5 OpenClaw/Cursor power users from your network.
5. **PROVENANCE review log.** The "built with agents, reviewed by hand" page has an empty human-review table — your first entries (eject path, credential passthrough, telemetry) make the provenance story real. Can fold into the signing session.

---

## 4. 🔧 MY READY QUEUE (zero input needed — building on your "go")

League site (standings + profiles + box scores from `lab-results.json`) → static badges → weekly-rerun CI → suites: memory/Gitea-git/sqlite (drafted for your signing) → dashboard page → OpenClaw skills-allowlist writer → receipt depth (per-serve token measurement, $ estimate) → router niceties (HTTP backends + `http_5xx` class, roster-cache TTL, adaptive ~10K rule, health checks) → launch assets.

---

## 5. What works today (all verified, evidence in `docs/verification/`)

- **Router, transparent mode:** fronts real servers simultaneously, namespaced re-export, byte-faithful passthrough (protocol errors now surface exactly as a direct connection would), outcomes recorded, secrets provably never persisted.
- **Router, five mode:** `draft`/`call` with `draft_id` attribution; mixed tool+skill starters; never-empty drafts (rated fallback); Sixth Man suggestions (strictly suggest-only, logged with taken-tracking).
- **Coach:** classifier (exact spec precedence) · FTS5 + normalized hybrid fusion · OATS (live-proven) · Wilson ratings · nightly job wired at serve boot (debounced ~20h) · drift quarantine with 24h dwell + stable-re-sight auto-clear + `roster unquarantine` · model-switch guard · multi-process safe (immediate transactions, busy-wait, prune grace window).
- **Playbook:** SKILL.md discovery/parse (full-body indexing), trust scan v0, OpenClaw exact injection-cost formula, universal skill-as-tool bridge.
- **CLI:** `init` (10 client formats, platform-aware paths verified on 3 OSes), truthful client-aware receipt, `sync`/`eject` (byte-for-byte, era-aware, integrity-checked, atomic writes), `serve`, `telemetry`, `combine run`, `unquarantine`.
- **Combine:** declarative end-state verifiers, sandbox containment (escape attempts fail safely), connect timeouts, per-side OATS caps, `lab-results.json` now with `environmentDigest` and **`signedWilsonLb`** (the only stat that may back a named score).

## 6. Review record (velocity-discipline law)

Seven adversarial agent passes, every accepted finding fixed **with a regression test**:
1–2. Overnight code reviews (4 CRITICAL + 9 MAJOR → fixed) · 3. Functional QA (flagship empty-draft bug → fixed) · 4. Clean-code sweep ("clean, professional, public-ready"; wired the dormant learning loop) · 5. **Dense-path specialist** (model-switch poisoning HIGH, fusion inversion, dispose leak, retry storm → all fixed) · 6. **Concurrency auditor** (boot-crash race HIGH, stale-config prune race, non-atomic config writes → all fixed; confirmed sessions/dwell/backup semantics sound) · 7. **Docs/spec conformance** (10 wording overclaims → all corrected; laws re-verified clean).

## 7. Honest remaining gaps (none silent)

- **League has zero signed tasks** → no named score can exist yet (§3.1 is the unlock).
- **Not built yet (my queue, §4):** League site/badges/box-scores/weekly-rerun CI, dashboard, OpenClaw allowlist writer, receipt token/$ measurement, HTTP backends (+`http_5xx` class, so one Sixth-Man trigger from the spec is inert), roster-cache TTL, adaptive engagement rule, health checks, `combine self`, Lab-priors file, description expansion.
- **By design (dormant):** ε-exploration (schema + exclusions exist; the challenger-slot mechanism itself is deliberately unbuilt until post-launch opt-in), telemetry upload (consent flag only — no event builder or endpoint exists at all), auto-Sixth-Man, Bradley-Terry.
- **Minor known:** non-Latin lexical tokenizer, `need_vec` growth unbounded, symlinked skill dirs skipped, sync strips config comments while synced (eject restores them).

## 8. Evidence & repo map

`docs/verification/`: `*-m0-e2e.md` (real-server E2E) · `*-dense-live.md` (MiniLM + OATS live) · `*-gemma-live.md` (serve-level Gemma) · `*-filesystem-lab-results.json` (8/8). Docs: README · PROVENANCE · telemetry-schema · methodology v0.1 — all audited for truthfulness this sweep.

```
packages/{shared,coach,playbook,router,cli,combine} · suites/filesystem · docs/
```

Run it: `pnpm install && pnpm test` (92 green) · `node docs/verification/e2e.mjs` · `node docs/verification/dense-live.mjs`.
