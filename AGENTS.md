# Repository Guidelines

## Project Structure & Module Organization

Roster is a pnpm/TypeScript monorepo. Workspace libraries live in `packages/`: `cli` owns configuration discovery, sync/eject, and the executable; `router` proxies MCP tools; `coach` stores local outcomes; `combine` runs certification suites; `playbook` scans skills; and `shared` contains common contracts. `apps/league` builds the static leaderboard. Tests are colocated as `src/*.test.ts` or placed in a package's `test/` directory; reusable fixtures are under `packages/combine/test/fixtures`. Signed task suites live in `suites/`, end-to-end probes in `docs/verification/`, and experimental evidence in `docs/lab/`. Do not edit generated `dist/`, `dist-site/`, coverage, or `docs/lab/tmp-*` content.

## Build, Test, and Development Commands

Use Node `^22.17.0 || >=24.2.0` for the published CLI and pnpm `11.9.0`. The workspace retains an older Node 22.13 Linux compatibility job; that extra coverage does not expand the published CLI's supported-runtime contract. Affected Windows/libuv versions must be refused without weakening file-identity checks.

- `pnpm install --frozen-lockfile` installs the exact locked dependency graph.
- `pnpm build` compiles all TypeScript project references; run it before compiled CLI or verification scripts.
- `pnpm test` runs Vitest once; `pnpm test:watch` supports local iteration.
- `pnpm lint` applies Biome's recommended rules and treats warnings as failures; `pnpm lint:fix` writes safe fixes.
- `pnpm league:build` regenerates `apps/league/dist-site` after a successful build.
- Core-only work can install with `pnpm --filter roster-monorepo --filter './packages/*' install --frozen-lockfile`, then build with `./node_modules/.bin/tsc -b packages/cli && node packages/cli/scripts/bundle.mjs` and test with `./node_modules/.bin/vitest run packages`. Build the bundle before CLI launcher tests. Direct local binaries avoid pnpm's automatic workspace install during verification; these commands do not build or test the website or films.

## Coding Style & Naming Conventions

Write strict NodeNext ESM TypeScript and retain `.js` extensions in relative imports. Follow the existing two-space indentation, double quotes, semicolons, and trailing commas. Biome's formatter is disabled, so preserve these conventions manually. Use `camelCase` for functions, variables, and filenames (for example, `rosterServer.ts`), `PascalCase` for classes/types, and `UPPER_SNAKE_CASE` for module constants. Export package APIs through each `src/index.ts`.

## Testing Guidelines

Vitest discovers `*.test.ts` beneath package/app `src` and `test` directories. Add regression tests beside the affected module, keep tests hermetic with temporary directories or in-memory services, and close clients/databases in hooks. No coverage threshold is configured. For routing, config-lifecycle, or scoring changes, also run the relevant built probe in `docs/verification/` or suite in `suites/`.

## Commit & Pull Request Guidelines

Match the history's conventional subjects: `fix(cli): ...`, `feat: ...`, `docs: ...`, or `chore(ci): ...`; use an imperative summary and a scope when helpful. Pull requests should explain behavior and risk, link the issue, list commands run, and include screenshots for League HTML changes. Keep CI green across lint, multi-platform build/tests, integration probes, dependency audit, and secret scanning. Never commit credentials, local Roster state, or generated scratch artifacts.
