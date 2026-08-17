# Publishing `@roster/cli`

Everything here is an **owner action**: it needs an npm account, and it is
irreversible in ways an agent must not perform. The engineering side is done and
verified — this is the ceremony around it.

## What "the `@roster` scope" means

`@roster/cli` is a **scoped** package name. The `@roster` part is the scope, and
npm treats it as a namespace that somebody owns. You cannot publish
`@roster/anything` until `@roster` belongs to you, and once it does, nobody else
can ever take a name inside it.

Two ways to own it:

| | How | When to use |
|---|---|---|
| **Organization** (recommended) | npmjs.com → *Add Organization* → name it `roster` | Survives you, supports multiple maintainers, free for public packages |
| **User scope** | Register the npm **username** `roster`; `@roster` is then yours | Only if you want it tied to a personal account |

The org route is the right one for a project meant to outlive a single account.

As of the last check the scope looked unclaimed — `npm view @roster/cli` returns
E404 and a registry search for `scope:roster` returns 0 packages — but npm's web
endpoints refuse scripted checks (HTTP 403), so **confirm it while logged in
before relying on it**. Scopes are first-come, first-served.

Note the unscoped name `roster` is already taken by an unrelated
`roster@0.0.3`, which is exactly why the scoped name was chosen. Anyone typing
`npx roster` gets a stranger's package — worth knowing when writing launch copy.

## Why `publishConfig.access` matters

Scoped packages are **private by default**. Without

```json
"publishConfig": { "access": "public" }
```

the first `npm publish` fails with `402 Payment Required — You must sign up for
private packages`. It is set in `packages/cli/package.json`, and
`scripts/verify-clean-install.mjs` fails the build if it is ever removed.

(This is also the one thing `publishConfig` is reliable for. npm **ignores**
`publishConfig` overrides of `bin`/`main`/`exports` — only pnpm applies them —
which is why the manifest points at `bundle/` directly instead. See
`docs/lab/review-round6-hardening.md`.)

## The publish

```bash
npm login                                   # the account that owns @roster
npm whoami                                  # confirm it
node scripts/verify-clean-install.mjs       # last check: packs, installs elsewhere, runs all 8 commands

cd packages/cli
npm publish --dry-run                       # inspect the file list one final time
npm publish                                 # prepack rebuilds + bundles + stages README/LICENSE
```

Then verify as a stranger would, from a directory that is not this repo:

```bash
cd "$(mktemp -d)"
npx -y @roster/cli init
```

## Immediately after publishing

1. Check the package page renders: description, README, repository link, licence.
2. `npm view @roster/cli` — confirm version, `bin`, and that the dependency list
   contains **no** `@roster/*` entries (they are bundled, never published).
3. Consider `npm dist-tag` hygiene if you publish a pre-release before `latest`.

## Optional hardening for later releases

- **Provenance.** Publishing from CI with `--provenance` (OIDC) attests which
  workflow and commit produced the tarball. Do not set
  `publishConfig.provenance` for a manual publish — npm errors when it cannot
  find OIDC credentials.
- **2FA on publish** for the org.
- **A release workflow** so publishing is reproducible rather than a laptop
  ritual.

## Still owner-gated, separately from publishing

The Combine signing session (`docs/signing/session-1-checklist.md`) and the
first `docs/PROVENANCE.md` review entries. Until signing happens `signedN = 0`
and the League may not publish a single named score — publishing the package
does not change that.
