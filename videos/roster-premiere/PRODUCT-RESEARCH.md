# Roster: the product story behind this film

Research date: 2026-09-07. Local baseline: `main` at `f50e873d92e062e976ffeab8173ca3d2ffefc078`. The working directory already contained modified package files and several untracked film experiments. The Premiere production is isolated in this directory. The public GitHub README was also inspected; it contains newer wording than this local checkout. No pull, reset, rebase, config sync, or user-state operation was performed.

## The useful thesis

Roster makes an agent's tool collection act like a team. Its memorable hook is already in the README: “Your agent has 200 tools. Only five get to start.” The mechanism gives that line substance: a stable MCP interface drafts a small task-specific set, invokes the selected capability, and records derived outcomes locally so future routing can improve.

The 200 is a framing example, not a measured installed-tool count. Five is the default maximum in opt-in five mode, with K configurable from 1 to 10. The implementation does not replace the model's judgment; the agent still chooses which drafted capability to invoke.

## End-to-end mechanism

1. `packages/cli` discovers supported configuration files, imports command-backed MCP servers, and owns sync/eject with backup protections. `serve.ts` starts the local stdio endpoint and connects command-backed backend servers. URL-only backends are explicitly not supported by this local version.
2. `packages/router/src/backends.ts` lists tools, namespaces their names and forwards calls. Transparent mode re-exports tools and preserves protocol metadata and errors.
3. In five mode, `RosterServer.listTools()` exposes `draft` and `call`. `handleDraft()` validates the natural-language need, asks the Coach for ranked candidates, caches the draft identity and returns compact capability cards.
4. `handleFiveCall()` invokes the named backend or returns a skill's instructions. `draft_id` associates the call with the correct draft. It records an outcome classification and latency, rather than claiming every valid tool response means the user's overall task is solved.
5. `packages/coach` stores local capability definitions, derived call evidence, ratings and retrieval state. Lexical retrieval works without an embedding download. Optional dense retrieval upgrades candidate ranking when ready. Opportunistic maintenance recomputes ratings and adjusts tool vectors from outcomes; this is not instantaneous model retraining after each click.
6. A qualifying hard failure can carry a Sixth Man suggestion. Roster does not execute that alternate. This is a useful longer-demo story, but would distract from the 30-second core narrative.

## The other two product pillars

The Playbook indexes approved SKILL.md instructions alongside tools and serves their text through the same interface. A skill being returned successfully is not treated as proof that the skill solved the task. Trust checks withhold review-flagged skills by default.

The Combine executes declarative task suites and emits result artifacts. The League builds static standings from those artifacts with methodological eligibility requirements. Its current data remains pre-season; the film therefore contains no invented public ranks, scores or endorsements.

## Claims used on screen

| Film claim | Evidence | Boundary |
| --- | --- | --- |
| Only five get to start | `RosterServer` default K=5; `DRAFT_TOOL`; `clampK` | Opt-in five mode; returns up to K, not always exactly five |
| One task, the right tools | `handleDraft`, `CoachStore.draftCandidates` | A routing objective, not a perfect accuracy guarantee |
| Make the call | `CALL_TOOL`, `handleFiveCall`, `BackendManager.call` | The shown Playwright request is an illustrative API workflow |
| Result returned | Backend MCP response passthrough | A page snapshot returned, not “bug fixed” or task success |
| Learns what works | `record`, `runMaintenanceIfDue`, ratings and OATS | Derived outcome evidence, opportunistic maintenance |
| On your machine | Local SQLite store and local routing maintenance | Third-party backend tools may still make their normal network requests |
| One local endpoint | `serve` stdio transport and router | Compatible MCP clients launching a stdio process |
| Open source, pre-release | MIT license, current public README | No working npm install command or release date promised |

## Fresh validation

The focused router and Coach suites passed: **57 tests across 2 files**, run under the already-installed Node 24.14.1 runtime. They cover routing, mixed tool/skill drafts, call attribution, outcome recording, suggestion-only alternate behavior, trust gates and Coach state handling. The first attempt used the shell's Node 22 and failed because the existing better-sqlite3 binary was compiled for Node 24; selecting the matching installed runtime resolved this without rebuilding dependencies or changing product code.

This is local automated evidence. It does not certify the release, all client integrations, production accuracy, or a live user's installed tools. The film's illustrated workflow is not presented as a screen recording.

## Production decisions

The earlier film experiments were inspected for useful assets and existing identity. The current white diagonal mark is preserved. The old generic asterisk and older multicolor R mark are not used in this new cut.

The six beats follow one causal story: crowd → five → task-specific draft → call and response → local learning → identity. Dense implementation facts are kept in this document so the viewer can understand the film on first viewing.

HyperFrames was selected after checking current HyperFrames, Remotion and Higgsfield documentation. For this film, exact editable type and API details matter more than photographic footage. HTML/CSS with paused GSAP timelines offers precise seeks and reusable local assets; generative video would not add a necessary element to the concept. No cloud video generation or paid upgrade was needed.

The first HeyGen catalog music candidate was measured at roughly 105 BPM with a quiet opening. The existing licensed Mixkit track has a much stronger immediate rhythmic pulse around 125 BPM. The final bed uses that track with a small tempo adjustment to the 128 BPM edit, plus sourced tactile effects. Audio measurements and visual inspection are recorded separately; no human listening approval is claimed.

## Research sources

- Local repository: `README.md`, `STATUS-FOR-MO.md`, `ROSTER-STATE-AND-DECISIONS.md`, `packages/router/src/rosterServer.ts`, `packages/router/src/backends.ts`, `packages/coach/src/store.ts`, `packages/coach/src/db.ts`, `packages/cli/src/serve.ts`, router tests and existing film briefs/assets.
- Current public product wording: https://github.com/ManagementMO/roster (read 2026-09-07).
- HyperFrames authoring/render contract: https://hyperframes.heygen.com/introduction and https://hyperframes.heygen.com/guides/rendering, plus current Context7 `/heygen-com/hyperframes` documentation.
- Remotion local renderer and audio: current Context7 `/remotion-dev/remotion`, sourced from the official repository documentation.
- Higgsfield capability review: https://higgsfield.ai/text-to-video-ai and https://higgsfield.ai/explainer-intro.
- Music provenance: https://mixkit.co/free-stock-music/tag/technology/ and https://mixkit.co/license/; local prior asset record in `apps/launch-film-diffusion/assets/music/README.md`.
