# Roster feed edition — final delivery review

## Current identity adoption — September 8, 2026

The current exports use the owner-approved slim five-part R with longer lower legs. Stems are 40 units wide, the lower stem is 80 units long, and the diagonal extends by the same 20 units. The symbol is centered in its original 256×256 grid. The exact outlined “Roster” wordmark is preserved. All Roster marks in the film are pearl on navy.

The closing mark assembles in five short staggered arrivals with a one-pixel soft catch, settling by 12.6725 seconds. The complete closing card is still by 12.8975 seconds, leaving the existing 2.1025-second reading hold. The music and Playwright handoff remain unchanged.

- `verification/identity-adoption.json` records current source and delivery hashes, canonical geometry, exact 15-second durations, 1,800 native frames, and 900 sharing frames.
- `verification/check-roster-r-final.json` passes lint, runtime, layout, motion and contrast with zero findings. `check-final.json` is the current alias.
- `verification/seams-roster-r-final.log` passes all five boundaries with zero failures or warnings. `seams-latest.log` is the current alias.
- `snapshots/roster-r-final/` covers every changed placement and the closing assembly. The current poster and contact sheet are extracted from the final encoded master and were visually reviewed.
- `verification/delivery.json` and `media-probe.json` describe the current exports. Both formats retain the identical soundtrack, −13.0 LUFS integrated loudness and −1.8 dB true peak. Full decode finds no configured black or silence spans; the native-motion sample has 23 distinct frames.
- Earlier sources and deliverables are preserved in `verification/before-roster-r-adoption/`. The original 30-second film is unchanged.

This is local video-production evidence. It does not record a remote publication or product release.

## Earlier polish review — September 7

The following review records the preceding polish pass and its historical verification files. Current output filenames above now contain the September 8 identity revision.


Reviewed September 7, 2026 (America/Los_Angeles). The separately composed 4:5 film is complete and exported locally. It carries the final widescreen edit's story, timing, original score, artwork and pearl-and-cobalt palette into a layout built for a taller frame.

## Delivered media

| File | Picture | Frames | Duration | Audio |
| --- | --- | --- | --- | --- |
| `renders/roster-feed-120fps.mp4` | 1080×1350, H.264, 120 fps | 1,800 | 15.000 seconds | AAC, 48 kHz stereo |
| `renders/roster-feed-60fps.mp4` | 1080×1350, H.264, 60 fps | 900 | 15.000 seconds | AAC, 48 kHz stereo |
| `renders/roster-feed-preview.mp4` | 864×1080, H.264, 60 fps | 900 | 15.000 seconds | AAC, 48 kHz stereo |

Video and audio streams are each exactly 15 seconds. The 60 fps file is the main feed delivery. The native 120 fps master requires a compatible player and high-refresh display to show every frame. A final poster and six-frame contact sheet are in `renders/`.

## Composition and visual review

The opening uses two rows of eight distinct brands: GitHub, Linear, Playwright, Figma, Brave, Slack, PostgreSQL and Supabase, each once. Their original colors remain intact. The starting five is arranged as three cards above two centered cards. The task begins near the center, then rises into a full-width shortlist. The request and result use three route nodes and a large response panel. Local Coach becomes a full-width illustration. The final mark, wordmark, descriptor and URL form a vertical identity card.

Main action and result labels are 48px. The closing descriptor reads “Your local MCP tool router.” at 52px; the GitHub URL is 48px and completes its entrance at 12.8975s, leaving a 2.1025-second reading hold. Two-line call/result headlines have explicit 184px leading, with the workflow note below them. Their text boxes do not overlap.

Actual encoded frames at 1.35, 3.05, 6.85, 9.75, 11.6 and 14.1 seconds were visually inspected in `renders/roster-feed-contact-sheet.png`. Additional timeline views of the initial task, shortlist, call and closing are under `snapshots/final-polish/`. Six encoded frames around Playwright's arrival, rebound, rest and destination takeover are in `snapshots/encoded-final-polish/playwright-landing.png`. The final encoded frame, index 1799 at 14.9917s, was also inspected and retains the complete closing identity.

The selected Playwright row begins at (88,860), 904×88, and becomes the (808,548), 208×228 endpoint. It retains the approved 18px overshoot, 1.7-degree peak tilt and two diminishing rebounds. It settles at 8.20s; destination ownership begins at 8.225s, before the request arrives at 8.35s. The master carrier intentionally starts wider than its final node box; this specific placement is annotated with `data-layout-allow-overflow`.

The live Studio is open at `http://localhost:3003/#project/roster-premiere-feed?v=1&t=6.85&tab=design&rc=0`, paused on the redesigned shortlist. Its visible preview, six scenes, 15-second timeline, enabled audio and clean lint indicator were verified. The widescreen version remains open in its original Studio tab.

## Verification

- `verification/check-feed-final.json`, also `check-final.json`: lint, runtime, layout, motion and contrast all pass with zero errors, warnings or informational findings. Layout includes 15 explicit samples; motion samples 300 points; all 59 sampled contrast observations pass. The stillness assertion permits the deliberate final hold, with a 2.2-second maximum.
- `verification/seams-final-polish.log`, also `seams-latest.log`: all 26 checks across five scene boundaries pass, with no failures or warnings. All 140 consecutive handoff samples at 120 fps contain exactly one opaque Playwright asset. Forward and reverse seeks agree exactly. Painted geometry differs by 0.003px at the source transfer and 0.000px at the destination transfer.
- `verification/delivery.json`: all 1,800 master frames decode successfully. No black spans of at least 0.10s at the detector's threshold, or silence spans of at least 0.3s below −50dB, are reported. A 0.2-second active-motion sample contains 23 distinct frames out of 23. Static reading holds are intentional.
- Encoded audio measures −13.0 LUFS integrated loudness, 1.3 LU loudness range and −1.8dB true peak. The 48ms contact cue starts at Playwright's final rest, with a brief 1.2dB guitar dip. The canonical WAV and encoded AAC packets match the final widescreen film exactly. Measurements and source-level timing do not constitute human listening approval.
- `verification/final-polish-audit.json` verifies delivered file hashes and sizes, exact format/duration/frame counts, eight unique opening brands, current master source hashes, identical soundtracks across formats, and preservation of the original 30-second video.

## Reproduction and scope

`scripts/build.mjs` is the editable feed layout source. It imports canonical artwork from `../roster-premiere-tight/`, writes separate portrait geometry and choreography, and produces local compositions, fonts, SVGs and audio. Rebuild this project after shared widescreen artwork or music changes. Rendering does not fetch external media.

Run `npm run build`, `npm run check`, `npm run seams`, `npm run render`, then `npm run deliver`. Checks should finish before rendering, because the render briefly creates a picture-only root composition. FFmpeg muxes the separately mastered soundtrack and the temporary source is removed in cleanup. `verification/render-plan.json` records the source hash; `render-final-polish.log` records the successful render.

Asset provenance and the music arrangement are documented in the widescreen project's `ASSET-SOURCES.md` and `MUSIC.md`. This is an illustrative product workflow. No product source was changed, and video verification does not establish product certification or external publication.
