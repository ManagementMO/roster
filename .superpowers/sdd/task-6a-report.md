# Task 6A — Combine no-follow verifier semantics

## Scope delivered

- Added controlled real-MCP fixture tools for a sandbox symlink to a temporary
  external file and a dangling sandbox symlink. Temporary external targets are
  removed when the fixture process exits.
- Added six real-runner regression tasks: `fileEquals`, `fileExists`, and
  `fileAbsent` against each symlink state. Every task must fail at `verify`.
- Reworked filesystem verification to require byte-exact directory membership,
  `lstatSync` non-symlink components, and `realpathSync` containment below the
  real sandbox root before a file is read. `fileAbsent` now succeeds only when
  an exact directory entry is absent.

## RED evidence

Before production changes, ran:

```text
pnpm exec vitest run packages/combine/src/combine.test.ts

Test Files  1 failed (1)
Tests       1 failed | 9 passed (10)
```

The first new assertion, `external.file-equals`, was incorrectly certified
(`pass: true`, `stage: null`) because the verifier read through the sandbox
symlink to its external target. The same RED fixture includes the dangling
`fileAbsent` regression for the prior `fs.existsSync` behavior.

## GREEN and final verification

After the verifier change and fixture cleanup, ran:

```text
pnpm exec vitest run packages/combine/src/combine.test.ts
Test Files  1 passed (1)
Tests       10 passed (10)

pnpm build
$ tsc -b

pnpm lint
Checked 57 files in 46ms. No fixes applied.

git diff --check
(exit 0; no output)
```

## Self-review

- No verifier union or suite parser changes were made.
- Failure details remain fixed, suite-derived strings; no tool output, raw
  arguments, external paths, or result text were added to persisted reporting.
- Existing ordinary-file and directory regressions remain in the same real
  runner test file and passed in the final run.
- The implementation also applies no-follow checks to `dirExists` and
  `fileContains`, which use the same filesystem-read boundary.
