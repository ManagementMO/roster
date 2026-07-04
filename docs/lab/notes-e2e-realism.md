# notes-e2e-realism — day-in-the-life: 40 calls through the real router

**Question.** When a working agent runs a realistic 40-call session through the real
`RosterServer` (five mode, wired as `serve.ts` wires it) against real `npx` fs+memory
servers with real MiniLM need embeddings and a real SQLite file DB: does the session
learn, does Sixth Man behave, is attribution correct, and is protocol fidelity intact?

**Method.** `exp-e2e-realism.mjs`: boot mirrors `packages/cli/src/serve.ts`
(CoachStore on file DB, BackendManager over stdio npx servers — `secure-filesystem-server 0.2.0`,
`memory-server 0.6.3` — `syncCapabilities`, `runMaintenanceIfDue`, warmup backfill identical to
`makeLazyEmbedder`; deviation: embedder pre-warmed deterministically instead of lazily).
Agent = MCP SDK `Client` over `InMemoryTransport`. 40 calls: 25 well-phrased
(needs.mjs phrasings), 7 vague, 2 wrong-args→corrected-retry pairs, 4 genuine failures
(3 bad-args + 1 real blocking-I/O timeout: `read_text_file` on a mkfifo pipe, 30s).
Every call: `draft(need)` → agent picks → `call(tool, args, draft_id)`. Real
`recomputeRatings`+`runOats` after call 20 (mid-session) and after the session (nightly),
then day-2 probe drafts. Fidelity: byte-compares direct vs five vs transparent.
`exp-e2e-realism-followup.mjs`: controlled SIGKILL of the npx wrapper vs the real server;
bad-args and unknown-tool fidelity triangles. All numbers in `results-e2e-realism.json`.

## (a) Learning

| window | in-draft rate | mean rank of used tool | MRR |
|---|---|---|---|
| calls 1–10 | 0.30 | 1.0 | 0.30 |
| calls 31–40 | 0.40 | 1.5 | 0.33 |

- **Within-session: flat.** Mid-session maintenance adjusted **0** tools (`skipped=23`) —
  no capability had reached OATS `minPositives=4` by call 20. Nothing else on the draft
  path reads outcomes, so a session cannot learn mid-flight (and in production the
  maintenance is 20h-debounced at boot — it would not even have run).
- **Day-1 drafts miss the right tool 70% of the time** for these phrasings, e.g.
  "show me what's inside config.yaml" → top5 led by `fs__edit_file`, no `read_text_file`
  anywhere; "what do we already know about this person" → `search_nodes` absent all session.
- **Nightly OATS adjusted 4 tools** (`get_file_info, read_text_file, add_observations,
  search_nodes`). Day-2 drafts: 3 needs went **absent → rank 1** (config.yaml read,
  remember-dark-mode, what-do-we-know) and the unseen paraphrase
  "double-check the theme setting file" also went **absent → rank 1** (generalization).
  Not learned (below 4 positives): `search_files` (3 successes) stayed absent;
  `create_relations` (2) stayed #3 behind `memory__delete_entities` for a linking need.
  The paraphrase "retrieve saved facts from earlier sessions" did NOT generalize to
  adjusted `search_nodes` (still absent).
- **Dense abstain gate never engaged:** 37/37 drafts had cosine span ≥ 0.15
  (min 0.169, p50 0.285, max 0.574) on real tool descriptions — dense governed from
  draft 1, unlike the short-blurb corpus in `dense-live.mjs`. Day-2 spans reached 0.92.
- Latency through the whole stack: draft p50 2ms / p95 5ms; call p50 2ms (session);
  boot with both real servers + model: 2.57s.

## (b) Sixth Man

Fired **1/40** — only on the engineered FIFO timeout (`tool_fail:timeout`, 30,053ms).
The 5 organic failures were `tool_fail:other/schema` (bad args), which are not in
`SUGGESTION_CLASSES` by design → 0 organic suggestions.

The one firing was clean: suggestion `memory__read_graph` (well-formed, cross-source,
exists in roster), base error content preserved + exactly one appended `_roster` text.
**Suggest-only law held**: memory.json hash and sandbox listing unchanged; exactly 1
outcome row (the failing call) during the window. After the agent followed it,
`suggestion.taken` flipped 0→1. Follow-up A2: a killed *server* yields
`hard_fail:transport` in ~0ms → suggestion-eligible. Note `args_compatible:true` was
technically true only because `read_graph`'s schema is permissive — `{path: …}` junk
validates against it.

## (c) Attribution (queried from the outcome table)

45 rows, 1 distinct session, **0 need-hash mismatches** across all 40 session calls
(retry calls correctly reuse their draft). Probes: explicit unknown `draft_id:"d999"`
→ `need_hash NULL` (strict, no fallback) ✓; hallucinated tool id → throws `-32602`,
**no outcome row at all** (hallucination failures are invisible to ratings — info);
omitted draft_id → binds to the most recent draft (by design, measured).

**Soft-fail misattribution:** 5 rows marked `soft_fail=1`; only 2 were the intended
retry marks (rows 7, 27 — the failed attempts). **3 were legitimate successes**,
including session row 8 (success), retro-marked because call 11 later called the same
tool with different args — and call 11 was itself a *failure*. Consequence measured:
at the nightly, `fs__read_text_file`'s session-only eligible positives were 3 (< minPositives 4);
it got adjusted only because lab probe calls added a 4th success. In a probe-free
session, the false mark on row 8 would have **blocked the most-used fs tool from learning**.

## (d) Protocol fidelity

| payload | direct vs transparent | direct vs five |
|---|---|---|
| success (`read_text_file`, incl. `structuredContent`) | byte-identical | byte-identical |
| isError (path outside sandbox) | byte-identical | byte-identical |
| bad-args validation (memory `delete_entities`) | byte-identical | byte-identical |

Modern reference servers resolve *everything* as isError results (even unknown tools —
direct `tool_that_does_not_exist` resolves; no McpError). Consequently:

- Roster's *own* thrown errors are the divergence surface: unknown id → roster throws
  `-32602` where a direct connection returns an isError result; and every roster-origin
  McpError reaches the client **double-prefixed**:
  `"MCP error -32602: MCP error -32602: Unknown capability: gh__create_issue"`,
  `"MCP error -32603: MCP error -32603: call timed out"` (transparent, dead backend —
  original `-32001/-32000` codes rewritten to `-32603`).

## Kill probe (real SIGKILL)

`StdioClientTransport.pid` is the **npm-exec wrapper**, not the server (tree verified).

| scenario | next call | after that | leak |
|---|---|---|---|
| main run: wrapper SIGKILL **with a blocked in-flight FIFO request** | success 1ms (race — real bytes) | `tool_fail:timeout` after full 30,010ms | **real server leaked indefinitely** (pid 9450 observed alive an hour later, sandbox already deleted; reaped by follow-up) |
| controlled wrapper SIGKILL (idle) | `hard_fail:transport` 0ms ("Not connected") | same | none |
| controlled server SIGKILL | `hard_fail:transport` 1ms | same | none |

The degraded mode is real: with pending blocked work at death time the router cannot
see the backend die — each call burns the full 30s timeout and the orphaned server
outlives everything. 4 stale MCP servers from older experiment families were also
observed still running (recurring pattern).

## Conclusions

1. The five-mode loop, attribution, and byte-fidelity passthrough are solid — measured, not claimed.
2. Learning is real but strictly *overnight*: day-1 drafts are mediocre (0.30 in-draft),
   sessions never improve mid-flight, and the nightly fixes exactly the ≥4-positive tools.
3. The retry-soft-fail heuristic misfires on bursty same-tool reuse and can single-handedly
   starve OATS below its positives floor.
4. Sixth Man is essentially dormant in organic sessions (bad-args failures aren't eligible);
   it behaves perfectly when eligible.
5. Error-path fidelity has two warts: double-prefixed roster-origin McpErrors and
   code rewriting to -32603/-32602; plus the zombie-backend 30s-hang mode.
