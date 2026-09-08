# Roster Premiere — delivery review

Reviewed on 2026-09-07. The delivered film is the 30-second composition in this directory, rendered with HyperFrames 0.8.31. The master render completed successfully in 54.7 seconds.

## Delivered media

| Artifact | Verified properties | Size |
| --- | --- | --- |
| `renders/roster-premiere-1080p.mp4` | 1920×1080, H.264, yuv420p, 60 fps, 1,800 frames, 30.000 seconds; stereo AAC at 48 kHz | 10,073,922 bytes |
| `renders/roster-premiere-preview.mp4` | 1280×720, H.264, yuv420p, 30 fps, 900 frames; stereo AAC at 48 kHz | 1,798,813 bytes |
| `renders/roster-premiere-poster.png` | Actual encoded master at 28.8 seconds | 186,690 bytes |
| `renders/roster-premiere-contact-sheet.png` | Actual encoded master at 2.7, 6.75, 14.2, 19.7, 23.8 and 28.8 seconds | 397,195 bytes |

The preview video stream is exactly 30 seconds; AAC padding makes its container duration 30.016 seconds. Both master streams are exactly 30 seconds. File hashes are recorded in `verification/delivery.json`, and the full stream metadata is in `verification/media-probe.json`.

## Visual review

Inspected the rendered contact sheet and full-resolution poster after encoding. The enormous 200 and FIVE remain readable; all five draft rows fit inside the panel; the selected Playwright row leads into the returned snapshot; the learning scene shows derived signals; the final mark, wordmark, tagline, URL and pre-release status are legible. The supplied white mark matches the existing project identity.

Before rendering, inspected 18 timeline snapshots including both sides of all five cuts. Earlier inspection caught two subcomposition color-inheritance failures and one inherited font mismatch; these were corrected before the successful checks and render. The four leftward cuts keep the travel direction consistent. The final cut uses a matching inverse zoom. The final identity settles and remains still for 1.875 seconds.

The encoded-file black-frame detector flagged 26.183–26.550 seconds because at least 98% of the picture is dark during the client-to-mark convergence. Inspected additional actual encoded frames at 26.0, 26.2, 26.35, 26.55, 26.8 and 27.0 seconds: the white mark is visible during this interval, and the wordmark then enters. This is the intended sparse identity reveal, not a missing scene or fully black gap. Evidence: `verification/final-reveal-contact.png`.

## Automated checks

- HyperFrames combined check passed with zero errors. Runtime, layout, motion and contrast each have zero warnings. Motion assertions sampled 300 times; 59 contrast observations passed. The checks test the authored constraints, not every possible aesthetic issue.
- All 26 seam checks passed across the five cuts: travel direction, nonzero movement, speed relationship, one visible scene per frame, and no conflicting zoom direction at the final cut.
- Four lint warnings concern intentionally repeated SVG sources: the opening tool collection and the normal/selected Playwright treatments. Their distinct visual instances were inspected in the finished output.
- Large display-type ascent/descent boxes are explicitly allowed to overlap only where the actual letterforms remain separated. The opening decorative tool conveyor is intentionally cropped at the edge. These annotations do not bypass whole-scene layout checks.
- FFmpeg decoded all 1,800 master frames and its audio stream successfully. No silence lasting 0.3 seconds below −50 dB was detected. The sole near-black interval is reviewed above.
- The encoded master measured **−14.9 LUFS integrated**, **1.0 LU loudness range**, and **−1.9 dB true peak**. These are measurements of the delivered AAC audio, which differ slightly from the intermediate WAV. No human listening approval is claimed.

Detailed reports: `verification/check-final.json`, `verification/seams-final.json`, `verification/encoded-master-audit.log`, and `verification/delivery.json`.

## Product evidence boundary

The draft/call sequence is explicitly marked illustrative. The 200-tool opening is the repository's framing example, not a measured tool inventory. Five is the default maximum in opt-in five mode. The learning scene represents derived outcomes stored and maintained locally; third-party tools can still access their normal external services.

The 57 focused router/Coach tests passed locally under the installed Node 24 runtime. They support the mechanism used in the story, not general release readiness, routing accuracy, or a live demonstration of the particular illustrated task. The film preserves the pre-release status and makes no npm-availability, production-score, automatic-rescue, dashboard or bug-fix claim. See `PRODUCT-RESEARCH.md` for the implementation map.

All work for this production stays under `videos/roster-premiere/`. Existing source changes and previous film experiments were preserved. The work has not been committed, pushed or published.
