# Roster — The starting five, distilled

A 15-second refinement of the first launch film: native 120 fps motion, modern two-tone vector icons, a pearl-and-cobalt palette with navy contrast, natural brand colors and vibrant illustrations, and a bright jazzy lo-fi groove with original picture-timed sound effects. The original 30-second production remains in `../roster-premiere/`.

The current audio revision, **Pocket Groove**, replaces Full Send in Studio and all widescreen/feed exports. Rhodes, bass and light percussion supply a relaxed but active pulse; 37 small contacts, swishes and response sounds follow the product motion. The mix measures −14.03 LUFS and −2.00 dBTP after AAC encoding. See `MUSIC.md` and `verification/pocket-groove-delivery.json`.

The full logo now reads **Roster** once: the unique five-part R is the initial letter, followed by outlined **oster**. The router nameplate and animated closing scene use the same canonical wordmark as the website and launch covers. All three exports, the poster and contact sheet were regenerated; the 15-second timing, Playwright handoff and accepted audio packets are unchanged. `verification/unified-wordmark.json` and `check-unified-wordmark.json` record current evidence. Older visual and pop-rock notes below describe their named historical revisions.

## Watch and listen

- `renders/roster-tight-120fps.mp4` — 1920×1080 native 120 fps master, for high refresh playback.
- `renders/roster-tight-60fps.mp4` — 1920×1080 at 60 fps, the general viewing/sharing copy.
- `renders/roster-tight-preview.mp4` — smaller 1280×720 preview, also 60 fps.
- `renders/roster-tight-poster.png` — final identity, extracted from the encoded master.
- `renders/roster-tight-contact-sheet.png` — six frames from the encoded master.
- `assets/audio/roster-pocket-groove.m4a` — current 15-second music and sound-design mix; `five-in-motion.m4a` is the same current mix for existing links.
- `assets/audio/pocket-groove-final.wav` — current 24-bit 48 kHz stereo master. The explicitly named Full Send assets preserve the previous score.
- `../roster-premiere-feed/renders/roster-feed-60fps.mp4` — the separately composed 1080×1350 4:5 version for phone feeds.

The 120 fps file is rendered at that rate without frame interpolation. A sampled passage of active motion contains 23 distinct adjacent frames out of 23; intentional reading holds remain still. Playback smoothness depends on the player's and display's supported refresh rate. The 60 fps copy preserves the exact same 15-second edit.

## What changed

The opening collection now shows eight distinct tools, with no repeated vendor: GitHub, Linear, Playwright, Figma, Brave, Slack, PostgreSQL and Supabase. The four new marks use original color SVGs, frozen locally with provenance in `ASSET-SOURCES.md` and `verification/opening-logo-sources.json`. Existing tile motion, the softer Playwright handoff, palette, music and 15-second duration are retained.

The edit keeps the core sequence and removes waiting: immediate 200-tool hook; starting five; a task transformed into a draft; selected call and returned snapshot; local outcome learning; Roster identity. The final closing line is “Your local MCP tool router.”, with a 48px GitHub URL that arrives earlier. Primary action and returned-result labels are also 48px, up 20%. The final identity remains fully composed for 2.1025 seconds. A dedicated 4:5 edition rearranges each scene for phone feeds, with the same 15-second story and score.

The five capability icons now use clean two-tone geometry on soft white cards: blue code brackets, a gold folder, teal browser, violet issue symbol and indigo workflow cards. They share a 44×44 construction grid and consistent visual weight, with no gradients, bevels or shine strokes. Smaller file and workflow glyphs repeat their recognizable forms in the draft. Vendor logos retain their native colors, including Playwright's red/green, Figma's five-color mark and Linear's violet. The database uses filled teal-blue shading; green success, coral errors and amber latency chips add meaning to the local-learning illustration. Light scenes share a restrained pearl-to-pale-blue radial background. FIVE, the routing accents and NEXT DRAFT use cobalt; task and selection fills use pale blue. A stationary matching ground prevents flashes at scene boundaries.

The selected Playwright row now becomes the call endpoint: a single master-owned card and logo travel across the cut with a small overshoot, a restrained tilt and two diminishing rebounds from 7.10 to 8.20 seconds, then hand over to the destination at 8.225 seconds. The active movement now spans 132 native frames instead of 60, with a soft landing that finishes before the request arrives at 8.35 seconds. Other candidate text softens during selection while the icons keep their full colors. The remaining rows recede before the moving card crosses them. All movement uses deterministic GSAP transforms, and explicit elliptical corners keep the resizing surface rounded.

The preceding score was **Five in Motion — Full Send**, an original 128 BPM pop-rock arrangement with layered electric guitars, picked bass, an acoustic rock kit, a major-key hook and a strong logo hit. Individual instrument recordings are from Karoryfer's CC0 sample libraries; the notes, rhythm and edit are custom to this film. No existing song or music loop is used. The five editable stems are drums, bass, rhythm guitars, guitar hook and product sound design. See `MUSIC.md`. The earlier electronic score and glossy icon scene are preserved in `verification/before-pop-rock/`; the first score is in `verification/before-ignition/`.

## Editable source

The final audio pass adds a 48ms dry contact at 8.20s, just as Playwright settles, and a smooth 1.2dB dip in the guitar stems. The original drums and bass remain byte-identical; the other stem changes are confined to the landing passage. Comparison evidence and A/B excerpts are recorded in `verification/audio-final-polish-comparison.json` and `assets/audio/playwright-landing-{before,after}.wav`. The preceding film and audio are preserved under `verification/before-final-polish/`.

| Time | Scene | Source |
| --- | --- | --- |
| 0–1.875s | Too many tools | `compositions/frames/01-overload.html` |
| 1.875–3.75s | Starting five | `compositions/frames/02-five.html` |
| 3.75–7.5s | Task to draft | `compositions/frames/03-draft.html` |
| 7.5–10.3125s | Call and returned snapshot | `compositions/frames/04-call.html` |
| 10.3125–12.1875s | Learn locally | `compositions/frames/05-learn.html` |
| 12.1875–15s | Roster identity | `compositions/frames/06-identity.html` |

Each scene has a paused GSAP timeline. The cross-scene Playwright handoff is authored in `scripts/build.mjs` and regenerated into `index.html`. The master owns all scene transitions; `ledger.json` records their times and directions. Keep `STORYBOARD.md`, the ledger and musical cues synchronized when retiming.

## Reproduce

Requires Node 22+, npm, FFmpeg, Python and uv. HyperFrames is pinned to 0.8.31; the audio command pins NumPy 2.5.3 and SciPy 1.18.1 in uv's isolated dependency environment.

```sh
npm run audio
npm run build
npm run check
npm run seams
npm run snapshots
npm run render
npm run deliver
```

Open the editable Studio with `npm run dev`. `npm run seams` resolves the actual running preview and confirms the exact project path. The seam harness injects the renderer's 120 fps seek configuration before the preview runtime starts, avoiding its default 30 fps seek quantization. Exit transform states are explicit so arbitrary seeking stays deterministic.

`npm run deliver` creates the 60 fps copies, poster and contact sheet, probes all media streams, measures encoded audio, checks for blank/silent spans and compares adjacent frames during active motion. Reports are under `verification/`; the reviewed outcome is recorded in `VISUAL-QA.md`.

`npm run render` renders picture with HyperFrames and then combines it with the separately mastered score using FFmpeg. A temporary copy of the master omits only its audio element; the visual source is otherwise identical and its hash is recorded. This avoids HyperFrames 0.8.31's repeated audio-assembly rejection encountered on this score. The final audio is measured independently after muxing, and no dependency or global renderer file was modified.

The illustrated workflow remains explicit. The closing release-status line was removed at the user's request. Product behavior and the earlier focused test evidence are documented in `PRODUCT-RESEARCH.md`. Video-production checks do not establish a product release or website deployment.

The preceding approved coral edit and its source files are preserved under `verification/before-pearl-cobalt/`, with original hashes in `sha256.json`. HTML backups use `.html.bak` to keep them out of the Studio composition inventory. The pop-rock audio master is unchanged in this visual revision.

The preceding pearl-and-cobalt edit, before the Playwright landing refinement, is preserved under `verification/before-playwright-settle/`. This pass keeps all scene durations, palette, logos and the pop-rock music master unchanged.
