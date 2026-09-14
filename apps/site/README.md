# Roster launch website

A static Astro + Starlight site for Roster's local MCP tool router. A compact, centered hero introduces local, adaptive routing; the architecture view leads the product example and starting five remains optional. There is no hosted agent, analytics service, Markdown-export layer, or League publication.

## Baseline

The verified product revision and publication state are centralized in `src/lib/site.ts`. The website's original public baseline was `670c77e0c6d1ada1d1569363d88d3b0380b762e8`, while the original creative checkout was at `f50e873`; the website was built in a separate worktree so uncommitted root package changes and film projects stayed intact. Its initial change contained website source and assets, root convenience scripts, a baseline test-runner peer pin, and the shared lockfile.

`@roster/cli` returned a public npm 404 and the GitHub repository had no releases when checked on 2026-09-07. The actual CLI preview was later published as `@npmmo/roster@0.0.1` on 2026-09-13 after owner review, then verified through fresh public installs. The documentation-only `0.0.2` patch corrected the npm README links, retained byte-identical runtime bundles, and passed public install/upgrade verification. Nothing in a website build publishes the package or deploys a service.

## Run locally

Use Node 22.17+ within Node 22.x, or Node 24.2+, and pnpm 11.9.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm site:dev
```

Astro prints the selected local port. Development search is intentionally disabled by Starlight; test search against production output:

```sh
pnpm site:build
pnpm --filter @roster/site preview --port 4323
```

The output is `apps/site/dist/`. The product's `pnpm build` does not build this website, and the website build does not compile or start product servers.

The complete site build finishes with the official Pagefind CLI and validates its manifest. On the inspected macOS setup, Starlight's Node-API indexing step returned success but left an empty `pagefind-entry.json`; the same version's CLI produced the complete index. Keep the completion/validation step unless a tested upstream update resolves that behavior.

## Content and components

- `src/pages/index.astro`: compact landing page.
- `src/components/Hero.astro` and `LogoDepth.astro`: centered local/adaptive story and original-color vendor imagery moving through CSS perspective. Motion can be paused and stops off-screen or for reduced motion. No animation library or live tool connection is involved.
- `src/styles/hero.css`: motion, depth, text-safe framing, and the compact mobile composition.
- `public/hero-vendors/`: additional vendor SVGs and provenance, independent of Roster's identity assets.
- `src/components/LocalRouter.astro`: local architecture overview.
- `src/components/StartingFive.astro`: browser-only illustrative draft/call example.
- `src/components/ProductExperience.astro`: Starlight's accessible tabs around both views.
- `src/lib/demo.ts`: curated example capabilities, presets, and state transitions. No visitor data or network calls.
- `src/content/docs/docs/`: the single authored MDX source for each guide.
- `src/lib/site.ts`: package name, executable strategy, release state, product revision, repository links, and setup prompt.
- `src/lib/sources.ts`: compact claim-to-source map. Methodology, telemetry, and provenance link to pinned authoritative repository documents rather than copying them.
- `src/styles/tokens.css`: shared colors, fonts, spacing, radii, depth, and motion tokens.
- `public/`: vector identity, local fonts, vendor assets, favicon, social image, and licenses.
- `ec.config.mjs`: code themes and the keyboard-scrollable code-region hook. Function-valued Expressive Code configuration belongs here, not in Astro's serialized options.

Starlight handles docs navigation, search, table of contents, and accessible tabs. Theme controls are shared between the landing page and docs and use the same persisted preference. Command and prompt copy controls include a visible manual-copy fallback. There is no View Markdown, Copy page, combined docs export, or generated Markdown twin.

## Release switching

Only after verifying an actual package publication, update `published`, `version`, `checked`, and the documented `revision` in `src/lib/site.ts`. `commandsFor` switches the whole execution strategy from the source entry point to pinned scoped npx commands. The published setup command downloads and initializes in one invocation; Windows uses `npx.cmd` without a PowerShell policy change. `Command.astro` shares the terminal choice across the homepage and guides, while global installation remains optional. Do not mix one-off npx init with an assumed global executable. Re-read version-sensitive guides, run checks, and regenerate the social image.

Source-install commands intentionally set up a new checkout at the documented product revision. The first-run guide explains that `init --no-dense` skips the install offer but does not turn an available runtime off: source builds should explicitly set `embeddings` to `off` before starting clients when lexical-only operation is intended.

## Verification

```sh
pnpm build
pnpm --filter @roster/site test
pnpm site:check
pnpm --filter @roster/site lint
pnpm site:build
pnpm --filter @roster/site verify:links
pnpm --filter @roster/site test:browser
pnpm test
pnpm typecheck
pnpm lint
```

The product build is required only for tests exercising the built CLI. These tests use disposable homes and in-memory MCP transports, not personal configuration. The browser suite uses an isolated installed Google Chrome instance and starts/reuses the production preview on port 4323. It checks 320, 390, 768, 1024, and 1440px widths, both themes, reduced motion, the demo, keyboard behavior, docs search/navigation, copy fallback, assets, and axe accessibility rules.

The site-local Biome config enables full Astro parsing without disabling lint rules. Root Vite 7 is pinned to preserve the product's pre-existing Vitest toolchain rather than allowing Astro's Vite 8 to replace its peer resolution.

## Identity and sharing assets

The owner-approved slim five-part R uses the same canonical geometry as both launch-film formats. Website headers, docs, footers and sharing assets use the outlined Space Grotesk lockup. The primary identity and favicon are cobalt on pearl; dark placements use the pearl inverse. The 256×256 symbol preserves its clear space and proportions. Fonts are local Space Grotesk, Manrope, and JetBrains Mono; SIL OFL texts are in `public/licenses/`. Interface icons use Tabler; vendor marks retain their original colors and identify illustrative capabilities, not endorsements or certified winners.

Regenerate the 1200x630 sharing image and 180x180 touch icon:

```sh
pnpm exec tsx apps/site/scripts/render-assets.mjs
```

This uses local fonts and assets with isolated Chrome. It performs no image-service requests. Repeat the import from the film assets and the canonical identity kit with Python:

```sh
python3 apps/site/scripts/import-film-assets.py /absolute/path/to/roster/videos/roster-premiere-tight/assets /absolute/path/to/roster/assets/brand/roster-r-01
```

Normal builds do not need the film directory. Source paths, hashes, and license information are retained alongside the copied assets.

## Production deployment

The Vercel project `roster` in `managementmos-projects` is connected natively to the GitHub repository `ManagementMO/roster`. Its production branch is `main`: pushes to `main` trigger production builds, while non-production branches receive Vercel previews. Merge reviewed changes after CI passes; the Vercel Git integration does not itself wait for unrelated GitHub checks. No separate token-bearing GitHub Actions deployment workflow is needed.

The production domain is **https://roster-router.vercel.app**. It is attached to the project, not just a single deployment, so later production builds update it automatically. The unrelated `roster.vercel.app` was already occupied. Existing project-generated aliases are retained rather than reassigned or removed.

Build settings are versioned in the repository-root `vercel.json`: install with the frozen lockfile, run `pnpm site:build`, and publish only `apps/site/dist`. Keep the Vercel root at the repository root so workspace dependencies, the reviewed vendor archive, and shared brand assets remain available. The project uses Node 24.x and `ENABLE_EXPERIMENTAL_COREPACK=1` for production and preview so the repository's `pnpm@11.9.0` pin is respected.

Production `SITE_URL` is `https://roster-router.vercel.app`. This produces the matching canonical/social URLs and sitemap. Local builds without `SITE_URL` deliberately omit canonical URLs, add noindex metadata, and emit no sitemap; Starlight's skipped-sitemap warning is expected there. Keep the hashed `_astro/` files and Pagefind assets intact, and verify the custom 404 and HTTPS clipboard behavior after deployment.

Use `vercel link --project roster --scope managementmos-projects` from the repository root when a local checkout needs the existing project link. Generated `.vercel/` metadata and environment files remain gitignored. Do not expose tokens, disable preview protection, or add analytics/database services as part of routine deployment.

Building or previewing locally does not deploy anything. Website deployment does not publish the CLI package or authorize League signing; those remain separate owner-controlled actions.
