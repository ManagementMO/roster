# Byte-for-byte eject under fuzz — the trust surface (slug: sync-eject-fuzz)

**Question.** `roster init` promises: "`roster eject` restores byte-for-byte." Does it — under weird-but-valid configs, random op sequences, tampered backups, and crashes at every window? All runs are real: real dist/ modules, real files under `ROSTER_TEST_HOME` fixture homes, real subprocesses for crash simulation. Raw data: `docs/lab/results-sync-eject-fuzz.json`. Node v22.22.3, 2026-07-04.

## A. 100 valid-but-weird configs, full sync → eject → raw-Buffer compare

26 JSON/JSONC variants x {claude-code, cursor, openclaw} + 22 TOML variants for codex = 100 cases (unicode keys, 8-deep env objects, ~1MB files, empty/null/array `mcpServers`, mixed indentation, CRLF/CR, no trailing newline, JSONC comments+trailing commas, UTF-8 BOM, duplicate keys, lone surrogates, 1e999/-0, NUL escapes, TOML datetimes/inf/nan/hex/multiline/dotted keys, ...).

| metric | value |
|---|---|
| byte-identical after full cycle (raw Buffer) | **100/100** |
| sync actions | synced 90 · already-synced 4 · THREW 6 |
| eject actions | restored 90 · no-backup 10 (the 4+6 above; configs untouched) |
| tmp litter / unparseable written configs | 0 / 0 |

Every completed sync→eject cycle restored the original **byte-for-byte**, including BOM-free unicode, CRLF, 1MB, and no-trailing-newline cases. The claim holds where the cycle completes.

**But:** `utf8-bom` and `scalar-top-level` made `syncClient` **throw** (`JSON.parse` rejects BOMs; property-set on a primitive). Config untouched (fail-safe) — however see B2. And `array-top-level` "syncs" without ever writing a roster entry (E1).

Non-write-client probes (exported `syncClient`; `roster sync` CLI blocks these): claude-desktop/gemini-cli/windsurf sync fine; **vscode and zed get a dead `mcpServers`/wrong-key entry while their real `servers`/`context_servers` keys stay live** (config claims "synced", client keeps old routing); hermes (YAML) throws. Latent API hazard only.

## B. Real-CLI abort behavior + 30-sequence fuzz (420 ops)

**B2 — one weird config halts the fleet (real `dist/bin.js` subprocess):** with a BOM on claude-code (1st in WRITE_CLIENTS): `roster sync` exit 1, **0 of 4 clients synced**, error is a raw `Unexpected token '﻿' ... is not valid JSON` — no filename, no client name. With the BOM on codex (3rd): claude-code+cursor sync, then abort — **openclaw never synced**. The sync loop in bin.ts has no per-client try/catch. BOM'd JSON configs are common on Windows.

**B1 — sequence fuzz:** 30 seeded sequences x 14 ops (sync/eject/eject-force/user-edit-add/user-edit-unrelated/touch/delete-config/sync-all/eject-all) over all 4 write clients, invariants checked after **every** op:

| invariant | violations / 420 ops |
|---|---|
| I1 user servers never lost (config ∪ roster.json; forced ejects + user self-deletes excused) | **0** |
| I2 every backup sufficient (`original` present + sha matches manifest) | **0** |
| I3 `latest` pointer == newest manifest timestamp | **0** |
| I4 era archived after every restore | **0** |
| I5 every "restored" == era-pristine bytes (Buffer equality) | **0** |

(An earlier run flagged 135 I1 "violations" — all 16 distinct losses traced to the *user deleting their own never-synced config*, a harness modeling artifact, verified by replay. `latest` is also write-only: zero readers in the entire src tree.)

**B3 — same-millisecond double-sync destroys the pristine.** `syncClient(id, T)` twice with the same `T` (config edited in between) → the second sync **overwrites the pristine backup in place** (backup dir key = ms timestamp): `backupDirCount: 1`, `pristineDestroyed: true`, eject then "restores" the post-edit roster-pointing bytes and reports `restored`. Original config is unrecoverable. Not reachable via the CLI today (process startup >> 1ms); any long-running embedder of the exported API can hit it.

## C. Tamper matrix (corrupt one byte, then eject)

| tamper | eject result | safe? |
|---|---|---|
| flip 1 byte mid `original` | refuse: "BACKUP INTEGRITY FAILURE", config untouched | yes |
| truncate `original` to 0B | refuse (same) | yes |
| delete `original` | refuse: "backup bytes missing" | yes |
| flip 1 hex digit of recorded sha (valid manifest) | refuse (fail-closed) | yes |
| corrupt manifest (invalid JSON), 1-backup era | "no-backup" (empty detail) — pristine bytes sit intact on disk | safe but misleading |
| **corrupt PRISTINE manifest (invalid JSON), 2-backup era** | **action `restored` — but restores backup #2's bytes: user-edited, still roster-pointing. `silentWrongRestore: true`; true pristine shuffled into the archived era** | **NO** |
| baseline (2-backup era, no tamper) | restores true pristine C0 | yes |
| manifest `sourcePath` tampered + `--force` | "restored" **written to the wrong path**; real config untouched, era archived anyway | no (needs force) |
| consistent tamper (bytes + re-hashed manifest) | restores attacker bytes as "restored" | expected: integrity is self-referential, no anchor |

The asymmetry is the finding: **`original` is hash-guarded; `manifest.json` is not** — the same single-byte corruption produces a loud refusal in one file and a silent wrong restore in its neighbor (`listBackups` silently skips corrupt manifests, so "oldest backup" is silently redefined).

## D. Crash windows — SIGKILL at every mutating fs op (subprocess `process.exit(9)` in an fs interceptor; torn = half bytes land)

Clean sync = 9 mutating ops: `mkdir .roster → write+rename roster.json → mkdir backupdir → write original → write manifest → write latest → write cfg.tmp → rename cfg`. Clean eject = 4.

| phase | windows | unrecoverable |
|---|---|---|
| sync kills (k=1..9) | 9 | **0** |
| sync torn writes (all 5 writeFileSync ops) | 5 | **0** |
| eject kills (k=1..4) | 4 | **0** (config always C0 or fully-roster; never mixed) |

Every state is either "config untouched" or "config fully written with a valid, findable backup". Torn `original` → manifest missing → skipped → safe; torn manifest → CORRUPT+skipped, config still original → safe. Notable UX truths: after a crash in ops 7–9 (backup done, config not yet swapped) or after an eject crash before era-archival, a plain `roster eject` says **"refused-modified — config was modified after sync"** even though nothing was modified (misleading, but data-safe; `--force` or re-sync recovers).

**D2 — fs-ERROR injection (throw instead of kill):** a failing fs call during the import-save phase (ops 1–3: mkdir `.roster`, write/rename `roster.json`) is **swallowed by syncClient's catch-all** — sync completes, reports `synced` (imported=0), config rewritten to roster-only, roster.json **never written**: the user's imported servers are routed **nowhere**, with no warning. The catch was written for unparseable configs but also eats ENOSPC/EPERM-class save failures. (Bytes still recoverable via backup+eject; the live agent silently loses its tools.) Ops 4–9 failures propagate correctly and leave the config untouched.

## E. Micro-probes

- **E1**: top-level-array config: 4 consecutive syncs → `["synced","synced","synced","synced"]`, 4 backup dirs, final config `[]\n` — roster entry never lands (JSON.stringify drops props set on arrays; `isAlreadySynced` can never become true). False success + backup churn.
- **E2**: JSONC comments ("do not remove — legal review") are stripped from the **live config during the roster era**; eject restores them byte-perfect. The byte-for-byte claim covers eject only, not the era state.

## Conclusion

The headline claim is **true and robust where it matters most**: 100/100 byte-identical restores across weird formats, 0/420 invariant violations under sequence fuzz, 0/18 unrecoverable crash windows, and single-byte tampering of backup *bytes* always refused loudly. The measured cracks are at the edges of the trust surface: (1) a corrupt **manifest** flips the same corruption class from loud-refusal to silent wrong restore; (2) fs errors during import-save are swallowed, leaving a "synced" config with the user's tools routed nowhere; (3) one BOM'd config aborts the whole `roster sync` fleet mid-run with an anonymous error; (4) same-ms double-sync (API-only) destroys the pristine in place.
