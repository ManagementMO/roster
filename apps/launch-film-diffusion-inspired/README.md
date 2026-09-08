# Roster Launch Film — Signal / Route / Resolve

Fresh Diffusion Studio experiment inspired by the *grammar* of the supplied Claude Code promo: sparse black stage, editorial type, tactile terminal intent, a decisive push-through, and a calm identity finish. It is an independent Roster story, not a clone. The current cut is intentionally fast and tactile at 11.6 seconds.

## Structure

- `src/roster-film-inspired.jsx` — DAPI composition registration and audio.
- `src/inspired/design.js` — timeline, copy, colours, candidate data, orbit marks.
- `src/inspired/drawing.js` — deterministic Canvas primitives and local brand paths.
- `src/inspired/scenes.js` — hook, terminal, resolve, route, memory, and identity beats.
- `scripts/editor-inspired.mjs` — DAPI mount, check, render, poster, contact, and still commands.
- `INSPIRATION-ANALYSIS.md`, `FILM-BRIEF.md`, `SHOTLIST.md` — production context.

## Commands

From the repository root:

```bash
pnpm film:inspired              # open the project in Diffusion Studio
pnpm film:inspired-check        # deterministic source + DAPI mount check
pnpm film:inspired-preview      # generate the 720p / 30fps preview
pnpm film:inspired-render       # generate the 1080p / 60fps H.264 master
pnpm film:inspired-poster       # capture the final identity still
pnpm film:inspired-contact      # capture a full-film contact sheet
pnpm film:inspired-stills       # capture representative QA stills
```

Outputs are written to `apps/launch-film-diffusion-inspired/out/inspired/`:

- `roster-launch-inspired-preview.mp4`
- `roster-launch-inspired-master.mp4`
- `roster-launch-inspired-poster.png`
- `roster-launch-inspired-contact-sheet.png`
- `qa-stills/`

The composition id is `roster-launch-inspired`. To adjust pacing, edit `TIMELINE` in `src/inspired/design.js`; to change the task or candidates, edit `TERMINAL`, `CANDIDATES`, and `ORBIT_MARKS`. The generated score is deterministic and lives at `assets/roster-launch-inspired-score.wav`.
