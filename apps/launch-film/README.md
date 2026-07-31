# `@rosterhq/launch-film`

The Roster launch film — a 58-second cinematic built in [Remotion](https://remotion.dev).

1920 × 1080 · 60 fps · 3,480 frames · H.264 / yuv420p / BT.709 · AAC stereo ·
local OFL fonts · procedurally-synthesised original score.

Outputs live in [`out/premium-v1/`](out/premium-v1). Nothing in this app is
published or deployed; the build writes files and stops.

---

## Documents

| File | What it covers |
|---|---|
| [FILM-BRIEF.md](FILM-BRIEF.md) | What the film has to do, the creative direction, and the truth rules |
| [SHOTLIST.md](SHOTLIST.md) | Every scene, frame range, beat and camera move |
| [VISUAL-SYSTEM.md](VISUAL-SYSTEM.md) | The design and motion systems, and every component family |
| [VISUAL-AUDIT.md](VISUAL-AUDIT.md) | What was kept, redesigned, deleted, simplified, or only retimed |
| [PROGRESS.md](PROGRESS.md) | Working log, environment gotchas, and how to resume |

---

## Quick start

From the repository root, once:

```sh
pnpm install
```

Then, in this directory:

```sh
pnpm fonts        # copy the OFL fonts out of node_modules and inline them
pnpm audio        # synthesise the score into public/audio/
pnpm studio       # Remotion Studio on http://localhost:3000
```

`pnpm fonts` and `pnpm audio` are only needed after you change the font list or
`src/audio/cues.ts`; both outputs are committed.

The QA working files are **not** committed — `out/stills/`, `out/qa-frames/` and
`public/qa/` are gitignored because they are large and fully regenerable. Run
`pnpm contact-sheet` once after a fresh clone before opening the `ContactSheet`,
`BeforeAfter` or `QaSheet` compositions in Studio, or their `<Img>` sources will
be missing. The eight delivered artifacts in `out/premium-v1/` **are** committed.

---

## Scripts

| Script | Does |
|---|---|
| `pnpm studio` | Remotion Studio, no auto-open |
| `pnpm typecheck` | `tsc --noEmit` over `src/`, `scripts/` and `remotion.config.ts` |
| `pnpm fonts` | Copies Inter + JetBrains Mono into `public/fonts` and regenerates `src/design/fontData.ts` |
| `pnpm audio` | Synthesises `public/audio/roster-launch-score.wav` from the cue table |
| `pnpm preview` | 960 × 540 preview → `out/premium-v1/roster-launch-premium-preview.mp4` |
| `pnpm master` | 1920 × 1080 master → `out/premium-v1/roster-launch-premium-master.mp4` |
| `pnpm poster` | Still at frame 3440 → `…-poster.png` |
| `pnpm stills` | Entry / midpoint / exit for all eleven scenes → `out/stills/` |
| `pnpm contact-sheet` | Renders the 33 QA frames, copies them to `public/qa/`, and builds the contact sheet |
| `pnpm before-after` | Builds the rejected-direction comparison sheet |
| `pnpm qa-sheet` | Builds the safe-margin / claim-ledger / master-spec sheet |
| `pnpm teaser` | 10.7 s cut → `…-teaser.mp4` |
| `pnpm gif` | README loop → `…-readme.gif` |
| `pnpm probe` | Parses and fully decodes the master, and asserts its specification |
| `pnpm build:all` | audio → preview → master → poster → sheets → teaser → gif → probe |

`pnpm stills` also takes arguments:

```sh
pnpm stills search clearing          # only those scenes
pnpm stills --frames 120,2400,3420   # exact frames
pnpm stills --scale 0.5              # faster, for a quick look
```

---

## Editing the film

Two files cover most changes.

**`src/motion/timing.ts` — when things happen.** One table owns every scene
boundary. The audio cue table, the QA sample frames and the shotlist all derive
from it, so retiming a scene here retimes the sound with it. Regenerate the score
afterwards with `pnpm audio`.

**`src/productCopy.ts` — what the film says.** Every word on screen comes from
here, and every entry carries a comment naming the file in this repository it is
traceable to. Scenes import strings; they never author them. `LAUNCH_COMMAND` is
defined exactly once and no scene may hard-code a command.

Then, by intent:

| I want to change… | Edit |
|---|---|
| a colour, a shadow, the paper | `src/design/colors.ts`, `lighting.ts` |
| how glass looks | `src/design/materials.ts` |
| type sizes and tracking | `src/design/typography.ts` |
| the grid, margins, safe area | `src/design/spacing.ts` |
| grain, vignette, wipes, bloom | `src/design/effects.ts` |
| how things move | `src/motion/easings.ts`, `springs.ts`, `stagger.ts` |
| a camera move | the `camera` prop on that scene's `SceneShell` |
| the prism, its states, its mark | `src/components/RosterCore/RosterCore.tsx` |
| a tool card | `src/components/ToolObject/ToolObject.tsx` |
| a connection variant | `src/components/Connection/Connection.tsx` |
| where objects stand | `src/lib/world.ts` |
| one scene's composition | `src/scenes/S0*.tsx` |

Each scene is also registered on its own under the **Scenes** folder in Studio,
so you can scrub and re-render one beat without waiting on the other ten.

---

## Rules this app follows

- **Deterministic only.** `useCurrentFrame()`, `useVideoConfig()`, `Sequence`,
  `interpolate()`, `spring()`, SVG paths and masks, and a seeded mulberry32
  stream in `src/lib/rng.ts`. No `Math.random()`, no CSS keyframes or
  transitions, no timers, no recorded footage.
- **Local assets only.** Fonts are inlined as data URLs at build time; the score
  is a WAV this repository generates. Nothing is fetched at render time.
- **Truth first.** See [FILM-BRIEF.md §2](FILM-BRIEF.md). The QA sheet prints the
  full claim ledger with sources.

---

## Environment notes

- `ffmpeg` is **not** required and is not installed here. Remotion's own Rust
  compositor does the H.264 + AAC encode, and `pnpm probe` verifies the result
  with `@remotion/media-parser` rather than `ffprobe`.
- Remotion's bundler does not resolve `./x.js` → `./x.tsx`, so relative imports
  under `src/` are **extensionless**. Scripts under `scripts/` run through `tsx`
  so they can import the same TypeScript modules.
- Fonts are inlined rather than fetched from `public/`: an HTTP font load hung
  under concurrent video rendering and aborted the render before frame 0.
- This app is intentionally **not** in the root `tsconfig.json` references or in
  the repository's `pnpm build`. It is a React/JSX app with different compiler
  settings; wiring it into the library build would change existing gates. Run
  `pnpm typecheck` from this directory instead.

---

## Licences

Film source: MIT, same as the repository.
Fonts: [Inter](https://github.com/rsms/inter) and
[JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), both SIL Open Font
License 1.1 — copies ship in `public/fonts/`.
Score: generated by `scripts/generate-audio.mjs` in this repository.
