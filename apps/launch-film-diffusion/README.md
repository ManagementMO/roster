# Roster Launch Film — Real Asset Pass

This package contains Roster's active code-native launch teaser for [Diffusion Studio](https://github.com/diffusionstudio/editor). The current production is 12.4 seconds: `200 tools → real terminal setup → five-capability shortlist → ranked local route → Roster`. The separate Starting Five lineup beat was removed so every remaining scene keeps moving and the ending arrives without an empty hold. The opening now gives the core claim a readable breath before the terminal handoff. A deterministic 1920×1080 canvas follows the editor playhead, so Studio playback, captures, and renders share the same choreography.

The active entrypoint is `src/roster-film-real.jsx`. The earlier 9.6-second sprint remains available as `src/roster-film-sprint.jsx`; the 57-second exploration remains available as `src/roster-film-spectacle.jsx` and in `out/spectacle/`.

## Preview and render

From the repository root (Node `>=22.13`, pnpm `11.9.0`):

```bash
pnpm film:diffusion
pnpm film:diffusion-check
pnpm film:diffusion-preview
pnpm film:diffusion-render
pnpm film:diffusion-stills
pnpm film:diffusion-contact
pnpm film:diffusion-poster
pnpm film:diffusion-before-after
```

The preview is 1280×720 at 30 fps. The master is 1920×1080 H.264 at 60 fps with 48 kHz AAC audio. Active outputs are written beneath `out/real/`.

## Production map

- `src/real/design.js` owns the real-asset timeline, cool glass/graphite palette with semantic Roster, Filesystem, Claude, and restrained route-signal colours, Avenir-led type stack, terminal transcript, and selected tools.
- `src/real/drawing.js` owns the terminal shell, cached SVG marks, folder glyph, Roster route mark, hero objects, and utility ribbons used outside the call beat.
- `src/real/scenes.js` owns the terminal push-in, the simplified fit-shortlist rail, the ranked local-routing proof (agent intent → capability scores → selected Playwright route → returned assertion evidence), and the final rotating ecosystem orbit.
- `assets/brands/` contains local SVGs, the current user-supplied `roster-logo.png` mark, the earlier `roster.png`/`roster-clean.png` assets, and `ASSET-SOURCES.md`; `src/real/brandPaths.js` is generated from the SVGs for deterministic Canvas rendering. The final orbit uses GitHub, Slack, Notion, Figma, Vercel, Asana, Jira, Miro, Airtable, Sentry, Stripe, Redis, Cloudflare, Supabase, Playwright, Linear, and PostgreSQL—agent-facing integrations only, with model/runtime marks excluded from the orbit. Miro uses its official full-colour local icon; the original supplied Roster PNG is also preserved at repository path `Downloads/roster.png`.
- `assets/music/` contains the local Mixkit `Techno Fest Vibes` launch track and license note; `assets/sfx/mixkit/` contains curated real typing, interface, sweep, impact, and confirmation recordings; `scripts/make-real-sfx-bed.mjs` places those recordings against the authored visual cue map; `scripts/make-real-score.mjs` trims, fades, and mixes the music and SFX into the renderer WAV.
- `scripts/check-sprint.mjs` still guards the earlier sprint; `node scripts/editor.mjs check` validates the active real source and Studio mount.
- `scripts/editor.mjs` mounts, validates, captures, and renders the active cut.

Keep all visible motion playhead-driven. Do not introduce timers, unseeded randomness, ambient particle fields, or tiny decorative metadata. Keep brand assets local and update [assets/brands/ASSET-SOURCES.md](./assets/brands/ASSET-SOURCES.md) when adding a mark. The current authored palette is cool graphite, paper white, smoke-silver glass, and sage; native Roster, Filesystem, Claude, and other sourced brand marks retain their natural colours, while copper route packets remain a restrained motion signal. See [SPRINT-BRIEF.md](./SPRINT-BRIEF.md), [SHOTLIST.md](./SHOTLIST.md), and [VISUAL-SYSTEM.md](./VISUAL-SYSTEM.md).
