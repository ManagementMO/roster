# Temporary adm-zip source pin

`@huggingface/transformers` brings in `onnxruntime-node`, whose optional native
binary installer uses `adm-zip`. Registry versions 0.5.9 through 0.6.0 can follow
pre-existing destination symlinks and overwrite or chmod files outside the
extraction directory when overwrite is enabled:
[GHSA-vwc7-r8mq-g2x9](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9).

At verification on 2026-09-10 UTC, npm's latest release is still 0.6.0. Roster
temporarily selects the proposed fix from
[upstream PR #575](https://github.com/cthackers/adm-zip/pull/575), pinned to the
complete commit `7d90dea2bfd35bc4761d6c8cf822f26b59aeef77`. This is **unreleased,
unmerged source**, although its package manifest declares version 0.6.1. It must
not be described as a published, maintainer-approved security release.

- Source: `https://codeload.github.com/cthackers/adm-zip/tar.gz/7d90dea2bfd35bc4761d6c8cf822f26b59aeef77`
- Downloaded archive SHA-256: `9887a4a56101700a4333e9b842c5b0287c2f0518ca926df87e5588505c598efe`
- `vendor/adm-zip-7d90dea2bfd35bc4761d6c8cf822f26b59aeef77.tgz` contains those exact
  upstream bytes, including the MIT license. The workspace uses this local
  archive so pnpm's `blockExoticSubdeps` protection remains enabled. Its lockfile
  records the integrity hash, and a regression test checks the SHA-256 above.
- The patch checks destination path components with `lstat` and refuses existing
  symlinks in directory creation and synchronous/asynchronous file extraction.

The workspace override and `packages/cli/src/dense.ts` select the same source
(local archive and exact-commit URL, respectively).
The latter is necessary because `roster dense enable` runs npm in a separate
Roster-owned prefix: npm does not inherit the workspace's pnpm overrides. The
installer creates the override before installing and migrates an existing
runtime manifest while preserving its dependencies and unrelated settings.
The npm prefix is canonicalized with `realpath`: alias paths can otherwise make
npm treat installed packages as linked entries and omit the root override.
Running `roster dense enable` again after upgrading Roster updates an existing
owned runtime. Ambient runtimes installed independently by users are outside
this installer's control.

`packages/cli/src/zip-extraction.test.ts` loads the ZIP dependency through the
actual Transformers → ONNX resolution path. It checks ordinary archive reads,
directory creation, overwrites, and refusal of leaf, parent, root, and dangling
symlinks. It covers all three extraction APIs, including the flattened
`extractEntryTo` call used by ONNX. External file content and permissions must
remain unchanged. Installer tests cover migration and invalid/symlinked manifests.

This is a mitigation for the reported pre-existing symlink behavior, not a
general guarantee against concurrent hostile filesystem replacement. The
upstream patch also rejects symlink ancestors, so callers should use canonical
destination paths. The dependency audit remains enabled without an advisory
ignore; behavioral tests, rather than the source package's version number alone,
are the evidence for the mitigation.

Replace both pins with a published fixed release once one is available and
passes these regressions. Regenerate the lockfile, verify a fresh npm semantic
runtime install plus real MiniLM inference, and run all required CI checks.

`node scripts/verify-clean-install.mjs --dense` exercises the actual packed CLI
outside the workspace. It verifies a fresh runtime's source URL, integrity, and
installed ZIP code; deliberately installs registry 0.6.0 in that disposable
fixture and proves `roster dense enable` upgrades it; then produces a real MiniLM
embedding from that separately installed runtime. Linux's required clean-install
CI job runs this probe. The default probe still checks the minimal CLI install.
