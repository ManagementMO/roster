# Roster — status & decision board for Mo

> **Single source of truth for where the project stands, what's left, and what awaits YOUR decision.** Last full update: **2026-07-06** (after: the 16-charter experiment swarm → three fix-wave rounds → an adversarial meta-review of my own fixes → League site build+redesign → `apps/` restructure → full CI/CD overhaul). Read top to bottom; **§2 and §3 are yours**, **§4 and §7 are the deep "what's left" map**.
>
> **What changed since the 2026-07-04 update:** 92→**161 tests**; the swarm ran (100 findings) and **all three fix rounds landed** (round 1 = swarm bugs, round 2 = bugs I'd introduced + gaps I'd missed, round 3 = the deferred items worth fixing) — each mutation-verified; the **League site** was built and redesigned (`apps/league`); the frontend moved to its own **`apps/` tier**; and CI went from "runs unit tests" to a **real 9-job validation pipeline**. **2026-07-07:** an independent clean-room re-review (Fable 5) of my own fix rounds surfaced 7 findings (DEF-1…7) — all fixed and locked; record in `docs/lab/fixes-applied.md` (Round 4c). Nothing published, registered, or public.

---

## 1. TL;DR — where we are

**The M0+ core is built, reviewed to a high bar (7 build waves + a 16-agent swarm + an adversarial meta-review + 3 fix rounds), live-verified, and green everywhere.**

| Gate | Status |
|---|---|
| Unit/integration tests | **161 passing** (mutation-checked where they lock a fix) |
| CI/CD (9 jobs) | **green** — lint · build-test (ubuntu/macos-26/windows × Node 22+24) · real-server E2E + fail-probes · Combine (matrix) · live MiniLM inference · audit + secret scan · CodeQL (gated to public) |
| Real-server E2E (fs + memory through the real binary) | **passing** (transcripts in `docs/verification/`) |
| Combine vs real filesystem server | **8/8, deterministic** — and the fail-probes prove the verifiers *catch* wrongness (0/8) |
| Dense rung — MiniLM + Gemma live (real inference) | **verified** end-to-end; hybrid fusion signal-adaptive; OATS moves rankings from real outcomes |
| Trust laws (privacy/telemetry-off/suggest-only/eject) | **verified** by 3 independent reviewers + hostile QA + the swarm's trust charters |
| Experiment swarm (16 charters — real models/servers/processes) | **15/16 reported · 100 findings** · digest: `docs/lab/campaign-digest.md` |
| Fix waves (4 rounds) + meta-review + full-codebase audit | **DONE** — swarm bugs → my meta-review → deferred items → an independent Fable 5 audit of the whole tree (no CRITICAL; found + fixed one moat bug M1 + M2–M5/D1–D9); every real bug regression-tested; record: `docs/lab/fixes-applied.md` |

The dense-embedding path is fully implemented and live-verified on both models. The trust surfaces (config writes, sync/eject, drift, identity/routing) were hammered by the swarm, then re-audited by an independent meta-review that caught two bugs I'd *introduced* and three vacuous tests — all fixed and mutation-verified. **⚠️ One reversible policy change awaits your nod: P7.**

Nothing is published, registered, or public. Private repo: `github.com/ManagementMO/roster`.

---

## 2. ⚖️ Decision board — what awaits YOUR call

| # | Decision | Status |
|---|---|---|
| **P1** | npm package name | ⚠️ **REOPENED — the trigger fired: npm `roster` is TAKEN** (verified 2026-07-07: `roster@0.0.3`, third-party). Your resolution said revisit if taken → the fallback choice is now live: `rosterhq` · `getroster` · `roster-mcp` (my rec stands: `rosterhq`; CLI command stays `roster` regardless). Also affects the launch-day npx entry (§4F) and README install lines |
| **P2** | Strategy docs & public repo | ✅ **Resolved: everything goes public at flip time** — gated on a personal/work-info sweep first (I'll run the sweep and show you its report before any flip) |
| **P3** | When the repo flips public | ⏳ **OPEN** — you decide with me later; repo stays private until then. (No blocker on my side; the name sweep §3.2 is the gate.) |
| **P4** | Combine signing | 🔶 **Partial — awaits you.** ~15–20 min, fully prepped: `docs/signing/session-1-checklist.md` (one pass run 8/8, one fail-probe run 0/8, flip `signed:true`, log PROVENANCE). I cannot flip it myself — human-signed-only is a law; agent-signing would falsify the provenance the League sells. **THE unlock** for any named League score. |
| **P5** | Next build | ✅ **Resolved & shipped: League site** (`apps/league`, static, artifact-driven, methodology enforced in code, redesigned for readability). Next targets are in §4 for your "go". |
| **P6** | Launch-day rollout shape | ⏳ **OPEN**: one big drop · staged over 2–3 days (my rec: staged — repo+receipt day 1, League reveal day 2). Decide any time before Jul 28. |
| **P7** | Attribution policy (from the fix wave) | ⏳ **OPEN — confirm/veto.** I made input-validation rejections (`tool_fail:schema`) **non-attributable** — modern servers fold "invalid params" into an error result, so counting it would ding a tool's public score for the *agent's* malformed args (methodology §8's own principle). Output-schema drift still counts; a genuine 500 mentioning "validation" now classifies as internal (attributable). Options: **(a)** keep the blanket rule [current] · **(b)** revert, count all errors · **(c)** precise — exclude only when the failed call's args actually failed the tool's own inputSchema (more plumbing, most fair). My rec: (a) now, (c) post-launch. Reversible either way. |
| **P8** | Sixth Man: keep suggest-only, or enable the "save"? | ⏳ **OPEN — new.** Today the Sixth Man *suggests* an alternate on a hard failure (suggest-only, your D6); it doesn't auto-execute. The "watch it **save**" demo moment (DoD §7 #3) needs auto-execute. Safe middle path: auto-fire **only** when args validate against the alternate's schema **and** the tool is read-only (search/fetch/list), keep suggest-only otherwise — the killer demo without the double-write risk. Small, well-scoped build once you decide. Currently gathering `taken` field-data to justify it. |

*Reply in shorthand any time — e.g. "P3 ~1wk early, P6 staged, P7 a, P8 safe-auto" — and I'll execute.*

---

## 3. 🧍 FOUNDER-ONLY TASKS (nobody else can do these)

1. **Signing session #1 (~15–20 min now).** `docs/signing/session-1-checklist.md`: one command runs all 8 pass cases (8/8), one runs 8 ready-made fail probes (each must FAIL — proving verifiers catch wrongness, and CI now enforces this too), then flip `signed: true` and log a PROVENANCE entry (template included). **THE unlock** — until then `signedWilsonLb` is n=0 and the League may not publish a single named score. *(The Combine verifiers were specifically hardened before this session — dir-vs-file, macOS case/NFD — so a sign can't bless a false verifier.)*
2. **Name clearance sweep (~30–60 min).** npm / GitHub org / domains (`getroster.dev`, `roster.tools`) / @handle / USPTO glance. **Blocks anything public (gates P3).**
3. **SaaS test accounts (optional, ~1–2h).** Fresh Gmail/Slack/Notion orgs unlock those Combine divisions; launch is honest without them.
4. **Early testers (launch week).** 3–5 OpenClaw/Cursor power users from your network.
5. **PROVENANCE review log.** The "built with agents, reviewed by hand" page has an empty human-review table — your first entries (eject path, credential passthrough, telemetry, attribution policy P7) make the provenance story real. Folds into the signing session.

---

## 4. 🔧 THE PIPELINE — my ready queue (zero input needed; building on your "go")

**Fix waves: ✅ DONE** (3 rounds + meta-review; `docs/lab/fixes-applied.md`). Everything below is what remains between the verified core and the full `ROSTER.md` launch product, ordered by launch-leverage. Each is scoped and buildable without you (except where it needs a signed suite or a decision).

**A. Complete the League (highest launch-leverage after your signing):**
- **Static badges service** — signed SVG performance shields keyed to server ID (the truest distribution metric; README-embeddable).
- **Box-score enrichment** — deltas/upsets/streaks, All-Star teams, Benched list, Sixth Man of the Week, Rookie of the Year (the content artifacts that travel).
- **Weekly-rerun CI** — the League's "continuity is the product" promise: scheduled Combine reruns updating standings.
- **More Combine suites** — memory, git, sqlite (drafted; each is one line in the CI matrix now — the harness is already data-driven). Each needs your signing to publish named scores.
- **`combine self`** — first-class author self-run ("run yours, not ours").
- **Draft-utilization harness (M6, handoff M1 milestone)** — measure whether agents actually cooperate with draft/call across the real clients (Claude Code / Codex / Cursor / OpenClaw); the five-mode UX bet and the launch GIF ride on this. Restored to the plan by the 2026-07-07 audit; needs real clients (some founder/tester involvement).

**B. The day-one hook (§7.7 of ROSTER.md — makes install irresistible):**
- **Flight-recorder dashboard** (`roster dashboard`) — local view of every tool call across all agents: what ran, failed, is slow, changed (the pi-hole pattern). *Utility #4 in the day-one stack; not built.*
- **`roster bench`** — 60-second self-proof: three sample tasks raw-config vs Roster on the user's own machine, prints the token/latency/hit-rate diff. Second shareable artifact.
- **Receipt depth + identity layer** — per-serve token measurement + $ estimate; then the Wrapped mechanics: **archetype** ("Tool Hoarder"), **percentile**, `--roast` flag, quarterly "Season Wrapped". *(Owner-tiered P2/P3 — nice-to-have, not launch-blocking, but high virality.)*
- **Drift alarms as personal utility** — the local "GitHub changed 3 tool schemas overnight" notification (detection exists via connect-time hashing incl. outputSchema; the *personal notification surface* isn't built).

**C. Adoption surfaces (frictionless install):**
- **`configs/` per-platform templates** + one-click deeplink badge generators (Cursor `cursor://…`, VS Code `vscode://…`) — the context-mode lesson.
- **`examples/`** — claude-code, codex, openclaw, hermes, cursor, gemini-cli, langgraph starter configs.
- **OpenClaw skills-allowlist writer** — Roster writes their per-agent allowlist (their #1 pain; formula already implemented, the *writer* isn't).

**D. Router/Coach depth (correctness & reach):**
- **Streamable-HTTP transport** — currently **stdio only** (url backends stubbed as post-launch). ROSTER.md §7.1 calls agnosticism a "design law" and names stdio **+ HTTP**; this is the gap between "works on most clients" and "literally universal." Includes HTTP backends + the `http_5xx` outcome class (one Sixth-Man trigger from the spec is inert until this lands).
- **Lab-priors seeding** — new installs seeded with public-Lab priors so day-one routing is smart (the network-effect flywheel). File format + loader not built.
- **Adaptive engagement (~10K rule)** — auto transparent-below-10K-tokens / five-above (Anthropic's own guidance). Currently mode is manual (`--five`), not auto.
- **Router niceties** — roster-cache TTL (`ttlMs`/`cacheScope`), backend health checks, document expansion (synthetic per-tool queries for retrieval lift).

**E. By explicit decision (see §2):** P8 Sixth Man auto-save; P7 precise-attribution (option c).

**F. Launch mechanics (day-of checklist, small but must not be forgotten):** launch assets (GIFs, exposé, posts) · at publish, flip the no-global sync entry from the execPath form to `npx -y <published-name> serve` (one line in `sync.ts`; blocked on P1's name) · update README install lines to the published name · pin the TruffleHog CI step to a tagged version · flip repo public (P3) → CodeQL auto-activates.

---

## 5. What works today (all verified; evidence in `docs/verification/` + `docs/lab/`)

- **Router, transparent mode:** fronts real servers simultaneously, namespaced re-export, byte-faithful passthrough (protocol *and* transport errors surface exactly as a direct connection would — a crashed server is now correctly `transport`, re-arming the Sixth Man), outcomes recorded, secrets provably never persisted.
- **Router, five mode:** `draft`/`call` with `draft_id` attribution; mixed tool+skill starters; never-empty drafts (rated fallback with a lexical floor so the worst genuine hit isn't dropped); Sixth Man **suggestions** (suggest-only, logged with taken-tracking).
- **Coach:** classifier (exact spec precedence; input-validation carved out per P7) · FTS5 with stopword filtering + camelCase splitting + signal-adaptive hybrid fusion (0.15/0.85) · OATS (live-proven) · Wilson ratings (per-category filtered; stale ratings expire) · nightly job at serve boot (debounced ~20h) · drift quarantine with 24h dwell + stable-re-sight auto-clear + **remove/re-add tombstone** (a removed-then-changed tool can't evade drift) + outputSchema in the drift hash · model-switch guard · multi-process safe (immediate transactions, busy-wait, prune grace window, connect timeout).
- **Playbook:** SKILL.md discovery/parse (full-body indexing, BOM-safe) · trust scan v0 (now scans description + bundled-script contents, bounded read) · OpenClaw exact injection-cost formula · universal skill-as-tool bridge.
- **CLI:** `init` (10 client formats, platform-aware, verified on 3 OSes) · truthful client-aware receipt · `sync`/`eject` (byte-for-byte, era-aware, integrity-checked, **atomic private-tmp writes**, corrupt-manifest refusal, atomic backup-dir) · `serve` (bounded backend connect) · `telemetry` · `combine run` · `unquarantine`.
- **Combine:** declarative end-state verifiers (dir-vs-file distinct; byte-exact names — macOS case/NFD-proof) · sandbox containment · connect timeouts · per-side OATS caps · `lab-results.json` with `environmentDigest` + **`signedWilsonLb`** (the only stat that may back a named score).
- **League site (`apps/league`):** static generator from `lab-results.json` — standings + box scores, methodology enforced in code (no rank below 30 signed tasks, PRE-SEASON state, strict artifact schema, escaping), redesigned for readability. Generates in CI on every push.
- **CI/CD:** 9-job pipeline (see §1) — modular (composite setup action), data-driven (matrix suites), future-proof (Node engines-floor test, Dependabot with majors split out), injection-safe.

## 6. Review record (velocity-discipline law — every accepted finding fixed with a regression test)

- **Waves 1–7 (build):** 2 overnight code reviews (4 CRITICAL + 9 MAJOR) · functional QA (empty-draft bug) · clean-code sweep · dense-path specialist (model-switch poisoning) · concurrency auditor (boot-crash race) · docs/spec conformance (10 overclaims).
- **Wave 8 — the experiment swarm:** 16 charters, real models/servers/processes, 100 findings (`docs/lab/campaign-digest.md`).
- **Wave 9 — fix rounds 1–3:** round 1 applied the real swarm findings; **round 2 was an adversarial meta-review of round 1** that caught two bugs I'd *introduced* (Ajv over-strip, unbounded script read) + two gaps I'd missed (serve connect hang, output-schema drift) + **three vacuous tests**; round 3 finished the deferred list (remove/re-add tombstone, atomic backup-dir, testable transport-death mapping). The three rebuilt tests are **mutation-verified** — each fails when its fix is reverted.

## 7. Honest remaining gaps (nothing silent)

**Against `ROSTER.md` §15's own "Definition of done for v1" (the acceptance test) — 2 of 4 met:**
1. Replace N `mcpServers` with one → ✅ (`sync`).
2. ≥80% context reduction on 50+ tools → ✅ measured −84.3% on real servers.
3. Watch one **Sixth Man save** → 🔶 it *suggests*, doesn't auto-rescue (P8).
4. Find a favorite server on the League with an honest score → ❌ **PRE-SEASON** until your signing (§3.1).

**Not built yet (the pipeline — full list in §4):** League badges/box-scores/weekly-rerun, more suites, flight-recorder dashboard, `roster bench`, receipt archetype/percentile/roast/Wrapped, `configs/` templates + deeplink badges, `examples/`, OpenClaw allowlist writer, streamable-HTTP transport (+`http_5xx`), Lab-priors seeding, adaptive ~10K rule, roster-cache TTL, health checks, document expansion, `combine self`.

**By design (dormant until post-launch / opt-in):** ε-exploration challenger slot (D7, schema+exclusions exist, mechanism deliberately unbuilt) · telemetry upload (consent flag only — no event builder or endpoint exists) · auto-Sixth-Man (D6 → P8) · Bradley-Terry / Arena-Rank graduation (traffic-gated) · Street telemetry board (pipeline before table).

**Disclosed edge cases (surfaced by the meta-review; low severity, reasons in `docs/lab/fixes-applied.md`):**
- Sequential divergent-boot prune — `keepSeenSince` covers the transient overlap; a fully sequential two-`serve` race isn't covered (real risk low: `roster.json` is one shared file). A correct fix needs cross-process liveness (IPC) — disproportionate.
- Prune de-suffix over-protection — protecting base `x` also shields a genuinely-removed `x-2` (safe direction: never wrongly delete).
- camelCase index on upgrade — the split re-indexes added/drifted tools; an existing DB heals on the next drift (moot pre-launch, no installs).
- Dead runtime `schema_drift_suspect` — harmless; connect-time `defHash` (now incl. outputSchema) is the real drift mechanism.
- Trust-scan false positives (~33%, advisory-only) and base64-exec-inside-a-script (deliberately not scanned — too noisy on real code).

**Disclosed by the deep-review audit (2026-07-07; fixes + reasons in `docs/lab/fixes-applied.md` Round 4):** local quarantine lifts on a 24h dwell not a re-Combine, and a re-signatured tool inherits its predecessor's local rating/OATS state (methodology §6; published League scores unaffected — they re-verify) · praise-asymmetry is enforced by the human publishing gate, not code, and `signed:` is process-trust not cryptographic (v1, said out loud) · `trimSchema` depth-1 is a deliberate token/structure tradeoff · Ajv dialect false-negatives in `args_compatible` (suggest-only, advisory) · boot-order suffix identity for post-sanitization name collisions (exotic) · `markSuggestionTaken` overcounts P8 field-data on any later same-tool call · default-Gemma ~1.7–1.9 GB RSS per five-mode session · **M6: the draft-utilization harness (handoff M1 milestone) is unbuilt — restored to §4 tracking, needs real clients.**

**Minor known:** non-Latin lexical tokenizer · `need_vec`/tombstone growth unbounded (tiny) · symlinked skill dirs skipped · sync strips config comments while synced (eject restores them) · `schema_version` written but no migration reader yet · TruffleHog CI step installs latest (unpinned) rather than a tagged version.

## 8. Evidence & repo map

`docs/verification/`: `*-m0-e2e.md` (real-server E2E) · `*-dense-live.md` (MiniLM + OATS) · `*-gemma-live.md` (serve-level Gemma) · `*-filesystem-lab-results.json` (8/8).
`docs/lab/`: `campaign-digest.md` (100 swarm findings) · `fixes-applied.md` (all 3 fix rounds + disclosed gaps) · `corpus.mjs`/`needs.mjs`/`metrics.mjs` (shared experiment fixtures).
`docs/signing/`: `session-1-checklist.md` · `fail-probes.yaml`.
Docs: README · PROVENANCE · telemetry-schema · methodology v0.1 — all truth-audited.

```
packages/{shared,coach,playbook,router,cli,combine} · apps/league · suites/filesystem
docs/{verification,lab,signing} · .github/{workflows/{ci,codeql}.yml, actions/setup, dependabot.yml}
```

Run it: `pnpm install && pnpm test` (**128 green**) · `pnpm lint` · `node docs/verification/e2e.mjs` · `node docs/verification/dense-live.mjs` · `pnpm league:build`.
