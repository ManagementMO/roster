# Roster identity adoption — September 8, 2026

The canonical full logo is one word: the slim five-part R is the first letter of **Roster**, followed by the outlined letters **oster**. Its original five shapes, 40-unit stems, 80-unit lower stem and extended diagonal are unchanged. The whole initial is uniformly scaled and baseline-aligned to the lettering. `wordmark-layout.json` records its exact placement. Standalone symbols remain for icon-only uses such as favicons and touch icons.

## Video

- Widescreen Studio: http://localhost:5468/#project/roster-premiere-tight
- Feed source: `videos/roster-premiere-feed/`; open its Studio with `npm run dev` from that directory.
- Widescreen outputs: `videos/roster-premiere-tight/renders/roster-tight-{120fps,60fps,preview}.mp4`
- Feed outputs: `videos/roster-premiere-feed/renders/roster-feed-{120fps,60fps,preview}.mp4`

Both 15-second compositions use the unified pearl wordmark on navy in the router node and closing scene. The closing SVG assembles the same five canonical shapes as the word's initial, settling before the existing final reading hold. The accepted Pocket Groove soundtrack, native vendor colors and Playwright handoff are preserved. All six MP4s, both posters and both contact sheets were regenerated. Each edition's `verification/unified-wordmark.json` records current source and export hashes, zero-finding HyperFrames checks and exact frame/duration checks. The earlier `identity-adoption.json` is historical evidence for the separate-symbol lockup.

## Website

The current website source is `apps/site/` in the main repository checkout. Its updated local production preview is http://127.0.0.1:4324/.

The header, footer, docs, 404 and sharing image use the unified wordmark. The initial R is cobalt on pearl with ink lettering; dark placements and the router illustration use the pearl inverse. Favicons, the touch icon and compact diagram glyphs retain the same standalone five-part symbol. Surrounding controls keep their neutral roles and vendor colors are preserved.

`apps/site/scripts/import-film-assets.py` imports the canonical SVGs directly. `render-assets.mjs` generates the 1200×630 sharing image and 180×180 touch icon, then records their hashes in `public/licenses/assets.json`. Every imported asset hash was checked against its file, and the public logo vectors were compared byte-for-byte with the canonical exports.

Validation for this wordmark revision: Astro reports zero errors, warnings or hints; Biome lint passes; the production build and all 780 internal link/anchor/asset checks pass. All 39 browser tests pass, covering responsive layouts, light/dark themes, accessibility, docs, controls, vendor uniqueness and logo spacing.

The browser suite used the verified current build on port 4324 with an isolated Chrome instance. Desktop, mobile, mobile docs, dark docs, router and footer screenshots are in `verification/website-*-final.png`. The final video posters and website sharing image were also visually reviewed.

## Covers and reusable kit

The League leaderboard also embeds the canonical outlines in its header, with cobalt on light backgrounds and the pearl inverse on dark backgrounds. `apply_wordmark.py` generates its source in `apps/league/src/brand.ts`; the rendered HTML remains self-contained and requires no image or font requests. The repository build, lint (215 files), all 37 League tests and static League build pass. Dark desktop and light mobile screenshots are in `verification/league-*-final.png`.

Both landscape and feed launch covers use the unified name. Their exact edit prompts, generated-file provenance and current hashes are under `assets/brand/roster-launch-cover/`. `roster-launch-covers.zip` and `roster-identity-kit.zip` contain the updated artwork. Prior production versions remain in ignored rollback directories; earlier image-generation explorations are retained as provenance.

This document records source, local previews and exported media. Repository delivery and CI are tracked in the pull request; these checks do not establish a public website deployment or product release.
