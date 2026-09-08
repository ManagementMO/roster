# Roster — Pocket Groove

The current soundtrack is a bright, relaxed jazzy lo-fi edit: Rhodes keys, upright bass, light brushed percussion and muted horn color. It uses a selected HeyGen catalog recording plus 37 original product sound cues. It replaces the previous pop-rock mix in Studio and all six widescreen/feed exports.

The source is catalog item `42cc02db157645af90a944d8bd53e77a`, described by the provider as an upbeat instrumental with Rhodes, bass, brushed drums and muted horns. Its musical pulse measures approximately 125 BPM. A frozen 16-second excerpt starts at source time 7.704s; a pitch-preserving 1.024× tempo adjustment fits the established 128 BPM picture grid. The active groove starts immediately, and the closing music releases over the last 0.82s. “Pocket Groove” names this Roster edit, not an original composition of the underlying music.

Sound design includes small opening-card pops, five softer capability contacts, short transition swishes, a distinct Playwright landing at 8.20s, the request at 8.35s, a two-part snapshot response at 9.05s, local outcome ticks and a rounded logo accent at 12.1875s. Brief 1–1.8 dB music dips make room for key effects. Effects are written in `scripts/mix-pocket-groove.py`; they are not a generic overlay loop.

- Current 24-bit, 48 kHz stereo master: `assets/audio/pocket-groove-final.wav`.
- Listening copy: `assets/audio/roster-pocket-groove.m4a`.
- Editable float stems: `assets/audio/pocket-groove-stems/music.wav` and `design.wav`; `mix.wav` is their unmastered sum, regenerated locally and excluded from Git.
- Frozen source excerpt: `assets/audio/pocket-groove-source.flac`.
- Source metadata, digest, tempo treatment, event times and mastering settings: `verification/pocket-groove-mix.json`.
- Export hashes and encoded-audio checks: `verification/pocket-groove-delivery.json` in both editions.

The encoded outputs measure −14.03 LUFS integrated and −2.00 dBTP. No unexpected silence was detected. All six exports preserve the approved encoded video stream exactly; only the soundtrack was replaced. These checks establish timing, media integrity and levels. The owner accepted this revision on September 8, 2026.

`verification/pocket-groove-approval.json` records that acceptance against the exact master and listening-copy SHA-256 hashes. An identical rebuild retains the accepted status in `pocket-groove-mix.json`; any changed audio is marked pending until it is auditioned and accepted separately.

Rebuild the current music with `npm run audio`. For an audio-only revision with existing picture exports, run `npm run audio:refresh`; it copies the new master to the feed project and remuxes all formats without re-encoding video. Future full renders obtain the active soundtrack path from `audio_meta.json`.

The prior explicitly named `full-send-final.wav`, `full-send-score.wav` and `five-in-motion-full-send.m4a` remain available. Generic `premiere-score.wav` and `five-in-motion.m4a` follow the current edit. Prior exports and production files are preserved locally under `verification/before-pocket-groove/` in each project.

## Previous soundtrack — Five in Motion: Full Send

The following is the production history of the preceding pop-rock score. Its references to the “current” master or final polish describe that earlier revision.

An original 15-second pop-rock composition and arrangement for the refined Roster film. 128 BPM, 4/4, eight bars, C major. The film is exactly eight bars long at this tempo. This revision responds to the request for more exciting rock-and-roll energy and pop character.

The final polish adds one original 48ms dry contact at 8.20s, aligned to the Playwright card's completed settle, followed by the existing request tick at 8.35s. A smooth 1.2dB guitar dip over 8.185–8.30s gives the contact room. The 55ms breath before the final brand hit is retained. There are now 406 arrangement/effect events. Drum and bass stems are byte-identical to the preceding mix; measured changes in the other stems are confined to approximately 8.20–8.36s, including filter decay. This is documented in `verification/audio-final-polish-comparison.json`.

The current render/Studio master is `assets/audio/full-send-final.wav`; `full-send-score.wav` and `premiere-score.wav` are identical current aliases. Both the widescreen and 4:5 film use this exact master. `playwright-landing-isolated.wav` exposes the contact alone, while `playwright-landing-before.wav` and `playwright-landing-after.wav` provide matched 7.80–8.65s excerpts for listening comparison. Audio changes have been verified by timing, waveform comparison and level measurements; these do not constitute human listening approval.

The arrangement opens with a full band: two electric guitar parts, picked bass, an acoustic kick/snare kit and a bright guitar hook. The guitars alternate shorter muted strokes and open power chords over C, G, A and F roots. Separate Gretsch and Hofner recordings, strum offsets, alternating takes and separate amp shaping give the two sides different performances. Snare backbeats, eighth-note hats and short tom fills keep it moving. The local-learning passage builds through rising guitar notes and a snare fill. A 55 ms taper creates a brief breath before the Roster reveal at 12.1875 seconds, where the band lands on C with major-third and ninth accents. The final chord lands at 14.0625 seconds and decays through a controlled ending.

The notes, arrangement, amp treatment, timing and original interface effects are defined in `scripts/compose-pop-rock.py`; no existing song or music loop is used. The instrument one-shots are recorded performances from Karoryfer's Black And Green Guitars, Black And Blue Basses and Big Rusty Drums. The publisher provides these libraries under [CC0](https://shop.karoryfer.com/pages/free-samples). A small 96-file palette is frozen in `assets/audio/samples/`, together with license texts and a manifest recording every source URL, Git blob and SHA-256 hash. Guitar recordings are credited to Brian Wood in the source library. See `ASSET-SOURCES.md` for links. `scripts/fetch-rock-samples.py` documents retrieval; rebuilding the music uses only the frozen local assets.

The random generator has a fixed seed. NumPy and SciPy provide array and filter operations; FFmpeg decodes the original WAV/FLAC recordings, masters the mix and encodes the delivery files. No music-generation account or additional authentication is needed.

## Editable stems

| Stem | Purpose |
| --- | --- |
| `assets/audio/stems/drums.wav` | Recorded acoustic kick, rimshot snare and overhead, hats, tom fills and crashes |
| `assets/audio/stems/bass.wav` | Recorded picked bass, synchronized to the guitar rhythm and closing hits |
| `assets/audio/stems/chords.wav` | Two electric guitar parts, muted/open strums, power chords and closing resolve |
| `assets/audio/stems/lead.wav` | Major-key guitar hook, ascending pickup and final C add9 color |
| `assets/audio/stems/design.wav` | Original product ticks, short transition air and a low-level rising sweep |

Stem files are 48 kHz stereo 32-bit float WAVs with the final timing and tail applied. They are deliberately not independently normalized, so summing them preserves the intended balance. Their peaks may exceed unity before mastering; float WAV preserves them without clipping. The final master is `assets/audio/full-send-score.wav` (24-bit PCM); the listening copy is `assets/audio/five-in-motion-full-send.m4a`. The older `premiere-score.wav` and `five-in-motion.m4a` filenames are aliases of the current mix. The distinct audio URL makes Studio reload the revision. The previous Ignition score and stems are preserved in `verification/before-pop-rock/`; the first score is in `verification/before-ignition/`.

The composition event list, dependency versions, seed and exact note/effect timings are in `verification/music-composition.json`. The effects align with the tile arrivals, draft submission at 4.57 seconds, selection at 6.35 seconds, call arrival at 8.35 seconds, returned snapshot at 9.05 seconds, local outcome signals and final identity.

## Rebuild

```sh
npm run audio
```

This renders the five instrument/effect stems and mixes them, then runs two-pass loudness normalization targeting −13 LUFS and a −2 dB PCM true-peak ceiling to leave room for AAC reconstruction peaks. Encoded AAC measurements are reported separately in `verification/delivery.json`. Technical measurements do not constitute human listening approval.
