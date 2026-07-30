# Objective Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every reproduced, non-subjective production defect in Roster's trust path, routing/runtime, local learning, verification harness, public standings, and release gates.

**Architecture:** Implement safety at state boundaries: exact identities, explicit locks and journals, transaction/CAS writes, fail-closed filesystem handling, and strict artifact authority. Keep normal user commands and public APIs backward-compatible where doing so cannot preserve an unsafe ambiguity.

**Tech Stack:** Node.js 22.13+, TypeScript project references, pnpm 11.9.0, Vitest 4, better-sqlite3/WAL, MCP SDK 1.29, Biome.

## Global Constraints

- Work only on `review/round5-hardening`; never commit to or push `main`.
- Use no runtime network, hosted service, registry publication, deployment, or spending.
- Every manual CLI call sets both `ROSTER_TEST_HOME` and `ROSTER_HOME` to throwaway directories.
- Never persist or log prompts, needs, tool arguments, or tool results; hashes and derived-local vectors remain allowed.
- Unsigned tasks never feed a named public score; Sixth Man remains suggest-only.
- No dependency, telemetry-policy, OATS-policy, UI, package-name, or ranking-threshold changes.
- Every production behavior change follows red-green-refactor and gets a focused regression test.

---

### Task 1: Stable public capability identifiers

**Files:**
- Modify: `packages/shared/src/namespacing.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/namespacing.test.ts`
- Modify: `packages/router/src/backends.ts`
- Modify: `packages/playbook/src/entry.ts`
- Modify: `packages/router/src/rosterServer.ts`
- Test: `packages/router/src/router.test.ts`

**Interfaces:**
- Produces: `stableSegment(raw: string): string`, `stableBackendName(raw: string): string`, and `stableNamespacedId(source: string, rawName: string): string`.
- Produces: `skillToCapabilityEntry(skill: ParsedSkill, id?: string): CapabilityEntry`.

- [ ] **Step 1: Write failing shared and router tests**

```ts
expect(stableSegment("safe.tool")).toMatch(/^safe-tool-[a-f0-9]{10}$/);
expect(stableSegment("safe tool")).not.toBe(stableSegment("safe.tool"));
expect(stableBackendName("mail!")).toBe(stableBackendName("mail!"));
expect(stableBackendName("mail!")).not.toBe(stableBackendName("mail?"));
```

Add end-to-end tests proving two sanitized-colliding skills are both listed and invoke their own bodies, and a backend keeps its ID when a colliding peer fails.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm exec vitest run packages/shared/src/namespacing.test.ts packages/router/src/router.test.ts`  
Expected: missing exports plus one overwritten skill and shifted backend identity.

- [ ] **Step 3: Implement stable identity helpers and use them at every capability boundary**

```ts
export function stableSegment(raw: string): string {
  const safe = sanitizeSegment(raw);
  return raw === safe ? safe : `${safe}-${sha256PublicName(raw).slice(0, 10)}`;
}

export function stableNamespacedId(source: string, rawName: string): string {
  return `${sanitizeSource(source)}${NAMESPACE_SEP}${stableSegment(rawName)}`;
}
```

Use the reserved `skill` backend rule in `stableBackendName`, use stable source IDs before connecting, and key the skill map by stable skill IDs.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm exec vitest run packages/shared/src/namespacing.test.ts packages/router/src/router.test.ts`  
Expected: PASS.  
Commit: `fix(identity): make capability ids collision-stable`

### Task 2: Router termination and best-effort learning

**Files:**
- Modify: `packages/router/src/backends.ts`
- Modify: `packages/router/src/rosterServer.ts`
- Test: `packages/router/src/router.test.ts`

**Interfaces:**
- `BackendManager` constructor gains optional `{ maxTools?: number; closeTimeoutMs?: number }` without changing defaults at call sites.
- `record(...)` always returns the classified outcome even if storage fails.

- [ ] **Step 1: Write failing liveness and degradation tests**

```ts
it("rejects a repeated tools cursor without starving the connect timer", async () => { /* real in-memory transport */ });
it("does not await a transport close forever", async () => { /* close returns new Promise(() => {}) */ });
it("returns the backend result when recordOutcome throws", async () => { /* SQLITE_FULL simulation */ });
it("omitted draft_id executes without borrowing the latest draft", async () => { /* A draft, B draft, A call */ });
```

- [ ] **Step 2: Run the router file and verify RED**

Run: `pnpm exec vitest run packages/router/src/router.test.ts`  
Expected: cycle/close tests time out, storage test returns `-32603`, attribution test stores B's hash.

- [ ] **Step 3: Add cursor-cycle detection, macrotask yielding, ceilings, and bounded cleanup**

```ts
if (cursor && seenCursors.has(cursor)) throw new Error(`tools pagination cursor repeated`);
if (entries.length > this.maxTools) throw new Error(`backend exposes more than ${this.maxTools} tools`);
await new Promise<void>((resolve) => setImmediate(resolve));
```

Wrap `client.close()` in its own timeout in both connect cleanup and global close. Catch only Coach recording/suggestion failures and never include raw call data in diagnostics. Remove `lastDraftId` fallback; an omitted or unknown ID maps to `null` attribution.

- [ ] **Step 4: Classify SDK output validation as output drift**

Recognize the SDK-owned prefixes `Structured content does not match the tool's output schema`, `Failed to validate structured content`, and `has an output schema but did not return structured content`; preserve the original JSON-RPC code while setting `outputSchemaViolation: true`.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run packages/router/src/router.test.ts packages/coach/src/classifier.test.ts`  
Expected: PASS.  
Commit: `fix(router): bound backend lifecycle and degrade learning safely`

### Task 3: Coach transactional invariants

**Files:**
- Modify: `packages/coach/src/store.ts`
- Test: `packages/coach/src/store.test.ts`

**Interfaces:**
- `pruneMissing(...)` keeps its public signature.
- `recordOutcome(...)` keeps its public signature and returns the inserted ID only after the transaction commits.

- [ ] **Step 1: Add deterministic failing transaction tests**

Use two real file-backed DB connections and an intercepted select to refresh `last_seen` between the old snapshot and delete. Inject an exception in suggestion update and assert the outcome insert rolls back.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run packages/coach/src/store.test.ts -t 'prune|recordOutcome'`  
Expected: the refreshed row is deleted and the failed outcome remains committed.

- [ ] **Step 3: Move reads and writes into immediate transactions**

```ts
let gone: Array<{ id: string }> = [];
const run = this.db.transaction(() => {
  const all = selectAll.all();
  gone = computeGone(all);
  for (const row of gone) { /* tombstone + deletes */ }
});
run.immediate();
```

Wrap outcome insert, soft-fail marking, and suggestion-taken marking in one transaction using transaction-local prepared statements.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm exec vitest run packages/coach/src/store.test.ts`  
Expected: PASS.  
Commit: `fix(coach): make prune and outcome updates atomic`

### Task 4: Coach vector repair and stale-writer guard

**Files:**
- Modify: `packages/coach/src/util.ts`
- Modify: `packages/coach/src/store.ts`
- Modify: `packages/cli/src/serve.ts`
- Test: `packages/coach/src/store.test.ts`

**Interfaces:**
- `storeBaseVec(capability, vec, now?, expected?: { defHash: string; modelId: string }): boolean` returns whether the guarded write landed.
- `vecCapabilityIds()` returns only valid, finite base-vector rows and repairs invalid rows transactionally.

- [ ] **Step 1: Extend the malformed-vector test and add a stale-backfill test**

```ts
expect(store.loadVecs().has("a__t")).toBe(false);
expect(store.vecCapabilityIds().has("a__t")).toBe(false);
expect(db.prepare("SELECT 1 FROM vec WHERE capability=?").get("a__t")).toBeUndefined();
```

Interleave old-definition embedding, drift, and guarded store; assert the vector row stays absent. Repeat with a model switch.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run packages/coach/src/store.test.ts -t 'vector|stale backfill|model'`  
Expected: corrupt ID remains embedded and stale writes recreate rows.

- [ ] **Step 3: Implement finite validation, repair, and SQL compare-and-set**

Validate byte length, positive integer dimensions, and every float's finiteness. Delete invalid base rows, clear invalid adjustments, and discard invalid need vectors during OATS. Guard the `INSERT … SELECT` with current `capability.def_hash` and `meta.embedding_model` predicates.

- [ ] **Step 4: Pass expected definition/model values from warmup**

```ts
store.storeBaseVec(entry.id, vec, Date.now(), {
  defHash: defHash(entry),
  modelId: provider.modelId,
});
```

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run packages/coach/src/store.test.ts`  
Expected: PASS.  
Commit: `fix(coach): repair vectors and reject stale embeddings`

### Task 5: Classifier quoted diagnostics

**Files:**
- Modify: `packages/coach/src/classifier.ts`
- Test: `packages/coach/src/classifier.test.ts`

**Interfaces:** `classifyToolFailKind(errorText)` retains its type and deliberate timeout → quota → internal → schema → auth ordering.

- [ ] **Step 1: Add failing fully quoted cases plus literal-path counterexamples**

```ts
expect(classifyToolFailKind('"request timed out"')).toBe("timeout");
expect(classifyToolFailKind('"Internal Server Error"')).toBe("internal");
expect(classifyToolFailKind(`ENOENT open 'auth-token.txt'`)).toBe("other");
```

- [ ] **Step 2: Verify RED, implement fallback, and verify GREEN**

Use redacted text when non-empty; when quote stripping erases the entire message, classify the unwrapped whole-message text. Keep the existing precedence and bounded regexes.

Run: `pnpm exec vitest run packages/coach/src/classifier.test.ts`  
Expected: PASS.  
Commit: `fix(classifier): preserve fully quoted diagnostics`

### Task 6: Combine symlink-safe verification and strict suites

**Files:**
- Modify: `packages/combine/src/runner.ts`
- Modify: `packages/combine/src/task.ts`
- Modify: `packages/combine/test/fixtures/fake-fs-server.mjs`
- Test: `packages/combine/src/combine.test.ts`

**Interfaces:** Verifier public union remains unchanged. `parseSuite` rejects malformed records before execution.

- [ ] **Step 1: Add real-server failing tests for external and dangling symlinks**

The fixture adds a test-only tool that creates an external target plus sandbox symlink, and another that creates a dangling symlink. `fileEquals`, `fileExists`, and `fileAbsent` must all fail these states.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run packages/combine/src/combine.test.ts`  
Expected: both symlink tasks incorrectly pass.

- [ ] **Step 3: Implement exact no-follow path inspection**

Walk every path component with exact `readdir` membership and `lstatSync`; reject any symbolic link. Read only after confirming `realpathSync` remains below the real sandbox root. Define absence as no directory entry, not `existsSync`.

- [ ] **Step 4: Add parser tests and strict validation**

Reject null/non-object tasks, array/non-object args, malformed setup/files, non-string setup contents, and non-positive/non-finite timeouts with stable suite-derived messages.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run packages/combine/src/combine.test.ts`  
Expected: PASS.  
Commit: `fix(combine): enforce no-follow sandbox verification`

### Task 7: Complete Playbook trust discovery

**Files:**
- Modify: `packages/playbook/src/skill.ts`
- Modify: `packages/playbook/src/scan.ts`
- Modify: `packages/playbook/src/trust.ts`
- Test: `packages/playbook/src/playbook.test.ts`
- Test: `packages/router/src/router.test.ts`

**Interfaces:** `ParsedSkill` gains `scanWarnings: string[]`; manually constructed partial trust inputs may omit it.

- [ ] **Step 1: Add failing hidden-script, directory-symlink, executable, and cap tests**

Assert each scan produces `status: "review"` and that Router withholds it by default. Hidden entries are scanned; symlink directories are flagged but never followed.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run packages/playbook/src/playbook.test.ts packages/router/src/router.test.ts -t 'hidden|symlink|executable|incomplete'`  
Expected: current reports are `ok`.

- [ ] **Step 3: Implement complete discovery accounting**

Traverse dot-prefixed entries in the security walk, identify known script extensions or executable bits, use `lstat`, and append warnings for symlinks, unreadable directories/files, and reaching `MAX_SCRIPTS_SCANNED`. Convert warnings into stable `scan-incomplete`/`symlink` findings.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm exec vitest run packages/playbook/src/playbook.test.ts packages/router/src/router.test.ts`  
Expected: PASS.  
Commit: `fix(playbook): fail closed on incomplete skill scans`

### Task 8: CLI config validation and cross-process locking

**Files:**
- Create: `packages/cli/src/lock.ts`
- Modify: `packages/cli/src/rosterfile.ts`
- Modify: `packages/cli/src/init.ts`
- Modify: `packages/cli/src/telemetry.ts`
- Modify: `packages/cli/src/sync.ts`
- Test: `packages/cli/src/cli.test.ts`

**Interfaces:**
- `withFileLockSync<T>(key: string, fn: () => T): T`.
- `updateConfig<T>(mutator: (config: RosterConfig) => T): T` performs locked reload/mutate/save.
- `MergeResult` gains `changed: boolean`.

- [ ] **Step 1: Add failing array-config and two-process import tests**

Assert `servers: []` is rejected before client rewrite. Start Cursor and Codex imports simultaneously; both commands complete and final `roster.json` contains both definitions.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run packages/cli/src/cli.test.ts -t 'array-valued|concurrent imports'`  
Expected: false success and one lost server.

- [ ] **Step 3: Implement owner-only atomic lock directories and strict config normalization**

Use `mkdir` as the atomic acquisition, record PID, wait briefly for live owners, and reclaim only dead owners. Validate version, record fields, server entries, string arrays, and boolean settings; never spread unvalidated parsed values.

- [ ] **Step 4: Route every config mutation through `updateConfig`**

Save when a duplicate gains a new `importedFrom`, not only when a server is added. Keep lock ordering client lifecycle → roster config.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run packages/cli/src/cli.test.ts`  
Expected: PASS.  
Commit: `fix(cli): serialize and validate roster config updates`

### Task 9: CLI exact ownership and unsupported transport refusal

**Files:**
- Modify: `packages/cli/src/entry.ts`
- Modify: `packages/cli/src/rosterfile.ts`
- Modify: `packages/cli/src/sync.ts`
- Modify: `packages/cli/src/eject.ts`
- Test: `packages/cli/src/cli.test.ts`

**Interfaces:**
- Replace structural `isRosterProxyEntry` use with `isOwnedRosterEntry(candidate, ownedEntries)` exact matching.
- Active valid manifests provide historical exact injected entries.

- [ ] **Step 1: Add failing lookalike, foreign-bin, legacy-eject, URL-only, and provenance-only tests**

Cover bare third-party `roster serve`, `node /foreign/bin.js serve`, `npx unrelated serve`, a missing-identity state manifest, URL-only Cursor, and a duplicate definition imported from a second client.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run packages/cli/src/cli.test.ts -t 'lookalike|foreign bin|legacy|URL-only|provenance'`  
Expected: imports are dropped, foreign entry is considered healthy, legacy entry is deleted, URL backend is blackholed, and provenance is unsaved.

- [ ] **Step 3: Implement exact identity and fail-closed behavior**

Recognize the current exact entry, a provably owned global entry, and exact entries in intact manifests. Do not infer ownership from basename or `serve`. Abort URL-only sync before roster/config/backup writes. Refuse legacy state key-restore unless `--force` explicitly selects pristine bytes.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm exec vitest run packages/cli/src/cli.test.ts`  
Expected: PASS.  
Commit: `fix(cli): make proxy ownership exact and refuse unsupported sync`

### Task 10: CLI symlink-preserving durable writes

**Files:**
- Modify: `packages/cli/src/rosterfile.ts`
- Modify: `packages/cli/src/sync.ts`
- Modify: `packages/cli/src/eject.ts`
- Test: `packages/cli/src/cli.test.ts`

**Interfaces:** `BackupManifest` gains optional `writePath` and `symlinkTarget` fields for backward compatibility.

- [ ] **Step 1: Add failing symlink lifecycle and changed-link tests**

Assert sync/eject preserve the symlink itself and restore bytes through its original target. Repoint the link after sync and assert eject refuses without touching either target.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run packages/cli/src/cli.test.ts -t 'symlink'`  
Expected: the link becomes a regular file.

- [ ] **Step 3: Resolve and record write topology**

Use `lstat/readlink/realpath`; atomic writes always receive the resolved regular-file target. Validate recorded topology during eject. Upgrade atomic writes to fsync the private temp before rename and best-effort fsync the parent directory.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm exec vitest run packages/cli/src/cli.test.ts`  
Expected: PASS.  
Commit: `fix(cli): preserve symlinked client configurations`

### Task 11: Multi-path and crash-recoverable eject

**Files:**
- Create: `packages/cli/src/ejectJournal.ts`
- Modify: `packages/cli/src/sync.ts`
- Modify: `packages/cli/src/eject.ts`
- Modify: `packages/cli/src/bin.ts`
- Test: `packages/cli/src/cli.test.ts`

**Interfaces:**
- `EjectResult.action` adds `integrity-error`.
- `EjectResult` adds `restoredPaths?: string[]`.
- `closeEraThrough(clientId, backupName): boolean` closes the planned boundary exactly.

- [ ] **Step 1: Add failing two-path, interrupted-eject, concurrent-state-write, and exit-status tests**

Sync two Claude project paths, eject once, and assert both restore. Recreate a crash after target write/before era closure, rerun, then sync/eject a new era and assert ERA1—not ERA0—returns. Corrupt a manifest and assert built CLI exit status is nonzero. Add a barrier that changes a live state file between initial read and publish and assert the operation retries or refuses without losing the new value.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run packages/cli/src/cli.test.ts -t 'multiple paths|interrupted eject|concurrent state|integrity exit'`  
Expected: one path is stranded, old era replays, live value is lost, and exit code is zero.

- [ ] **Step 3: Plan and journal all target restores before writing**

Group active backups by `manifest.sourcePath`, reject any corrupt slot, validate every original/current/topology guard, and write an owner-only pending plan containing exact boundary plus before/desired hashes. Desired bytes live in private journal files, not command output.

- [ ] **Step 4: Implement idempotent recovery and exact closure**

On recovery: desired hash means the write landed; before hash means it did not; a closed boundary means cleanup only; any third hash refuses. Compare state-file bytes immediately before publish and recompute a bounded number of times. Close only the journal's boundary after every target is complete, then clear/archive.

- [ ] **Step 5: Make integrity failures process failures and commit**

Count `integrity-error` as a refusal in `bin.ts`; keep ordinary `no-backup` successful.

Run: `pnpm exec vitest run packages/cli/src/cli.test.ts`  
Expected: PASS.  
Commit: `fix(cli): make eject multi-path and crash recoverable`

### Task 12: League authoritative identity and comparison sets

**Files:**
- Modify: `apps/league/src/artifact.ts`
- Modify: `apps/league/src/build.ts`
- Modify: `apps/league/src/pages.ts`
- Test: `apps/league/test/league.test.ts`

**Interfaces:**
- Replace `SuiteSigning` with `SuiteAuthority`, keyed by `JSON.stringify([suite, version])`, containing `category` and task signing/descriptions.
- `boxScoreFilename(run, generatedAt?)` includes a stable SHA-256 identity suffix.

- [ ] **Step 1: Add failing category-forgery, tuple collision, filename collision, and mixed-suite ranking tests**

Assert a run with a changed category is `tampered`; `(A, B C)` and `(A B, C)` both survive latest selection; lossy names get different files; two suite versions in one category do not receive ranks in one table.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run apps/league/test/league.test.ts -t 'category|tuple|filename|mixed suite'`  
Expected: certification succeeds incorrectly, one run disappears, one file overwrites, and both rank together.

- [ ] **Step 3: Implement structured authorities, keys, filenames, and partitions**

Use JSON tuple keys, bind category in certification, keep suite-specific description maps, hash full public identity into filenames, and group standings by `(category, suite, suiteVersion)`.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm exec vitest run apps/league/test/league.test.ts`  
Expected: PASS.  
Commit: `fix(league): bind scores to identical authoritative suites`

### Task 13: Strict and atomic League builds

**Files:**
- Modify: `apps/league/src/artifact.ts`
- Modify: `apps/league/src/build.ts`
- Test: `apps/league/test/league.test.ts`

**Interfaces:** `BuildOptions` gains `allowEmpty?: boolean`; CLI recognizes `--allow-empty`.

- [ ] **Step 1: Add failing malformed metadata, invalid-date, stale-page, render-failure, and empty-build tests**

Require rejection before any output mutation for missing platform/arch, noncanonical timestamp, invalid digest, duplicate output destination, and any render exception. A second build with one removed run must leave no old page. Empty build fails unless explicitly allowed.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run apps/league/test/league.test.ts -t 'metadata|date|stale|atomic|empty'`  
Expected: parser accepts bad data, stale page remains, partial index appears, and empty build succeeds.

- [ ] **Step 3: Validate strictly and publish from staging**

Validate canonical ISO strings, non-empty identities, environment strings, and `/^[a-f0-9]{64}$/`. Sort by numeric timestamp. Render every page into a unique in-memory destination set, write a private staging directory, rename existing output aside, rename staging into place, and roll back on swap failure.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm exec vitest run apps/league/test/league.test.ts`  
Expected: PASS.  
Commit: `fix(league): validate artifacts and publish complete sites`

### Task 14: Truthful counts, release floors, and public docs

**Files:**
- Modify: `packages/router/src/rosterServer.ts`
- Modify: `packages/cli/src/serve.ts`
- Modify: `package.json`
- Modify: publishable `packages/*/package.json` and `apps/league/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `STATUS-FOR-MO.md`
- Modify: `docs/methodology.md`
- Modify: `docs/lab/round5-remediation.md`
- Test: relevant router/CLI/League tests

**Interfaces:** `RosterServer.servedSkillCount(): number` reports the post-trust, post-identity map size.

- [ ] **Step 1: Add a failing served-count test**

Construct one benign and one withheld skill; assert startup-facing count is one, not the scanned count.

- [ ] **Step 2: Implement count and exact runtime floors**

Use the server's final map size in the startup line. Set root and publishable package engines to `>=22.13`; add an explicit `22.13.x` CI floor job while retaining current supported majors.

- [ ] **Step 3: Update public claims from verified behavior only**

Document stdio-only routing and URL sync refusal, exact-vs-key-level eject semantics, stable ID migration for lossy names, Trust scan fail-closed boundaries, identical-suite League partitions, and the completed regression evidence. Do not add performance or adoption numbers.

- [ ] **Step 4: Run scoped gates and commit**

Run: `pnpm build && pnpm lint && pnpm test && pnpm league:build`  
Expected: all pass and League builds from at least one artifact.  
Commit: `docs: align release claims with hardened behavior`

### Task 15: Mutation locks and final verification

**Files:**
- Modify only tests whose mutation fails to go red.
- Create: `docs/lab/review-round5-hardening.md`

**Interfaces:** No production API changes.

- [ ] **Step 1: Mutation-check one load-bearing test per fixed defect class**

Temporarily remove/revert: exact proxy identity, URL refusal, client/config lock, eject journal closure, symlink no-follow, stable ID hash, cursor-cycle guard, record catch, prune transaction predicate, vector CAS, Playbook incomplete warning, League category binding, suite partition, filename hash, and staging swap. Run the named focused test, require RED, then restore without `git checkout --`.

- [ ] **Step 2: Run all final gates sequentially**

```sh
pnpm build
pnpm lint
pnpm test
pnpm league:build
git diff --check
git status --short
```

Expected: zero failures/warnings, League output from a real committed artifact, and only intended tracked changes.

- [ ] **Step 3: Review privacy and public-score write paths**

Use `rg` to inspect every production stdout/stderr/file/DB write and every named-score render. Confirm no raw args/results/prompts and no uncertified `signedWilsonLb` path.

- [ ] **Step 4: Write the evidence report and commit**

Record HEAD/base, environment, exact commands, red-green evidence, mutation outcomes, remaining owner decisions, and anything unexecuted.  
Commit: `test: verify objective production hardening`

