# drift-sim — Drift/quarantine lifecycle vs spec over 30 simulated days

**Question.** Does the real drift/quarantine lifecycle (CoachStore on a real SQLite file, real MiniLM vectors, real CLI) match the spec — handoff §7 drift rule, handoff §6.2 classifier rule 3, methodology.md §6 — across a month of one server evolving?

**Method.** `docs/lab/exp-drift-sim.mjs`: the 133-tool shared corpus is the ambient roster; the `github` source evolves over 30 virtual days (virtual clock passed through the store's public `now` parameters — the real code path, no source modification, no column surgery). Every "connect" runs the real `upsertCapabilities` + `pruneMissing` pair exactly like `RosterServer.syncCapabilities`. All vectors are real MiniLM inference (`TransformersEmbeddings`, 384-d); ratings come from real `recordOutcome`/`recomputeRatings`; OATS runs the real nightly job; the unquarantine CLI runs as a real subprocess (`ROSTER_TEST_HOME` → scratch home) against the same DB file. 48 assertions, **0 failures**. Raw output: `docs/lab/results-drift-sim.json`.

Event script: day 1 benign description tweak · day 3 schema field added · day 6 full signature change · day 8 flap A→B→A within dwell · day 10 tool removed · day 13 drift→removed mid-dwell · day 14 both re-added · day 16 three tools change in one connect · day 16 manual unquarantine (store call + real CLI) · day 18 rated-fallback probe · day 21 outputSchema-only change + runtime `schema_drift_suspect` · day 30 ledger audit.

## Numbers

### Lifecycle conformance (what works as documented)

| Check | Result |
|---|---|
| First connect: 133 added, 0 drift events | PASS |
| Description tweak → 1 drift_event row, old/new hash correct, quarantined | PASS |
| Quarantined tool out of `draftCandidates` + `listCapabilities()` (visible with `includeQuarantined`) | PASS |
| 24h dwell honored: still quarantined at +1h/+6h/+23h re-sights | PASS (flag=1,1,1) |
| Auto-clear on first re-sight past dwell (+25h) | PASS |
| No-re-sight-for-48h → first re-sight clears immediately | PASS |
| Flap A→B→A at +0h/+6h: 2 chained drift events, dwell restarts (Q at +23h post-flap-back, clear at +25h) | PASS |
| 3 tools in one connect → 3 events, same ts; only those 3 benched (19/22 github tools stay active) | PASS |
| `store.clearQuarantine` mid-dwell works; survives later re-sights | PASS |
| Real CLI `roster unquarantine github__list_commits` (subprocess) → exit 0, flag flipped in shared DB | PASS |
| Rated fallback (zero-token need): wilson order t1(.610) > t3(.510) > t5(.376); quarantined leader skipped, t3 promoted | PASS |
| Ratings continuity across benign AND signature drift (rows byte-identical) | PASS |
| Drift history + outcomes + ratings survive prune; hash chains contiguous; ledger newest-first; 10 events total; 0 quarantined at day 30 | PASS |

### Divergence 1 — quarantine escape via remove/re-add (measured)

| Scenario | Result |
|---|---|
| t5 removed day 10, re-added day 14 with a **changed definition** | fresh `added`, **0 drift events, not quarantined** |
| t6 drifts day 13 (quarantined), pruned 2h later, re-added day 14 — **22h into its dwell** — with the drifted def | fresh `added`, **active immediately**, dwell voided |

`pruneMissing` deletes the capability row (the drift baseline); re-insert takes the `!row` branch with `quarantined=0`. The public drift history records nothing for the definition change, and t5's old 4/5 rating (wilson .376) rides the new definition (H03 PASS).

### Divergence 2 — runtime `schema_drift_suspect` raises no drift event (measured)

Real classifier (`classifyOutcome({outputSchemaViolation:true})` → `schema_drift_suspect`) + real `recordOutcome`: drift_event count unchanged (10), tool not quarantined. Handoff §6.2 rule 3 says this "(also raises a drift event)". The only `INSERT INTO drift_event` in the codebase is in `upsertCapabilities`.

### Divergence 3 — quarantine lifts with zero re-Combine (measured)

All 7 quarantine clears this month (5 auto, 2 manual) happened with **no Combine run anywhere**. Methodology §6 and handoff §7 both say "quarantined … pending a re-run of its Combine suite". STATUS-FOR-MO.md documents the implemented design (24h dwell + stable re-sight + CLI) — the two spec docs were never amended (NR5 concern).

### Divergence 4 (behavioral truth, spec silent) — signature change: all learned state transfers to the new semantics

t3 (`github__get_file_contents`, 4/4 rating, OATS-adjusted for file-reading needs) became a deploy-dispatch tool on day 6:

| Stage | served vec is | cos(served, OLD desc) | cos(served, NEW desc) | cos(base, NEW desc) |
|---|---|---|---|---|
| after drift, before next warmup | adj | **0.9019** | 0.4706 | 0.4477 |
| after warmup re-embed (base rewritten) | adj | **0.9019** | 0.4706 | 1.0000 |
| after next nightly OATS | adj | 0.7220 | 0.7913 | 1.0000 |

`storeBaseVec` deliberately preserves `adj` on same-dims rewrite and `loadVecs` prefers `adj`, so the draft-facing vector is 100% old-semantics until the *next* nightly OATS — and even then OATS re-blends from the 90-day outcome window (all old-semantics), leaving a permanent 0.72-cos pull toward what the tool *used to do*. Draft-level consequence (real inference, post-clear): the OLD-semantics need "read the contents of a file stored in a github repository" ranks the re-purposed deploy tool **#1** (dense governing, cos span 0.413) ahead of the now-correct `fs__read_file` (#3). Rating (wilson .510 from the old signature) also transfers wholesale.

### Also measured

- **outputSchema-only change**: no drift event (conforms to §7's hash triple, which omits outputSchema) — but the new outputSchema is **never persisted** either: the stable-hash branch only touches `last_seen`, so the store's `output_schema` column stays stale indefinitely (K02).
- Per-tool quarantine: methodology's "tool/server is quarantined" resolved as tool-only; ROSTER.md's narrative ("server … benched pending review") is not what ships (I02).
- Code-read (not live-exercised): five-mode `call` resolves via `manager.lookup` with no quarantine check — a quarantined tool stays directly callable; quarantine gates drafting/listing only. Consistent with "quarantine from default rosters", noted for completeness.

## Conclusion

The implemented dwell lifecycle is solid and exactly matches STATUS-FOR-MO's description — to the hour, across flaps, same-day multi-drift, manual clears, and a real CLI subprocess. The divergences are between that implementation and the two *spec* documents: (1) remove/re-add fully bypasses the drift ledger and quarantine (including an active dwell), (2) runtime schema-drift suspicion never reaches the drift ledger despite handoff §6.2 rule 3, (3) "pending re-Combine" is not a thing — time heals all quarantines, and (4) a full signature change carries its predecessor's rating, OATS vector, and outcome history into a semantically different tool, measurably steering old-semantics drafts to it at #1.

Scope honesty: one evolving server, single store process (concurrency covered by sibling experiment), MiniLM only, 30 virtual days driven through public `now` parameters; wall time under a minute with the model cache warm (warmup embed of 133 tools: 400ms).
