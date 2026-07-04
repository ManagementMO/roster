# Roster — build status for Mo

> Written overnight, 2026-07-04. Read this first when you wake up.

## TL;DR

The **M0 core of Roster is built, tested, adversarially reviewed twice, functionally QA'd, and pushed** to `https://github.com/ManagementMO/roster` (private). It's a working local-first MCP tool router: it fronts real MCP servers, serves tools in transparent or five-mode, learns-ready (OATS + ratings wired), routes skills, audits your configs, and safely syncs/ejects them. **85 unit/integration tests pass, the real-server end-to-end suite passes, and the Combine scores the real filesystem server 8/8 deterministically.**

Nothing is published to npm, no domains/handles registered, nothing is public — exactly per the laws. This is a private repo with a clean foundation to keep building on.

## What works today (verified, not asserted)

Every claim here has evidence in `docs/verification/`:

- **The router (transparent mode):** fronts real `@modelcontextprotocol/server-filesystem` + `server-memory` simultaneously, re-exports their tools namespaced (`filesystem__read_text_file`…), passes calls through byte-faithfully, and records outcomes. Verified: tool-list parity vs a direct connection; a written secret never appears in the database (privacy law holds).
- **The router (five mode):** exposes exactly `draft` + `call`; `draft("read a file")` ranks the right tools across servers and returns a `draft_id`; `call` executes; drafts are **never empty** even for paraphrased needs offline (graceful fallback); Sixth Man returns a *suggestion* on failure and never auto-fires a second tool.
- **The Coach:** SQLite store, the 5-rule outcome classifier (exact spec precedence), FTS5 lexical search + hybrid-fusion hook, OATS nightly refinement (pure-function, tested against synthetic vectors), Wilson ratings, drift detection with quarantine + auto-clear, and a lazy transformers.js embeddings provider (RAM-auto-select Gemma/MiniLM, idle-unload, 256-dim Matryoshka). ε-exploration is present but **OFF**.
- **The Playbook (skills):** discovers `SKILL.md` libraries across sources, parses full bodies (indexed whole — the SkillRouter finding), a trust-scan v0 that flags poisoning/injection patterns, the exact OpenClaw injection-cost formula, and the universal skill-as-tool bridge.
- **The CLI:** `init` (imports from **all 10 client formats** — Claude Code/Desktop, Cursor, Codex TOML, Gemini, Hermes YAML, OpenClaw, VS Code, Windsurf, Zed — and prints the truthful client-aware Day-0 receipt), `receipt`, `sync`/`eject` (byte-for-byte, backup-protected, era-aware), `serve`, `telemetry`, `combine run`.
- **The Combine:** declarative end-state verifiers, a per-task sandboxed stdio runner, `lab-results.json` with Wilson + signed/unsigned separation. The filesystem suite (8 tasks) scores the real server 8/8, twice, identically.
- **CI:** GitHub Actions across ubuntu/macos/windows (typecheck + test + build); the pnpm-version and Node-24 issues you flagged are fixed.

## The trust laws — all upheld and verified

- **Privacy:** args/results/prompts are never persisted or logged — only SHA-256 hashes. Confirmed by dumping the DB after a call with a known secret.
- **Telemetry:** OFF by default, opt-in only, and there is **zero** network-call code anywhere in `packages/*/src` (grep-verified by two reviewers). No upload endpoint exists.
- **Sixth Man:** strictly suggest-only — exactly one backend call per five-mode call, proven.
- **Eject:** restores the pristine pre-Roster config byte-for-byte; refuses to clobber post-sync edits without `--force`; survived hostile multi-sync/tamper/delete testing.

## How it was reviewed (per the velocity-discipline law)

Four independent Fable 5 agents, adversarial — every finding fixed with a regression test:
1. **Code review round 1** → 4 CRITICAL + 9 MAJOR (commit `e2f1759`). Standouts: the Claude Code config path was wrong (`~/.claude.json`, not `settings.json` — verified on a live machine, handoff §8 amended); an FTS bug that promoted the *worst* match to rank 1; a sync-eats-servers eject flaw.
2. **Code review round 2 + functional QA** → 2 MAJOR regressions (eject era-crossing data loss; prune-on-outage deleting learned state) + the flagship "empty draft in offline mode" bug. All fixed (wave 2).
3. **Clean-code sweep** → verdict: *"clean, professional, public-ready code."* One substantive item — the learning loop was implemented but never invoked — plus polish. All actioned (wave 3): **the Coach's nightly job is now wired into `serve` boot**, so ratings + OATS actually run on your outcomes; dead code deleted; `roster unquarantine` added; config-parsing hardened; docs de-overclaimed.

Every fix has a regression test. The reviews' transcripts informed the commit messages so the history is auditable.

## What is deliberately NOT done yet (honest gaps)

These are M1–M2 scope or documented deferrals — none are silent:
- **Dense retrieval end-to-end at runtime:** the provider and ladder are wired and unit-tested, but a full first-run model-fetch → backfill → hybrid-draft cycle hasn't been driven end-to-end (offline lexical mode is fully working and is the honest launch default). *This is the single integration not yet exercised live — it's the first thing to do tomorrow.*
- **Ratings surfacing:** the nightly job now runs and populates the ratings table, but nothing user-facing reads it yet (the dashboard and League site are M2).
- **Combine breadth:** one real suite (filesystem, 8 tasks, **unsigned**). The verifier-certification protocol (agent-draft → adversarial-attack → mutation-test → **your** signature) is specced but no tasks are human-signed yet — so nothing may feed a named public score. Scaling toward ~100 servers is the big founder-hours item.
- **League site, badges, box-score generator, weekly-rerun CI:** not built (M2).
- **Not built (as planned):** roster-cache TTL, adaptive ~10K-token engagement rule, backend health-checks/lazy-connect, OpenClaw allowlist writer, per-serve schema-token measurement on the receipt, dashboard.
- **Minor known items** (documented, deferred-safe): non-Latin lexical tokenizer, `recomputeRatings` category param is dormant, symlinked skill dirs skipped.

## Where to pick up tomorrow

Suggested order:
1. Skim the clean-code sweep output (if it committed anything) and this repo's `git log`.
2. Drive the dense-embedding path end-to-end once (drop `ROSTER_NO_FETCH`, run `roster serve`, watch the model warm and drafts sharpen) — the one integration not yet exercised live.
3. Start the Combine breadth work: add 2–3 more self-hostable suites (memory, git/Gitea, sqlite) and do the first **human-signed** certification pass — that's the gating founder-hours activity for the League.
4. Then M2: the League site that renders `lab-results.json`.

## Repo map

```
packages/shared    types, namespacing, Wilson math, token estimate
packages/coach     SQLite store, classifier, retrieval ladder, OATS, ratings, embeddings
packages/playbook  SKILL.md scan/parse, trust scan, skill-as-tool bridge, OpenClaw cost
packages/router    BackendManager + RosterServer (transparent + five modes)
packages/cli       roster init/receipt/sync/eject/serve/telemetry/combine
packages/combine   declarative verifiers, sandboxed runner, lab-results
suites/filesystem  the first Combine suite (8 tasks, unsigned)
docs/verification  the real-server e2e transcript + lab-results evidence
docs/              PROVENANCE, telemetry-schema, methodology (v0.1 draft)
```

Run it yourself: `pnpm install && pnpm test` (85 green), then `node docs/verification/e2e.mjs` for the real-server proof.
