# Roster Launch — HyperFrames

A 54-second, 1920×1080 product-launch film built as native, deterministic HTML/SVG motion. The creative concept is **software draft night**: an agent’s tool overload compresses into one local-first Roster endpoint and an elite starting five.

## Project map

- `index.html` — master composition and paused GSAP timeline (`main`)
- `BRIEF.md` — creative and factual boundaries
- `STORYBOARD.md` — exact ten-scene narrative and time-coded action
- `frame.md` — cream/cobalt visual-system specification
- `ledger.json` — nine scene seams and their direction/velocity contract
- `index.motion.json` — seek-time motion assertions used by `hyperframes check`
- `scripts/generate-score.mjs` — deterministic original score generator
- `assets/` — bundled fonts, GSAP runtime, and audio; no render-time network dependency
- `snapshots/` — visual QA frames and contact sheets
- `renders/` — preview, master, poster, and delivery contact sheet

## Commands

Run from `videos/roster-launch`:

```bash
npm install
npm run dev
npm run check
npm run snapshot:qa
npm run render:preview
npm run render:master
```

Studio opens at `http://localhost:3002/#project/roster-launch`. The preview script renders 30 fps H.264 for fast review; the master script renders 60 fps high quality. Both include the authored stereo score.

To regenerate the raw score, run `node scripts/generate-score.mjs`. The normalized render track is `assets/audio/roster-score-master.wav`.

## Editing

- Change the palette and materials in the `:root` tokens near the top of `index.html`.
- Change launch copy directly in each scene’s semantic HTML. Keep the planned `npx roster init` command labeled **coming soon** until the package is published.
- Change timing in both `STORYBOARD.md` and the GSAP positions in `index.html`; keep scene clip start/duration values contiguous.
- Regenerate seam code after changing cut times:

```bash
node ../../.agents/skills/motion-doctrine/scripts/seam-stamp.mjs --ledger ledger.json --write index.html
node ../../.agents/skills/motion-doctrine/scripts/seam-gate.mjs verify --ledger ledger.json --project .
```

The Sixth Man must remain suggestion-only: the replacement connection may complete only after the visible agent-acceptance beat.
