# Roster website

This is a static Astro + Starlight workspace. The public story leads with the local tool router, local learning, user control, and reversible setup. Starting five is an optional mode, not the product's whole identity.

- Product revision and release availability live in `src/lib/site.ts`. The documented baseline is public main `670c77e`; the original creative checkout remains separate.
- Keep package name, execution strategy, release state, repository URLs, and the agent handoff centralized. Never advertise the unscoped npm package.
- `src/lib/sources.ts` is the compact claim-to-source map. Treat roadmap prose as plans unless implementation and evidence support it.
- One MDX source per guide under `src/content/docs/docs`. Do not add Markdown exports, page-copy controls, or a full-docs export.
- Design tokens are in `src/styles/tokens.css`. Use native vendor colors. The owner-approved slim five-part R uses canonical SVG paths from `assets/brand/roster-r-01`; import these directly rather than tracing the obsolete bitmap. Primary website branding and favicons use cobalt on pearl, with the pearl inverse for dark placements. Preserve the outlined Space Grotesk wordmark.
- Owner-requested direction: clean neutral surfaces, charcoal typography and controls, a matte router illustration, and no blue/turquoise wash or differently colored headline phrase. Reserve semantic colors for actual outcomes; keep original product icons neutral and vendor marks in their native colors. Carry this through docs, favicons, and sharing assets.
- The compact, centered hero uses original-color vendor logos with CSS perspective/transform/opacity motion. It has a pause control and stops off-screen, in hidden tabs, and for reduced motion. Keep the vendor artwork independent of Roster's identity files and logo-generation scripts. Each vendor has a separate depth lane; repeated copies share a duration with a half-cycle offset. Run `e2e/logo-spacing.spec.ts` when changing logos or trajectories.
- The architecture view is the default homepage panel. Starlight owns its accessible tabs. The starting-five demo is browser-only and illustrative; fixtures are tested through the actual router in memory. Never connect the marketing demo to a visitor's configuration.
- Source workspaces include the embedding runtime. `init --no-dense` only skips its installation offer; `embeddings: "off"` is the explicit lexical-only setup.
- Bundled skill scripts trigger review even when harmless. Do not add review overrides to make a demo pass.

From the repository root: `pnpm site:dev`, `pnpm site:build`, `pnpm site:check`. Run `pnpm build` before `pnpm --filter @roster/site test`, which includes built-CLI fixture checks. Lint: `pnpm --filter @roster/site lint`. Link/asset check after building: `pnpm --filter @roster/site verify:links`. Browser acceptance: `pnpm --filter @roster/site test:browser`, using an isolated installed Chrome instance and a production preview on port 4323.

Biome's full Astro parser is enabled only in this workspace so template references are understood. The product's existing test runner keeps its original Vite 7 peer pinned at the root rather than inheriting Astro's Vite 8.

No `SITE_URL` means no fabricated canonical origin or sitemap. Starlight's skipped-sitemap warning is expected locally. Configure the owner's real origin only for deployment preparation. No publication, package release, human certification, or telemetry endpoint is part of this website build.

The build finishes with the official Pagefind CLI and validates its metadata: on the inspected macOS environment, Starlight's Node API left `pagefind-entry.json` empty despite reporting success. Do not remove that completion step without a production search regression check. Function-valued code-block configuration stays in `ec.config.mjs` so the reusable Code component can load it.

A 2026-09-07 audit found six advisories in the baseline's `fast-uri@3.1.5` and `qs@6.15.3`. The 2026-09-08 merge preparation updates the shared overrides to patched `fast-uri@3.1.6` and `qs@6.16.0`, with a clean dependency audit. Do not weaken repository security overrides or bypass the audit as part of website work.
