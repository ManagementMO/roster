# Concurrency stress: multi-process contention, crashes, torn writes

**Question.** ROSTER claims multi-process safety (WAL + busy_timeout on coach.db; "tmp + rename" on roster.json). Does it hold under real OS processes, real kill -9, real shared files?

**Method.** All runs are real `child_process.spawn` node processes importing the built dist packages (`@rosterhq/coach`, `@rosterhq/cli`) against real SQLite files and a real roster.json under `docs/lab/tmp-concurrency-stress/` (ROSTER_TEST_HOME; never the real HOME). Vectors are real MiniLM (sentence-transformers/all-MiniLM-L6-v2, transformers.js), embedded once in the parent (133 corpus tools + 66 needs, 384 dims, 501 ms warm) and stored/read by the children — no mocks, no synthetic vectors. Scripts: `exp-concurrency-stress.mjs` (orchestrator), `-worker` (mixed ops), `-sync-worker` (serve-boot sync race), `-crash-writer` (kill victim), `-config-writer` / `-adder` (saveConfig races), `exp-concurrency-stress-2.mjs` (WAL-spill kills, repeats, forensics). Raw numbers: `docs/lab/results-concurrency-stress.json`.

## (a) 8 processes × 200 mixed ops, one shared coach.db — CLEAN

8 concurrent processes, barrier-started, each running a shuffled mix of 80 recordOutcome / 50 draftCandidates (real need vectors on half) / 50 upsertCapabilities (2% drift mutations) / 20 recomputeRatings against one WAL DB seeded with the 133-tool corpus + real base vectors.

| metric | value |
|---|---|
| ops attempted / succeeded | 1600 / 1600 |
| SQLITE_BUSY / SNAPSHOT / any thrown error | **0** |
| worker crashes | 0 |
| integrity_check / foreign_key_check | ok / 0 violations |
| outcome rows expected (sum of per-worker acks) vs actual | 640 = 640 (no lost committed writes) |
| capability / fts rows, orphans | 133 / 133, 0 orphans both directions |
| worst single-op latency | recordOutcome 220.9 ms; recomputeRatings 90.6 ms; upsert 98.7 ms (all ≪ 5 s busy_timeout) |
| per-op p50 (median across workers) | 0.11–0.81 ms |

All 8 workers overlapped (per-worker wall 283–467 ms inside a 489 ms window). Verdict: `busy_timeout=5000` + BEGIN IMMEDIATE upserts absorb this contention completely. Caveat: burst load, not hours-long soak.

## (b) two processes racing serve-boot sync cycles, divergent rosters — time-windowed guard, measured boundary

Two processes each looping the exact serve-boot sequence (`bootStarted = now; connect-delay 20–60ms; upsertCapabilities; vec backfill; pruneMissing(myIds, ∅, {keepSeenSince: bootStarted})`) × 30 cycles. Roster A = 20 shared + 10 A-only tools; roster B = 20 shared + 10 B-only.

- A found its 10 exclusive capabilities **deleted at the start of 10 of 29 checked cycles** (100 id-losses); B at 8 of 29 (80 id-losses). Their real MiniLM base vectors were deleted with them every time (10 + 8 vec-loss events).
- Final DB (B's prune ran last): **all 10 A-only capabilities and their vectors gone** while "serve A" was still live.
- Zero SQLITE errors, integrity ok — this is not corruption; it is the designed semantics measured: `keepSeenSince` protects only rows upserted **during** the other process's boot window. Overlapping boots were protected (~2/3 of cycles here); any sequential interleaving (sibling's bootStarted after my last upsert) deletes a live sibling's rows + vectors.
- Consequences for the losing serve: its draft path reads the DB, so drafted rosters silently lose those tools until its next boot re-upserts; re-added rows return as fresh "added" (first_seen reset, drift baseline gone — a definition change across the delete window produces no drift event). Outcome history and need_vecs survive, so OATS adj is re-derivable at the next maintenance; base vecs re-embed at warmup. Cost = degraded routing window + drift-baseline reset, not permanent learning loss.
- Production reachability: all serves read one `~/.roster/roster.json`, so sustained divergence requires a config edit between boots (removal ⇒ prune intended) or two homes on one DB. The stale-read race the code comment names is the concurrent case — which the guard did protect in every overlapping cycle observed.

## (c) kill -9 a writer, 28 rounds — CLEAN, including true WAL-spill rollback

Run 1 (20 rounds, alternating): 10 × "longtx" (SIGKILL confirmed mid-BEGIN IMMEDIATE) and 10 × "apiloop" (SIGKILL during real recordOutcome/upsert/checkpoint loop, 83–777 acked commits).

- 20/20: `integrity_check` ok on fresh reopen; 0 torn transactions visible; 0 durability violations (visible committed rows ≥ acked in all 10 apiloop rounds; 5 rounds had exactly +1 row — commit landed, ACK pipe died at kill: expected).
- Learned truth: all 10 longtx kills died with a **0-byte WAL** — a killed transaction of small rows never leaves the pager cache, so run 1 never actually exercised WAL rollback.

Run 2 ("bigtx", 8 rounds): 64 KB blob inserts until uncommitted frames **spill into the -wal** (parent kills only after -wal ≥ 256 KB; observed 1.29–5.67 MB of uncommitted frames at SIGKILL).

- 8/8: integrity ok, 0 uncommitted rows visible after reopen, WAL truncated to 0 by recovery. Crash atomicity + recovery hold for real.

## (d) saveConfig races — the tmp+rename claim is FALSE under concurrency (shared fixed tmp name)

`saveConfig` writes `roster.json.tmp` (one fixed name) then renames. Four processes × 100 real `saveConfig()` calls on one home, parent polling reads; then 5 repeats; then 20 rounds of two racing `loadConfig → mergeServers → saveConfig` (the `roster add` sequence).

| metric | run 1 | 5-rep total | racing-add (20 rounds) |
|---|---|---|---|
| saveConfig calls crashed ENOENT (sibling renamed the shared tmp away) | 230/400 (57.5%) | 1133/2000 (56.7%) | 9/20 rounds had a crash |
| reader saw torn/empty roster.json | 13/960 reads (7 empty, 6 mixed) | 96/4800 (2.0%) | — |
| **final roster.json permanently corrupt** | 0 | 0/5 | **2/20 rounds (10%)** |
| writer reported OK but its server missing (ack-lost) | — | — | **10/20 rounds** |
| both OK yet one server missing (pure lost update) | — | — | 3/20 |
| crashed writer's data survived anyway | — | — | 7/20 |

- Torn mechanism (confirmed byte-for-byte): two O_TRUNC opens of the same tmp precede both writes, so the shorter later write leaves the longer earlier write's tail — captured live: 12,212-byte file = valid 12,132-byte JSON + 80 residual bytes; corrupt d3 finals = 476-byte valid JSON + stray `}\n` (full bytes preserved in results JSON `evidencePreserved`).
- Measured blast radius: real `loadConfig()` on the live-captured torn file throws `~/.roster/roster.json is malformed JSON …` — and `serve()` calls `loadConfig()` unguarded (packages/cli/src/serve.ts line 15), so **every client's roster boot crashes until the user hand-repairs the file**. Demonstrated on the surviving corrupt home: threw=true.
- Ack semantics are scrambled: a writer that returned success can have published a *sibling's* bytes (its own change lost), while a writer that crashed ENOENT can be the one whose change survived.

## Conclusions

1. coach.db multi-process story is solid under this load: 0 errors / 0 corruption / 0 lost or torn writes across 1600 contended ops and 28 kill -9 rounds incl. 8 with MB-scale uncommitted WAL spill. (MEASUREMENT)
2. roster.json concurrent writes are unsafe three ways: 57% ENOENT crashes, 2% torn reads (boot-crashing while present), and 10% of two-process `add` races leaving **permanent** corruption. The in-code safety comment is contradicted by measurement. (MEASUREMENT) Proposal: unique tmp per write (`${target}.${pid}.${nonce}.tmp`) + rename, fsync optional; consider advisory locking or load-merge-retry for read-modify-write. (PROPOSAL — not applied)
3. `keepSeenSince` is a time-window guard, not roster-awareness: sequential divergent boots delete a live sibling's capabilities + vectors (18 loss events / 180 ids in 60 cycles); concurrent boots were protected. (MEASUREMENT) Proposal option: prune only rows whose source is in MY config, or compare config mtime. (PROPOSAL)
