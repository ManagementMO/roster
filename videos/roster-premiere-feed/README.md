# Roster — feed edition

A dedicated 15-second 4:5 launch film, composed at 1080×1350. It shares the final widescreen film's artwork, Pocket Groove jazzy lo-fi soundtrack, pearl-and-cobalt palette and core story. Headlines, cards and product panels are rearranged for phone viewing.

The current shared soundtrack is the accepted Pocket Groove edit. The shared 48 kHz stereo mix measures −14.03 LUFS and −2.00 dBTP after encoding. See `verification/pocket-groove-delivery.json` and `../roster-premiere-tight/MUSIC.md`. Rebuild and refresh audio from the widescreen project with `npm run audio` and `npm run audio:refresh`.

The full logo now reads **Roster** once, with the unique five-part R as its first letter followed by outlined **oster**. The router node and closing scene use the same unified wordmark as the widescreen film, website and covers. All three MP4s, the poster and contact sheet were regenerated while retaining the 15-second edit, Playwright handoff and accepted audio packets. Current evidence is in `verification/unified-wordmark.json` and `check-unified-wordmark.json`.

- `renders/roster-feed-60fps.mp4` — 1080×1350, 60 fps; the main feed copy.
- `renders/roster-feed-120fps.mp4` — native 120 fps master.
- `renders/roster-feed-preview.mp4` — 864×1080, 60 fps; smaller preview.
- `renders/roster-feed-contact-sheet.png` — six representative encoded frames.
- `renders/roster-feed-poster.png` — final identity frame.

The opening keeps eight distinct tools, with no repeated brand. The starting five uses three cards above two centered cards. The task and shortlist span the available width; the result and local-learning panels receive the same treatment. A new portrait path takes Playwright from the selected row into the call endpoint, with the same slight bounce, smooth settle and new dry contact sound at 8.20 seconds. The closing descriptor is “Your local MCP tool router.”, followed by the larger GitHub URL.

`scripts/build.mjs` is the editable layout source. It imports canonical artwork from `../roster-premiere-tight/`, supplies explicit portrait geometry and choreography, then writes six local compositions and the master timeline. The finished project includes local fonts, SVGs and audio, so playback and rendering do not fetch external media.

```sh
npm run build
npm run check
npm run seams
npm run render
npm run deliver
npm run dev
```

Run checks before rendering; the render temporarily creates a picture-only root while the separately mastered audio is muxed. Source hashes, check reports, transition evidence and encoded delivery measurements are under `verification/`. Asset provenance and music composition are documented in `../roster-premiere-tight/ASSET-SOURCES.md` and `../roster-premiere-tight/MUSIC.md`.

The finished renders and current review evidence are documented in [VISUAL-QA.md](VISUAL-QA.md). Both the native 120 fps master and 60 fps sharing copy are exactly 15 seconds, with the same final soundtrack as the widescreen film.

The source and original 30-second production are preserved. This film is an illustrative product workflow and is not a product certification or publication record.
