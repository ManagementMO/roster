# Publishing `@npmmo/roster`

Everything here is an **owner action**: it needs an npm account, and it is
irreversible in ways an agent must not perform. The release candidate,
security-critical human review, and fresh consumer verification must be complete
before publication. A passing source build alone is not a release approval.

## The selected namespace

The first-release target is **`@npmmo/roster@0.0.1`**, and the installed executable
remains **`roster`**. The scope belongs to the npm user `npmmo`; verify that exact
account with `npm whoami` immediately before publishing.

The earlier choice, `@roster/cli`, is not the publication target. The authenticated
`npmmo` account was not listed as a member of `@roster`. A package lookup returning
404 does not prove a namespace is unclaimed, and an agent cannot grant access to
someone else's organization. A different organization would need its owner's
permission and a separately confirmed package name.

The unscoped package `roster` belongs to an unrelated project. Never substitute
`npx roster` for the scoped command. Choosing a different scope after publication
would require a separate package and migration, not renaming this package in place.

## Public access and package boundaries

`packages/cli/package.json` sets `publishConfig.access` to `public`, so the scoped
package is not accidentally treated as a paid private package. The clean-install
gate checks this setting.

Only this CLI package is publishable. The internal workspace libraries stay
private and are bundled into it. The tarball contains the executable and library
bundles, package manifest, README, and license; it must not contain credentials,
local Roster state, scratch artifacts, or unpublished workspace dependencies.

The supported CLI runtime range is `^22.17.0 || >=24.2.0`. Affected older Windows
libuv builds are refused before local state changes; the file-integrity checks
must not be disabled or relaxed as a publishing workaround.

## The publish

Review the exact candidate tarball, its SHA-256, name, version, file list,
dependency graph, and the native consumer results. The owner must review the
security-critical changes and explicitly approve the public publication. Keep the
reviewed tarball unchanged between approval and publication.

```bash
npm login                                   # the account that owns @npmmo
npm whoami                                  # confirm it
node scripts/verify-clean-install.mjs --dense # last check: packs and installs outside the workspace

CANDIDATE="/absolute/path/to/reviewed/npmmo-roster-0.0.1.tgz"
npm publish "$CANDIDATE" --dry-run --access public # inspect the exact file list one final time
npm publish "$CANDIDATE" --access public --tag latest # publish the reviewed bytes after owner approval
```

Do not run `npm publish --workspaces`. Do not rebuild or repack after approving a
different tarball. Public publication is not reversible by reusing the same
version number.

## Immediately after publishing

1. Query the public registry independently of any staging-scope configuration;
   confirm the name, version, access, dist-tag, and tarball integrity.
2. Check that the npm package page renders its README, source links, and license.
3. From a fresh directory outside the repository, with a fresh npm cache and a
   disposable Roster home, install the public package and run the real npm shim,
   `npx` invocation, and scoped config lifecycle. Do not touch the owner's live
   client configurations during this verification.
4. Only after those checks succeed, update publication metadata and announce the
   actual version. A one-off `npx` command does not install a global `roster` binary.

## Optional hardening for later releases

- **Provenance.** CI publishing with OIDC can attest the workflow and source
  commit. Do not claim provenance for a manual publish or set provenance options
  without the required OIDC credentials.
- **2FA on publish** and a reviewed trusted-publisher configuration.
- **A release workflow** that preserves the reviewed artifact and owner gates.

## Still owner-gated, separately from publishing

The Combine signing session (`docs/signing/session-1-checklist.md`) and the human
entries in `docs/PROVENANCE.md` remain separate gates. Until human signing happens,
`signedN = 0` and the League may not publish named scores. Publishing the CLI does
not certify or publish a League ranking, register a domain, or create a telemetry
endpoint.
