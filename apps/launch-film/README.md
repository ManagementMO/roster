# Roster Launch Film

Code-native Remotion production for Roster’s 57-second launch film. The master turns a crowded MCP capability field into a local, task-ready starting five, then demonstrates routing, outcome capture, a suggestion-only Sixth Man, Coach learning, and an evidence-gated League.

## Project Structure

- `src/compositions/` registers the master, teaser, square crop, poster, and contact sheet.
- `src/scenes/` contains the eleven narrative scenes in timeline order.
- `src/components/` contains the terminal, tool universe, scan, lineup, connector, League, and finishing systems.
- `src/data/` centralizes verified copy, scene frames, terminal events, representative tools, and audio cues.
- `src/design/` and `src/motion/` contain visual tokens and reusable motion curves.
- `public/fonts/` contains local OFL sources; `src/generated/fonts.css` embeds the render-safe WOFF2 payloads. `public/audio/` contains the procedurally generated mix.
- `scripts/` regenerates audio, QA stills, and the contact sheet. Outputs go to `out/` and are gitignored.

## Preview and Render

Run from the repository root:

```bash
pnpm film:studio          # Remotion Studio at the printed local URL
pnpm film:typecheck       # strict launch-film TypeScript check
pnpm film:preview         # 960×540 iteration render
pnpm film:render          # 1920×1080 H.264 master
pnpm film:poster          # launch thumbnail
pnpm film:stills          # entrance/middle/exit stills for all scenes
pnpm film:contact-sheet   # twelve representative master frames
```

Additional package renders:

```bash
pnpm --filter @rosterhq/launch-film render:teaser
pnpm --filter @rosterhq/launch-film render:square
pnpm --filter @rosterhq/launch-film render:gif
```

The production profile uses two Chrome workers and a 90-second local-asset timeout for reliable long-form rendering.

## Composition IDs

- `RosterLaunchMaster` — 1920×1080, 60 fps, 3420 frames.
- `RosterLaunchTeaser` — 1920×1080, 60 fps, 900 frames.
- `RosterLaunchSquare` — 1080×1080 full-film safe crop.
- `RosterLaunchPoster` — 1920×1080 still.
- `RosterLaunchContactSheet` — 1920×1016 still.
- `RosterLaunchQASheet` — entrance/middle/exit matrix for every scene.

Primary outputs are `out/roster-launch-v1.mp4`, `out/roster-launch-preview.mp4`, `out/roster-launch-poster.png`, and `out/roster-launch-contact-sheet.png`.

## Making Changes

- Copy and launch commands: `src/data/productCopy.ts`.
- Scene ranges and QA frames: `src/data/timeline.ts` and `SHOTLIST.md`.
- Palette and typography: `src/design/colors.ts` and `src/design/typography.ts`.
- Starting five and Sixth Man: `STARTER_IDS` and `BENCH_TOOL` in `src/data/tools.ts`.
- Audio timing: `src/audio/cues.json`; regenerate the original mix with `pnpm --filter @rosterhq/launch-film audio:generate`.
- Font payloads: regenerate `src/generated/fonts.css` with `pnpm --filter @rosterhq/launch-film fonts:embed` after changing a WOFF2 source.

Keep all motion frame-derived. Do not add CSS keyframes, timers, `Math.random()`, remote render assets, or claims beyond `FILM-BRIEF.md`.
