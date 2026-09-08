# Task 6B — Strict Combine suite parsing

## Scope delivered

- Added parser regressions for null, arrays, and primitive task records;
  missing/non-string ids and non-string optional descriptions; malformed invoke
  records and args; malformed setup/files records and file contents; malformed
  verifier records and required verifier fields; and zero, negative, NaN, and
  infinite timeouts.
- `parseSuite` now validates each untrusted record before reading properties or
  constructing the public `CombineTask`/`Verifier` values. `setup.files` is
  reconstructed as `Record<string, string>` only after validation.
- Parser failures identify the stable `tasks[n]` or `tasks[n].verify[m]`
  declaration location and do not serialize invoke arguments or tool results.

## RED evidence

Before the production edit, ran:

```text
pnpm test -- packages/combine/src/combine.test.ts

Test Files  1 failed | 10 passed (11)
Tests       6 failed | 248 passed (254)
```

The intended failures showed the existing unchecked casts: null task and
verifier records raised property-access `TypeError`s, while invalid descriptions,
invoke args, setup/files records, and non-positive/non-finite timeouts were
accepted.

## GREEN and final verification

After the minimal parser validation, ran:

```text
pnpm test -- packages/combine/src/combine.test.ts
Test Files  11 passed (11)
Tests       254 passed (254)

pnpm build
$ tsc -b

pnpm lint
Checked 57 files. No fixes applied.

git diff --check
(exit 0; no output)
```

## Self-review

- Preserved the public `Verifier` union and retained default `{}` arguments
  when `invoke.args` is omitted, preserving existing valid suites.
- The Task 6A no-follow verifier code is unchanged; this task is confined to
  parser validation and its tests.
- New secret-shaped invoke input assertions confirm parser messages do not echo
  arguments. Parser code does not handle execution results.
