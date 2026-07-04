# Combine integrity — adversarial lab (slug: combine-adversarial)

**Question.** Does the Combine's real runner (`@rosterhq/combine`) + the real
`@modelcontextprotocol/server-filesystem` (spawned via `npx`) actually deliver
the integrity it claims: deterministic reruns, verifiers that reject every
sabotaged end-state, no false-fails, path containment, and clean timeout
handling?

**Method.** Import the built `@rosterhq/combine` exactly like
`docs/verification/dense-live.mjs`. Drive the real `runSuite` against the real
npx filesystem server, per-task fresh sandbox. Five experiments (a)-(e). Every
number below is from code executed this run; raw output embedded in
`docs/lab/results-combine-adversarial.json` (per-experiment blobs under
`experiments.*`).

Host: node v22.22.3, darwin/arm64. **Host fs is case-insensitive AND
unicode-normalizing** (`CaseProbe.txt`→`existsSync(caseprobe.txt)=true`; NFC
`café` written → NFD `existsSync=true`). This matters for (b).

Server tools (14, empirically listed): create_directory, directory_tree,
edit_file, get_file_info, list_allowed_directories, list_directory,
list_directory_with_sizes, move_file, read_file, read_media_file,
read_multiple_files, read_text_file, search_files, write_file. **No
create_symlink.**

---

## (a) Determinism — PASS

3× `runSuite(filesystem-core)` vs the real server.

| rep | pass | time | environmentDigest |
|-----|------|------|-------------------|
| 0 | 8/8 | 3773ms | 192ca160ad31… |
| 1 | 8/8 | 3508ms | 192ca160ad31… |
| 2 | 8/8 | 3285ms | 192ca160ad31… |

`pass`/`stage`/`detail`/`signed` **identical across all reps** (per-task field
diff: NONE). `environmentDigest` **stable** (`192ca160ad31db34…`, full in
results). Only `latencyMs` and `generatedAt` vary. Determinism holds.

## (b) Mutation-testing the 8 verifiers — 4 FALSE-PASSES / 18 sabotages

Each mutant keeps the task's **real** `verify[]` (real verifier + expected
values, same run_id) and sabotages the invoke/setup so the end-state is wrong.
Every mutant MUST fail. Baseline: all 8 original tasks PASS first.

**14 sabotages correctly caught** — wrong content (`content mismatch`),
missing file / wrong path (`expected … to exist`), trailing-newline delta
(strict `===` → `content mismatch`), tool errors surfaced as `invoke` failures,
`fileAbsent` catching a still-present src, wrong dst, `resultContains` catching
absent content, and a server pointed at the wrong allowed-root.

**4 FALSE-PASSES** (verifier accepted a sabotaged end-state):

| task | mutation | why it false-passed |
|------|----------|---------------------|
| fs.create-directory.v1 | **wrong-type-file** | server wrote a regular FILE named `newdir-{run}`; the task's only verifier is `fileExists`, which is `fs.existsSync` → true. **OS-independent.** `statSync().isDirectory()` = false would catch it. |
| fs.create-directory.v1 | **case-flipped** | server made `NEWDIR-{run}`; `fileExists(newdir-{run})` true on case-insensitive fs. |
| fs.write-file.v1 | **case-flipped-filename** | server wrote `COMBINE-{run}.TXT`; `fileEquals(combine-{run}.txt)` existsSync+readFileSync both resolve the case-variant → content matches. |
| fs.write-file.v1 | **unicode-nfd-filename** | NFD path vs NFC verifier path; normalizing fs equates them → false match. |

Root causes: (1) the `Verifier` vocabulary has **no way to assert a path is a
directory** — `fileExists` is satisfied by a plain file (OS-independent gap);
(2) `fileExists`/`fileEquals` use `fs.existsSync`/`fs.readFileSync`, which
**inherit the host filesystem's path-equivalence** (case-folding + unicode
normalization), so a case/normalization-variant end-state false-passes on
macOS/APFS (would correctly FAIL on case-sensitive ext4 Linux CI).

## (c) False-fail hunt — PASS

Full suite under 5 TMPDIR shapes (varying length/nesting via `TMPDIR`, which
`os.tmpdir()` honors per call): lengths 48/73/89/194/200. **Every shape 8/8,
no flakes.**

## (d) Containment — PASS

8 escape attempts through the real runner; then a filesystem scan.

| layer | attempt | outcome |
|-------|---------|---------|
| runner-guard | setup `../escape.txt` | rejected: `path escapes sandbox` (transport) |
| runner-guard | setup absolute path | rejected: `path escapes sandbox` |
| runner-guard | setup null byte | rejected at fs layer (`without null bytes`) |
| runner-guard | setup `~/escape.txt` | literal `~` dir **inside** sandbox (Node never expands `~`); scan confirms HOME untouched |
| runner-guard | verify `../…/etc/hosts` | rejected: `path escapes sandbox` (would else existsSync a real outside file) |
| runner-guard | verify `/etc/hosts` | rejected: `path escapes sandbox` |
| server-sandbox | invoke write `{{sandbox}}/../…` | server: `Access denied - path outside allowed directories` (invoke) |
| server-sandbox | invoke write absolute-outside | server: `Access denied …` (invoke) |

Filesystem scan after all attempts: canary dir empty, no `CANARY-*` leaks in
tmp root, no leaks in HOME. **Nothing written outside a sandbox.**

Architecture note: the runner's `containedPath` guards **setup + verifier**
paths only; **invoke args are NOT guarded** — containment there is delegated to
the server-under-test (the official fs server sandboxes correctly here).
Symlink note: `containedPath` is **lexical** (`path.resolve`, not
`realpathSync`); symlink traversal is currently **unreachable** (setup writes
regular files only; the fs server has no symlink tool) but would be latent if a
future suite/server could plant a sandbox-internal symlink.

## (e) Timeout / misbehaving server — PASS

| case | elapsed | classified | child reaped |
|------|---------|-----------|--------------|
| hang-on-connect | 17018ms (~15s CONNECT_TIMEOUT + spawn) | `transport` / `connect timeout` | yes |
| hang-on-call | 2622ms (task.timeoutMs=2500) | `invoke` / `MCP error -32001: Request timed out` | yes |

Both suites **returned** (no hang); both spawned children **killed** on
completion (verified via `process.kill(pid,0)` → dead).

---

## Conclusion

The Combine's determinism, false-fail resistance, containment, and timeout
handling are **solid and empirically verified**. The one real gap is **verifier
strictness**: the verifier vocabulary cannot assert directory-ness (a file
satisfies `create_directory`, OS-independent), and file verifiers inherit the
host filesystem's case/unicode path-equivalence (false-passes on macOS; immune
on case-sensitive Linux). All affected tasks are `signed:false`, so no *named
public score* is exposed yet — but internal/anonymized stats and any future
human certification of these task definitions would inherit the gap.
