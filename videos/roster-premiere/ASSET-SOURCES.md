# Asset sources

- **Roster mark:** existing current user-supplied mark from `apps/launch-film-diffusion/assets/brands/roster-logo.png`, copied without pixel changes. Not the earlier multicolor R image.
- **GitHub, Linear, Playwright marks:** existing local SVG assets and their provenance in `apps/launch-film-diffusion/assets/brands/ASSET-SOURCES.md`. Used only as example capability identifiers. No endorsement or measured integration claim.
- **Space Grotesk, Manrope, JetBrains Mono:** local variable WOFF2 files from the existing HyperFrames film. The corresponding SIL OFL license texts are included in `assets/`.
- **GSAP:** existing local `gsap.min.js`, included so the composition has no render-time CDN dependency.
- **Music:** “Techno Fest Vibes” by Alejandro Magaña (A. M.), Mixkit asset 124, ingested from the repository's existing `mixkit-techno-fest-vibes.mp3`. Source: https://mixkit.co/free-stock-music/tag/technology/. License: https://mixkit.co/license/. The source is trimmed, gently retimed with pitch preservation and faded for this film. It is not an original or commissioned score.
- **Effects:** HeyGen audio catalog search results. Exact provider track IDs, prompts and downloaded files are recorded in `.media/manifest.jsonl`. Dry mechanical click `eada0ef7524f3144`, airy sweep `a4855a82116cd4cc`, deep impact `6b74643ad8f504d5`. The long impact is trimmed and faded before mixing.
- **Rejected music candidate:** HeyGen catalog `91346d54650d4099977bed3f1bb459f6`, preserved as `bgm_001.wav` for provenance but not included in the finished soundtrack.

The final 30-second music-and-effects master is `assets/audio/premiere-score.wav`. Its source timings and levels are editable in `scripts/mix-audio.mjs`; measured loudness is in `verification/audio-normalization.json`.
