# Roster launch film — final delivery review

## Current unified wordmark — September 8, 2026

The current router nameplate and closing scene use one **Roster** wordmark. Its initial is the canonical slim five-part R followed by outlined **oster**. The original five shapes, longer lower legs, spacing and proportions are preserved; the whole R is uniformly scaled to the lettering's cap height and baseline. The closing assembly remains deterministic and settles before the existing final reading hold. The Playwright label, handoff outline, bounce and native vendor colors are preserved.

All three MP4s, the poster and contact sheet were regenerated for this identity. `verification/unified-wordmark.json` records the current source and delivery hashes, exact 15-second durations, 1,800 native frames and 900 sharing frames. `check-unified-wordmark.json` passes lint, runtime, layout, motion and contrast with zero findings. The current poster and contact sheet were extracted from the encoded master and visually reviewed; timeline snapshots at 9.75, 12.3, 12.7, 14.1 and 14.55 seconds cover both changed placements and the closing assembly.

The accepted Pocket Groove master and all encoded audio packets remain unchanged. The 48 kHz stereo AAC measures −14.03 LUFS and −2.00 dBTP, with no unexpected gaps. `verification/pocket-groove-delivery.json` records the current file and stream hashes. Its picture-preservation check compares each export before and after the audio refresh, rather than against an older visual revision. `verification/delivery.json` and `media-probe.json` describe the current files; full decode detects no configured black or silence spans, and the sampled native-motion passage has 23 distinct adjacent frames.

Preceding source and exports remain in the ignored `verification/before-unified-wordmark/` directory. The older `identity-adoption.json`, `check-roster-r-final.json` and named final-polish reports retain their historical evidence for earlier logos and soundtracks. This is local video-production evidence; it does not establish a public deployment or product release.

## Earlier polish review — September 7

The following review records the preceding polish pass and its historical verification files. Current output filenames above now contain the September 8 identity revision.


Reviewed September 7, 2026 (America/Los_Angeles). This final polish adds the clearer closing descriptor, larger action/result labels and GitHub URL, an earlier closing entrance, and a restrained Playwright landing sound in the Full Send pop-rock score. The approved pearl-and-cobalt palette, eight unique opening brands, modern two-tone capability icons and gentle Playwright bounce remain intact. The widescreen film is complete and exported locally. A separately composed 4:5 edition lives in `../roster-premiere-feed/`, with its own delivery review. This review covers video production and encoded deliverables; it does not establish product release readiness or external publication.

## Delivered media

| File | Picture | Frames | Duration | Audio |
| --- | --- | --- | --- | --- |
| `renders/roster-tight-120fps.mp4` | 1920×1080, H.264, 120 fps | 1,800 | 15.000 seconds | AAC, 48 kHz stereo |
| `renders/roster-tight-60fps.mp4` | 1920×1080, H.264, 60 fps | 900 | 15.000 seconds | AAC, 48 kHz stereo |
| `renders/roster-tight-preview.mp4` | 1280×720, H.264, 60 fps | 900 | 15.000 seconds | AAC, 48 kHz stereo |

All video and audio streams have the same exact 15-second duration. The final original arrangement is delivered as `assets/audio/five-in-motion-full-send.m4a`, the 24-bit `assets/audio/full-send-final.wav` master and five editable stems. `full-send-score.wav` and the generic listening filename remain aliases of the current mix. Full stream metadata is in `verification/media-probe.json`; artifact sizes and SHA-256 hashes are in `verification/delivery.json`.

## Visual review

The current revision was reviewed in actual encoded frames at 1.35, 3.05, 6.85, 9.75, 11.6 and 14.1 seconds. These form `renders/roster-tight-contact-sheet.png`. Additional current timeline samples are in `snapshots/final-polish/`. GitHub, Linear, Playwright, Figma, Brave, Slack, PostgreSQL and Supabase each appear once in the opening, with original colors, distinct silhouettes and clear spacing. Their provenance remains in `verification/opening-logo-sources.json`. Main shortlist actions and the returned result are now 48px. The matching master-owned handoff label has the same 48px type and 58px line height, preventing a size jump at transfer.

The earlier shared-element review remains in `snapshots/encoded-pearl-cobalt/`. The preceding landing refinement has 14 timeline snapshots in `snapshots/playwright-settle/` and ten inspected frames from that preceding encoded master at indices 899, 900, 912, 923, 934, 945, 956, 966, 977 and 981. These cover the scene cut, overshoot, diminishing rebounds and destination takeover, and are in `snapshots/encoded-playwright-settle/` with `landing-contact.png`.

The inspected frames show intact typography, full-color logos, clean rounded surfaces and no unintended overlap. The new palette uses pearl, ink, navy and cobalt, with one restrained pale-blue radial background for the light scenes. FIVE is cobalt, task and selection surfaces are pale blue, and the closing rule is a lighter cobalt tone. The capability lineup uses soft white cards and the approved flat two-tone icons. Native Playwright, Figma and Linear artwork retains its color. The teal-blue database, mint top and green/coral/amber outcome signals are preserved. The final card ends on the mark, tagline and GitHub URL, without the removed release-status line.

The selected Playwright row becomes the route endpoint. Its card and logo now move from 7.10 to 8.20 seconds, with an upward lead, a restrained 1.7-degree landing tilt, 18px horizontal overshoot and two diminishing rebounds. The active movement spans 132 native frames, extended from 60. The card settles by 8.20 seconds, and the destination takes over at 8.225 seconds after a three-frame hold, before the request arrives at 8.35 seconds. Uniform scaling stays within 1.75%, preserving the text and logo proportions. Only unselected text softens during selection, preserving icon color. The other rows recede before the moving card crosses them. The rendered corner treatment was corrected during review to preserve the rounded row shape at the first handoff frame.

Short arrivals and smooth deceleration preserve distinct reading holds. The closing line now reads “Your local MCP tool router.” The GitHub URL is 48px and enters from 12.6675 to 12.8975 seconds, leaving a fully composed 2.1025-second closing hold. The motion assertion explicitly permits up to 2.2 seconds of stillness for this reading hold; other motion checks remain enabled. Readability and the aesthetic effect remain judgments for the viewer; sampled frame review does not substitute for viewing the complete film on the intended display.

## Automated evidence

- `verification/opening-logo-audit.json` records eight tiles, eight distinct tool names and exactly one occurrence of each. The opening artwork and choreography are preserved in this polish pass; earlier logo-replacement evidence is historical.
- `verification/check-final-polish.json` (also copied to `check-final.json`): lint, runtime, layout, motion and contrast checks all pass, with zero errors, warnings or informational findings. Layout checks include 13 explicit samples. Motion checks sample 300 points; all 76 sampled contrast observations pass.
- `verification/seams-final-polish.log` (also copied to `seams-latest.log`): all 26 checks across five boundaries pass with zero failures or warnings. The handoff audit covers 140 consecutive frames at 120 fps, with exactly one opaque Playwright asset on every frame. Forward and reverse seeking agree exactly. Painted asset geometry changes only 0.005px at source transfer and 0.000px at destination transfer; the scene cut has a continuous 5.6px/0.3px logo movement and 1.2% size change across its adjacent samples.
- `verification/delivery.json`: all 1,800 frames of the master decode successfully. No black spans or silence spans meeting the configured detector thresholds are reported.
- A 0.2-second sample beginning at 0.12 seconds contains 23 distinct adjacent frames out of 23. This supports native 120 fps motion in the sampled passage. Static reading holds are intentional; uniqueness was not asserted for all 1,800 frames.
- The newly encoded Full Send soundtrack measures −13.0 LUFS integrated loudness, 1.3 LU loudness range and −1.8 dB true peak. No silence of at least 0.3 seconds below −50 dB is detected. The composition report records 406 instrument and sound-design events, with a guitar/snare build into the logo hit at 12.1875s and final resolve at 14.0625s. The arrangement uses CC0 recorded guitar, bass and drum one-shots with documented source hashes. These measurements do not constitute human listening approval.
- The 48ms dry contact sound begins at 8.20s, aligned with Playwright's final rest. A brief 1.2dB dip in the guitar parts gives it space. `verification/audio-final-polish-comparison.json` verifies that drums and bass remain bit-identical and other stem changes stay inside the short landing region. Before/after excerpts and the isolated cue are available under `assets/audio/playwright-landing-*.wav`.
- All seven delivered media files are recorded with hashes and sizes in `verification/delivery.json`. Studio and exports use the new canonical `full-send-final.wav` URL, avoiding a stale cached soundtrack.
- `verification/final-polish-audit.json` rechecks every delivered hash, exact duration and frame count, the current master source hash, eight unique opening brands, and preservation of the original 30-second production. The final widescreen and feed editions contain identical encoded soundtrack packets. The final encoded frame was inspected in `snapshots/encoded-final-polish/last-frame.png` and retains the complete closing identity.

The native Studio preview clears clips at its exclusive 15.000-second endpoint; encoded delivery ends at the final actual frame (14.9917 seconds) and retains the closing identity. The temporary picture-only render source is deleted after rendering. Backups use `.html.bak` extensions so they are absent from the composition list.

The live Studio tab was refreshed after export and verified with the new descriptor and larger URL visible at 14.1s, audio enabled, a 15-second timeline and no lint-count badge. It is open at `http://localhost:5468/#project/roster-premiere-tight?v=1&t=14.1&tab=design&rc=0`. The feed edition has a separate Studio tab and server.

## Reproduction details

The seam harness sets the renderer's 120 fps seek configuration before the preview runtime starts. This avoids the preview's default 30 fps quantization when sampling a boundary at one-frame intervals. Assertions remain enabled.

HyperFrames 0.8.31 rejected its built-in audio assembly after repeated correction attempts. `scripts/render.mjs` therefore renders an identical picture-only copy, then uses FFmpeg to combine the picture with the separately mastered original score. The temporary source differs only by removal of the audio element and is deleted after rendering. Source hashes and the successful render log are recorded in `verification/render-plan.json` and `verification/render-final-polish.log`. No installed renderer dependency was modified.

The 60 fps export is the general viewing copy. The native 120 fps master needs a compatible player and high-refresh display to show its full temporal resolution.

## Scope and preserved work

This revision updates `videos/roster-premiere-tight/` and adds `videos/roster-premiere-feed/`. The pre-polish widescreen sources, audio, stems and exports are preserved under `verification/before-final-polish/`, with a SHA-256 manifest. The original 30-second production remains available in `../roster-premiere/`; its recorded 1080p master SHA-256 is `cda3c92b3d205b44098408aaf857e9f8aca08f067ec903e42baaab646b975c87`. The earlier monochrome exports are preserved under `renders/archive-monochrome/`; the first original score and stems are under `verification/before-ignition/`. The preceding electronic score, stems and glossy icon scene are preserved under `verification/before-pop-rock/`. The approved coral edit is preserved under `verification/before-pearl-cobalt/`, and earlier Playwright landings remain under their named verification backups.

No product source was changed by this revision. Product tests were not rerun for video-only changes. Earlier product evidence is identified separately in `PRODUCT-RESEARCH.md`. The new production has not been committed, pushed or published.

## Final micro-adjustment

The user requested a tiny increase in bounce and a smoother settle. The peak moves 2px farther horizontally, tilt rises from 1.5 to 1.7 degrees, and the last settling phase gains 50ms. The film remains exactly 15 seconds with the same audio and palette. The preceding approved landing is preserved in `verification/before-playwright-micro-settle/`. That revision's encoded peak, rebound and rest frames are reviewed in `snapshots/encoded-playwright-micro-settle/`.

## Unique opening logo revision

The user's next request replaces duplicate opening brands with distinct tool examples. Tiles 5–8 now contain Brave, Slack, PostgreSQL and Supabase respectively. The original GitHub, Linear, Playwright and Figma tiles, all eight entry times and rotations, the 1.875-second opening duration, and the entire later film remain intact. The preceding sources and exports are preserved in `verification/before-unique-opening/`. The native 120 fps master, 60 fps sharing copy, 720p preview and encoded contact sheet were regenerated and checked for this final logo set.
