# Roster Launch Film — Implementation Plan

## Goal

Build and verify a deterministic Remotion production package that delivers the 57-second master, social variants, procedural audio, poster, QA stills, and contact sheet without changing product runtime behavior.

## Architecture

The composition is a global cinematic stage with a shared camera language, atmosphere, core, cards, and connectors. Eleven focused scene modules receive only local frames. All claims, timing, tool data, audio cues, design tokens, and easing curves live in dedicated modules. Pure data and math utilities are unit-tested; visual behavior is validated through rendered entrance/mid/exit stills and full-timeline contact sheets.

## Execution Checklist

- [ ] Add the isolated `@rosterhq/launch-film` workspace package and exact compatible Remotion dependencies.
- [ ] Add local OFL font assets and deterministic procedural audio generation.
- [ ] Test and implement the timeline, seeded data, and five-player invariants.
- [ ] Build shared stage, typography, terminal, cards, connectors, core, scan, League, and finishing components.
- [ ] Implement all eleven master scenes with continuous camera and object handoffs.
- [ ] Register master, teaser, square, poster, and QA compositions in Studio.
- [ ] Add render scripts for preview, final, poster, stills, contact sheet, teaser, square, and GIF.
- [ ] Render three QA frames per scene and inspect the consolidated sheet.
- [ ] Render the first preview, identify the five weakest moments, refine, and rerender.
- [ ] Render final deliverables; verify video/audio metadata and repository health.

## Global Constraints

- 1920×1080, 60 fps, 3420-frame H.264 master with yuv420p and audio.
- No network dependency during rendering; no direct `Math.random()`; no CSS keyframes or timers.
- Sixth Man remains suggestion-only; League remains PRE-SEASON until signed evidence exists.
- Do not commit, push, publish, register names, or modify router/CLI/Coach/Combine/Playbook/League behavior.
