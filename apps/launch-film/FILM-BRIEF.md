# Roster Launch Film — Film Brief

## Objective

Create a 57-second, social-first launch film that makes Roster’s core transformation legible without narration: an agent moves from an overloaded capability universe to a deliberate starting five, executes through one local router, receives a suggestion-only Sixth Man option after a failure, and feeds outcomes into the Coach and pre-season League.

## Audience

Developers building with MCP, agent-framework maintainers, server authors, and technical early adopters encountering Roster on X or GitHub. The film assumes familiarity with terminals and tools, but not with Roster’s vocabulary.

## Narrative

The camera begins inside a field of 200 capability glyphs, enters a terminal, then pulls through an increasingly congested tool universe. Roster forms as a local core that consolidates the connections, scans for task relevance, retracts rejected definitions into a distant bench, and locks five capabilities into a spatial lineup. A request completes through that lineup; a later timeout raises a Sixth Man suggestion that only connects after explicit agent acceptance. Local outcomes then flow to the Coach and an unsigned Combine result appears in the League as PRE-SEASON before the lineup converges into the Roster mark.

## Visual Direction

The film extends the existing League identity rather than replacing it: near-black surfaces and the League’s orange accent are joined by mint for Roster’s local signal, blue for selection, ivory for primary type, and red only for failures. Space Grotesk carries hero copy, Manrope carries UI, and JetBrains Mono carries commands and telemetry. All fonts are local OFL assets.

The signature device is a five-slot aperture around the Roster core. It begins as five isolated cursor marks, becomes the search geometry and starting lineup, then closes into the final mark. The world is built with crisp React/SVG/CSS 2.5D layers so terminal text stays sharp while perspective, parallax, depth blur, and connector motion create cinematic space.

## Factual Claims Shown

- Roster is a local-first MCP tool and skill router.
- Transparent passthrough is the default; five-mode exposes `draft` and `call`.
- The starting five is configurable, with five as the product default.
- Drafting uses task match and can incorporate local outcome history after the Coach’s maintenance cycle.
- Calls, outcome classes, latency, and drift signals are stored locally.
- Playbook skills join the same capability index and are trust-gated.
- On eligible hard failures, the Sixth Man is a structured suggestion. The film shows `SUGGESTED · AWAITING AGENT`, then an explicit `AGENT ACCEPTS` action before reconnection.
- The Combine runs deterministic end-state checks. The committed filesystem artifact is 8/8 but all eight tasks are unsigned, so the League glimpse is labeled `PRE-SEASON · 0/8 CERTIFIED` and carries no rank.

## Claim Boundaries and Documentation Discrepancies

- `ROSTER.md` and the build handoff describe HTTP transport, adaptive engagement, dashboard, League seasons, Lab priors, automatic Sixth Man rescue, and several launch utilities. Current status and code say these are unbuilt or future work, so the film does not present them as operating.
- Older strategy copy describes automatic failover. The binding decision and current router implementation are suggestion-only; the film follows the implementation.
- The README’s planned `npx roster init` path is not usable today because the package is unpublished and the npm name is unresolved. Product UI uses the implemented binary command `roster init`; the final card uses the currently verifiable checkout command `node packages/cli/dist/bin.js init`, centralized in `src/data/productCopy.ts` for one-line replacement after publication.
- The League site exists, but the only committed Combine artifact has zero human-certified tasks. It is shown as pre-season, never as a public ranking.

## Audio Direction

An original procedural stereo bed supplies a low D-minor drone, restrained pulse, overload tension, scanner sweeps, terminal ticks, lineup impacts, connection clicks, a short failure distortion, Sixth Man lift, and final logo impact. It contains no sampled or copyrighted music. Visual beats remain readable when muted.

## Future Refinement

- Replace the pre-release command once package-name clearance and publication land.
- Record a human sound designer’s final mix and loudness pass while preserving the cue timeline.
- Align the film mark and palette with any final brand system.
- Replace representative configured MCP names only if launch partners approve public use.
- Add human-certified League footage once signed task coverage exists.

