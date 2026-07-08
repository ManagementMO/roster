# League methodology — v0.1 (DRAFT)

> **Status: draft skeleton, pre-launch.** This document describes the methodology the League will launch with. It is versioned; published standings will always cite the methodology version that produced them. Sections marked **(implementation pending)** are committed design, not yet running code. No results exist yet, and no number in this document is a measurement — the constants here (z, thresholds, windows) are policy choices, stated so they can be argued with.

## 0. Principles

- **No fabricated numbers, anywhere, ever.** Every public stat traces to a run artifact (`lab-results.json`); sample size *n* and confidence intervals are always shown.
- **Only human-signed tasks feed named scores** (§4).
- **Praise asymmetry at launch** (§5): named recognition first, named criticism only after due process.
- Methodology changes are versioned and announced before they take effect.

## 1. Ranking key: Wilson score lower bound

Within a category, servers (and skills) rank by the **lower bound of the Wilson score interval** on task success rate, with z = 1.96 (95%):

```
wilson_lb = ( p̂ + z²/2n − z·√( p̂(1−p̂)/n + z²/4n² ) ) / ( 1 + z²/n )
```

where p̂ = successes / n over the category's signed task set. (Run artifacts also carry an all-tasks Wilson for internal/anonymized use — `signedWilsonLb` is the only figure that may back a named public score.)

Reference: Evan Miller, *How Not to Sort by Average Rating* — <https://www.evanmiller.org/how-not-to-sort-by-average-rating.html>

Why this key: it is humble with small samples by construction — a perfect score on a handful of tasks cannot outrank a near-perfect score on many. Standings additionally require a minimum of **n ≥ 30 tasks** per (server, category) before a ranked placement appears; below that, profiles show raw results without a rank. Badge tiers key off Wilson LB; tier cutoffs will be published in this document when set. **(implementation pending)**

## 2. What *n* counts

**n = distinct human-signed tasks — never repeat runs.** Weekly reruns update each task's current pass/fail state and its history; they do not multiply the sample. A Wilson interval computed over rerun volume of a fixed deterministic suite would be pseudo-statistics — the interval here quantifies breadth of verified task coverage, and is labeled as such.

## 3. Evidence tiers

Every published number carries its tier.

- **Lab (controlled).** Results from the Combine: standardized, category-specific task suites, identical for every server in the category. Write-capable suites run **only** against sandboxed self-hosted instances (per-server docker-compose environments, seeded to a known state). Read-only live suites (search/fetch/list) may probe live endpoints at most once per server per week, with an identifiable User-Agent and opt-out honored. Verification is programmatic state checking — declarative end-state verifiers (file-equals/contains/exists/absent, result-contains) evaluated by the open-source runner; no LLM judge. Script-based verifiers may be added later behind review. Every result pins its suite version and environment digest, and the harness is open source, so third parties can reproduce runs (a first-class `roster combine self` for authors is planned).
- **Street (observational).** Opt-in, k-anonymous field telemetry (schema: [telemetry-schema.md](telemetry-schema.md)): in-the-wild outcome classes, latency buckets, drift incidents, usage share. Always labeled observational; never mixed into Lab standings. Publishes only past **≥5 distinct installs and ≥200 calls per (server, category)**. The pipeline ships before the table: the public Street table activates only when real data crosses those thresholds. **(implementation pending)**
- **Universal protocol checks.** Baseline conformance checks every listed server runs regardless of category: transport behavior, handshake, schema validity, error semantics. **(implementation pending)**

## 4. Provenance: signed vs. unsigned

Every task carries a public provenance flag.

Certification pipeline: (1) an agent drafts the task and its verifiers; (2) a second, adversarial agent attacks it — wrong-field checks, false-pass and false-fail hunting; (3) the verifier is mutation-tested against seeded known-bad sandbox states and must catch them all; (4) a human certifies it — runs the pass case, forces a fail case, confirms the check matches the server's real semantics — and the task becomes `signed: true`.

**Only human-signed tasks feed named public scores.** Unsigned tasks may run for internal or anonymized aggregate statistics only. Coverage never outruns signing: if signing lags, the League is smaller, not looser.

## 5. Praise asymmetry at launch

- **Named at launch: top tiers only.** Strong performers are named; everyone else appears inside anonymized distribution statistics (the shape of the field, not names).
- **Author reply window.** Before any below-top-tier named publication, the server's author receives the full results with reproduction instructions and a **14-day reply window**. Named-bottom placements happen only after that window has run — never on day one.
- Server authors will be able to run the exact suites themselves before and after listing (a dedicated `roster combine self` is planned; today `roster combine run` works against any server).

## 6. Drift events

Roster hashes each tool's (name, description, inputSchema, **outputSchema**, body) at every connect. A change raises a **drift event**: the affected tool/server is quarantined from default rosters pending a re-run of its Combine suite, and the event enters the server's public drift history. A dedicated drift column in League standings follows. **(implementation pending)**

Connect-time hashing is the reliable drift mechanism — including for output-schema changes, since the MCP SDK validates structured output itself and throws before Roster could observe a runtime mismatch. A tool that is fully *removed* and later *re-added* with a changed definition is **still caught**: a tombstone (`removed_capability`) carries the last-seen hash forward across the removal, so the re-add raises a drift event and re-quarantines rather than slipping in as new. An interrupted quarantine dwell is likewise preserved across a remove/re-add.

**Two honest v1 limitations of the local quarantine** (the public League re-verifies independently, so these affect the local router's default rosters, not published scores): (1) a local quarantine currently *lifts on a 24-hour stable-re-sight dwell*, not on a completed re-Combine — the "pending re-Combine" language above describes the League gate, which is human-signed and separate; a `roster combine self` gate on local un-quarantine is planned. (2) Drift is tracked per capability *id*, so a tool that changes its entire signature but keeps its id inherits its predecessor's local rating and OATS-refined vector until fresh outcomes and the nightly job move them (the base vector re-embeds immediately; the learned `adj` overlay decays over the 90-day outcome window). Both are disclosed rather than silently carried.

## 7. Suite versioning & seasons

- Suites are versioned; every published result pins (suite version, environment digest). Changing a suite bumps its version.
- **Seasons** are quarterly rating epochs. Each season rotates in a **held-out task set** — tasks not previously published — to resist teaching-to-the-test; rotated-out tasks are published after retirement. **(implementation pending)**
- Standings state which methodology version and suite versions produced them.

## 8. Attribution fairness

Ratings use only tool-attributable outcome classes: transport/protocol failures, tool-reported errors (`isError`), and output-schema drift suspicion. Agent-side confusion — e.g. the agent re-calling a tool with adjusted arguments — is a local routing signal, never a League stat. Rationale: most in-the-wild task failures are agent-cognitive rather than tool faults ([MCP-Atlas](https://arxiv.org/abs/2602.00933) attributes 63.3% of failures to agent cognition), and a tool must not be punished for its caller's plan.

**Input-validation rejections are explicitly non-attributable** (added after empirical review, 2026-07-04). Modern MCP servers fold JSON-RPC `-32602 Invalid params` into an `isError` result, so a tool rejecting the *caller's* malformed arguments would otherwise land as an attributable `tool_fail:schema` row and depress the tool's public Wilson score for the agent's mistake. Roster therefore treats `tool_fail:schema` as a local routing signal only, never a League stat. This also holds on the RAW wire (amended 2026-07-07): a legacy server that returns a plain JSON-RPC `-32602` instead of folding it into `isError` is likewise non-attributable, so a tool's fairness never depends on its SDK vintage. The distinction is directional: **input** validation failure = caller's fault (excluded); **output** schema drift (`schema_drift_suspect`) = the tool's fault (attributable). Error-text kind labels (auth/quota/schema/…) are best-effort heuristics for display; the precise attribution fix — checking the failed args against the tool's own inputSchema (P7 option c) — is post-launch.

## 9. Skills Division

Skills rank with the same math — Wilson LB over distinct signed tasks — in their own division. No skill is listed before passing the Trust scan (description-poisoning heuristics, script static-scan, provenance flags). Launch-depth verification is structural + safety + behavioral; task-depth suites grow weekly under the same signing rule. **(implementation pending)**

## 9a. Retrieval & learning — measured limits (honest scope)

The routing ladder was benchmarked live against a 133-tool corpus over 66 ground-truthed needs (real MiniLM + Gemma inference, 2026-07-04; artifacts in `docs/lab/`). What the numbers actually say, stated so they aren't oversold:

- **Hybrid fusion weights are 0.15 lexical / 0.85 cosine.** Quality rose monotonically with cosine weight and plateaued near lex 0.1–0.15; a small retained lexical weight beats pure cosine (it breaks ties on verbose/typo needs). Hybrid beats lexical-only by ~15 points hit@1/hit@5/MRR.
- **The cosine-span abstain gate is a tiny-roster floor, not a production noise filter.** It only fires on degenerate small candidate sets (a handful of tools); at realistic scale the observed span never drops near the threshold, and it does not reject Gemma's confident-looking gibberish (whose noise geometry also clears the threshold). It is cheap and harmless, not a safety guarantee.
- **OATS is single-centroid and success-dominant by design.** It refines a tool's vector toward the need-shapes it succeeded on, replacing the base once ≥4 attributable successes exist. Consequences, accepted for v1: learning saturates at a small outcome count; a tool used for two orthogonal purposes is pulled toward whichever it succeeds at more (no per-mode vectors); negative (failure) evidence moves rankings weakly. Per-mode / multi-centroid refinement and stronger negative weighting are post-v1 work. OATS never runs on non-attributable rows, so the input-validation exclusion in §8 also protects it from mislearning on caller-side errors.

## 10. Beyond v0.1 (explicitly not in v1)

- **Bradley-Terry / Arena-Rank graduation:** synthetic pairwise matches derived from routing counterfactuals ("A ranked over B for the same need; A succeeded"), with bootstrap confidence intervals — gated on traffic density. **(implementation pending)**
- Community-contributed suites, admitted under the same certification and signing bar as first-party tasks. **(implementation pending)**
