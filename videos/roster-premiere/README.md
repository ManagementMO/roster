# Roster — The starting five

A 30-second music-led product launch film. Six connected beats move from an overwhelming toolset to a focused draft, a useful tool call, local learning, and the Roster identity.

The visual system uses warm black, ivory and coral, the existing white Roster mark, bold Space Grotesk typography and tactile material tiles. The API example is explicitly illustrative. The closing CTA points to the public source repository and says pre-release.

## Deliverables

- `renders/roster-premiere-1080p.mp4` — 1920×1080, 60 fps H.264 master with stereo AAC audio.
- `renders/roster-premiere-preview.mp4` — smaller 1280×720, 30 fps viewing copy.
- `renders/roster-premiere-poster.png` — final identity frame.
- `renders/roster-premiere-contact-sheet.png` — six representative frames from the encoded master.
- `index.html` — editable HyperFrames composition with six source compositions in `compositions/frames/`.

## Reproduce

From this directory, with Node 22 or newer, npm and FFmpeg available:

```sh
npm run audio
npm run build
npm run check
npm run seams
npm run snapshots
npm run render
npm run deliver
```

HyperFrames is pinned to **0.8.31**. `npm run build` reads the scene sources and `STORYBOARD.md`, builds the master, and stamps the transitions from `ledger.json`. The vendored seam helpers come from the repository's motion-doctrine skill. All visual assets and the mixed audio are local; no render-time image or font service is needed.

`npm run deliver` encodes the smaller preview, extracts the poster and contact sheet from the finished master, and records media dimensions, frame counts, hashes, loudness and decode checks. It does not alter the source compositions.

For the editable timeline:

```sh
npx --yes hyperframes@0.8.31 preview --background
npx --yes hyperframes@0.8.31 preview --status
```

## Change a scene

| Time | File | Beat |
| --- | --- | --- |
| 0–3.75s | `compositions/frames/01-overload.html` | Your agent has 200 tools |
| 3.75–7.5s | `compositions/frames/02-five.html` | Only five get to start |
| 7.5–15s | `compositions/frames/03-draft.html` | The task becomes a focused draft |
| 15–20.625s | `compositions/frames/04-call.html` | Call and returned snapshot |
| 20.625–24.375s | `compositions/frames/05-learn.html` | Derived outcomes, local learning |
| 24.375–30s | `compositions/frames/06-identity.html` | Local endpoint and Roster identity |

Each scene has one paused GSAP timeline using local time. The master owns all cross-scene movement. Change scene durations in `STORYBOARD.md`, matching seam times in `ledger.json`, and any affected sound cues in `scripts/mix-audio.mjs` together. Re-run the checks and inspect the cuts after retiming.

The final identity is still for approximately 1.875 seconds. Intentional title leading is marked only on the relevant text spans: the font's ascent/descent measurement boxes overlap, while the visible letterforms remain separated. The initial visual inspection caught and fixed two inherited-color failures that static lint alone could not detect.

## Evidence and provenance

- `PRODUCT-RESEARCH.md` — project understanding, implementation map, exact claim boundaries and research sources.
- `ASSET-SOURCES.md` — logo, fonts, music and effect provenance. The music is licensed Mixkit material with a custom edit and sound-effects mix; it is not an original composition.
- `verification/check-final.json` — framework lint, runtime, layout, motion-order and contrast checks.
- `verification/seams-final.json` — numerical checks at each of the five boundaries.
- `verification/audio-normalization.json` — soundtrack measurements and all sound cue timings.
- `VISUAL-QA.md` — rendered artifact inspection and delivery measurements.

The film does not imply a shipped dashboard, automatic Sixth Man rescue, public certification scores, a published npm package or a measured 200-tool installation. Product-source files and all previous film experiments were preserved. No commit, push, publication or client-configuration change is part of this production.
