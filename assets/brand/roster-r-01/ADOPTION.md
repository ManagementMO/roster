# Roster identity adoption — September 8, 2026

The slim five-part R with longer lower legs is now the canonical identity for the current launch films and website. The final refinement lengthens the lower stem from 60 to 80 units and extends the diagonal by the same 20 units. Stem width stays 40 units; the full symbol remains centered in its 256×256 viewBox. The approved outlined wordmark is unchanged.

## Video

- Widescreen Studio: http://localhost:5468/#project/roster-premiere-tight
- Feed Studio: http://localhost:3003/#project/roster-premiere-feed
- Widescreen outputs: `videos/roster-premiere-tight/renders/roster-tight-{120fps,60fps,preview}.mp4`
- Feed outputs: `videos/roster-premiere-feed/renders/roster-feed-{120fps,60fps,preview}.mp4`

Both 15-second compositions use pearl Roster marks on navy. The closing SVG assembles the same five canonical shapes without altering their proportions. Every piece settles before the existing final reading hold. The Full Send pop-rock score, native vendor colors and Playwright handoff are preserved. Each video project has a current `verification/identity-adoption.json` with source and encoded artifact hashes, zero-finding Hyperframes checks, transition evidence and exact frame/duration checks.

## Website

The existing `roster-site` worktree contains `apps/site`. Its production preview is http://127.0.0.1:4323/.

Primary headers, footer and sharing identity use the cobalt-on-pearl lockup. Dark placements use the pearl inverse. The router illustration, optional starting-five flow, docs branding, favicon, touch icon and sharing image all use the same final geometry. Surrounding controls retain the site's neutral roles; vendor colors are preserved.

`apps/site/scripts/import-film-assets.py` imports the canonical SVGs directly. `render-assets.mjs` generates the 1200×630 sharing image and 180×180 touch icon, then records their hashes in `public/licenses/assets.json`. Every imported asset hash was checked against its file, and the public logo vectors were compared byte-for-byte with the canonical exports.

Validation: Astro reports zero errors, warnings or hints; Biome lint passes; the production build and all 776 internal link/anchor/asset checks pass. All 10 website fixture/unit tests pass under the already-installed Node 24 runtime, matching the cached native SQLite binary. The first attempt under the default Node 22 runtime reported an ABI mismatch; dependencies and global runtime configuration were not changed.

The final full browser run passes all 25 tests, including five viewport widths, light/dark themes, docs, accessibility, theme persistence, demo behavior and motion controls. An initial pause test sampled a one-frame transform difference; its isolated rerun and the final complete suite both passed without motion or test-source changes. The initial trace and final browser log are retained under `verification/`.

Desktop, mobile, mobile docs and dark docs screenshots are also under `verification/`. The prior mark and website assets are backed up there. No commit, deployment or remote publication was performed.
