# classifier-realworld — outcome classifier vs real wire shapes from real failures

**Question.** When REAL MCP servers fail in real ways, what actually comes over the wire, what evidence does `BackendManager` build from it, what class does `classifyOutcome` emit — and is that what the spec (handoff §6.2, methodology §8) intends?

**Method.** No mocks anywhere. Real npx-spawned `@modelcontextprotocol/server-filesystem@2026.1.14` and `server-memory@2026.1.26` over stdio; a minimal REAL MCP server built with the repo's own SDK (`exp-classifier-realworld-failserver.mjs`, low-level `Server` so payloads are exact); real OS errors (ENOENT, EACCES via chmod 000), a real `process.exit(1)` mid-call, a real live-but-non-MCP process for connect hangs, a nonexistent command for spawn failure. Every call ran through the built dist `@rosterhq/router` `BackendManager.call` (outputSchema passed exactly as `rosterServer` passes it) and `@rosterhq/coach` `classifyOutcome`/`isAttributable`. Wire shapes were captured separately with a raw SDK client. SDK 1.29.0 on both sides. Raw data: `docs/lab/results-classifier-realworld.json`.

## (a) Scenario matrix — 14 classifier-reaching scenarios + 3 connect-path observations

| id | real failure | wire shape (captured) | evidence | class | spec intent | verdict |
|---|---|---|---|---|---|---|
| S1 | fs: read nonexistent path | result `isError:true` "ENOENT: no such file or directory, open '…/does-not-exist.txt'" | isError+text | `tool_fail:other` | `tool_fail:other` | ok |
| S1b | fs: read nonexistent **auth-tokens.txt** | same ENOENT, filename echoed in text | isError+text | **`tool_fail:auth`** | `tool_fail:other` | DIVERGES — `/token/` matched the filename |
| S2 | fs: write outside sandbox root | result `isError:true` "Access denied - path outside allowed directories: …" | isError+text | **`tool_fail:other`** | `tool_fail:auth` (permission family) | DIVERGES — regex has "permission denied" but not "access denied" |
| S3 | fs: read chmod-000 file | result `isError:true` "EACCES: permission denied, open '…'" | isError+text | `tool_fail:auth` | `tool_fail:auth` | ok |
| S4 | memory: `create_entities` with `{entities:"banana"}` | result `isError:true` "MCP error -32602: Input validation error: Invalid arguments for tool create_entities: […]" | isError+text | **`tool_fail:schema`** (attributable) | agent fault — methodology §8 says caller's bad args must not punish the tool | DIVERGES (fairness) |
| S4b | memory: `create_entities` with `{}` | same shape | isError+text | **`tool_fail:schema`** (attributable) | same | DIVERGES (fairness) |
| S5 | memory: call unknown tool | result `isError:true` "MCP error -32602: Tool … not found" — an isError RESULT, not a JSON-RPC error | isError+text | **`tool_fail:other`** | `hard_fail:protocol` (§6.2 rule 1) | DIVERGES — SDK ≥1.29 servers fold this into results |
| S6 | kill server process mid-call | **throw `McpError -32000` "Connection closed"** | `protocolError:true` | **`hard_fail:protocol`** | `hard_fail:transport` ("connection died / stream broke") | DIVERGES — -32000 is an McpError, so it falls into the protocol branch |
| S7 | tool never responds, router deadline 2500ms | throw `McpError -32001` Request timed out (latency 2501ms) | `timedOut:true` | `tool_fail:timeout` | `tool_fail:timeout` | ok |
| S10a | declared outputSchema, structuredContent missing required key | **client-side** throw `McpError -32602` "Structured content does not match the tool's output schema" | `protocolError:true` | **`hard_fail:protocol`** | `schema_drift_suspect` (§6.2 rule 3) | DIVERGES |
| S10b | declared outputSchema, no structuredContent | client-side throw `McpError -32600` | `protocolError:true` | **`hard_fail:protocol`** | `schema_drift_suspect` | DIVERGES |
| S10c | declared outputSchema, wrong value type | client-side throw `McpError -32602` | `protocolError:true` | **`hard_fail:protocol`** | `schema_drift_suspect` | DIVERGES |
| S10d | same as S10a but outputSchema NOT passed to `call()` | still throws — the SDK client validates from its own listTools cache | `protocolError:true` | **`hard_fail:protocol`** | `schema_drift_suspect` | DIVERGES — proves the throw happens inside the SDK client, before `violatesOutputSchema` can ever run |
| S11 | success control | normal result | `outputSchemaViolation:false` | `success` | `success` | ok |
| S8 | connect to live non-MCP process (bounded probe, 3s) | throw `McpError -32001` after 3001ms | — | no outcome row (connect path) | n/a | observation |
| S8b | same via production `BackendManager.connect` (no timeout arg) | **rejected after 60,006ms** (`McpError -32001`) | — | no outcome row | n/a | observation — SDK default initialize timeout is 60s |
| S9 | spawn nonexistent command | throw `Error ENOENT` after 9ms | — | no outcome row | n/a | observation |

Score: 4/14 classifier-reaching scenarios match spec intent exactly; 10 diverge (2 kind-level, 8 structural).

### The two structural truths

**1. Output-schema drift is unreachable on the real wire.** SDK 1.29's client validates structured output itself (validators cached from `listTools`, which `BackendManager.fetchTools` always calls on the same client). Every drift shape — missing key, missing structuredContent, wrong type, schema-passed-or-not — throws `McpError` inside `client.callTool` before `backends.ts` ever sees a result. So `violatesOutputSchema` is dead code in production, `schema_drift_suspect` cannot occur (fuzz aside), §6.2 rule 3's "(also raises a drift event)" never fires (and no code raises an outcome-drift event anyway — `store.ts` only raises definition-hash drift events at connect time), and methodology §8's "schema-drift suspicion" rating class is inert. Drift instead lands in `hard_fail:protocol`.

**2. Real transport death is labeled protocol.** `process.exit` mid-call surfaces as `McpError -32000 Connection closed`; `backends.ts` treats any non-timeout `McpError` as `protocolError`. Consequences: class mix in telemetry/receipts is wrong for the single most common hard failure (server crash), and the Sixth Man gate (`SUGGESTION_CLASSES` = transport, timeout, internal) does NOT fire after a crash, though the spec's own evidence doc says "connection died / stream broke" is transport.

Combined effect: on SDK ≥1.29, `hard_fail:protocol` becomes a soup of transport deaths + drift + client-side validation, while genuine server JSON-RPC errors (S5 "Tool not found", S4 invalid params) arrive as **isError results** and land in `tool_fail:*` — nearly the inverse of the §6.2 mental model.

## (b) Precedence fuzz — 500 + 500 seeded combos on the built dist

- 500 random `CallEvidence` combos: **0 precedence violations** — order is exactly transport > protocol > timeout > isError-kinds > drift > success. Class distribution in `results…json partB`.
- Every emitted class is attributable (500/500), matching methodology §8: non-attributable rows can only come from the `soft_fail`/`explored` markers, never from evidence. `isAttributable("soft_fail")` = `isAttributable("explored")` = false.
- 500 shuffled multi-trigger error texts: **0 kind-precedence violations** — kind is fixed by rule order (auth > quota > timeout > schema > internal), independent of word position.

## (c) Realistic error texts over the real isError wire — 39 texts + 7 live-captured

Each text sent through the real fail-server (`echo_error` → `isError:true` over stdio) → evidence → kind. Corpus modeled verbatim-or-near-verbatim on real APIs (GitHub, OpenAI, Slack, AWS, Google, Anthropic, Stripe, node errnos), plus the texts captured live in part (a).

**11/46 misclassified (23.9%).** Patterns, all auth-related:

| real-world text | got | should be | culprit |
|---|---|---|---|
| GitHub 403 rate limit (verbatim: "…Authenticated requests get a higher rate limit…") | auth | quota | `\bauth` matches "Authenticated"; auth checked before quota |
| OpenAI 429 "…on tokens per min (TPM)…" | auth | quota | bare `/token/` matches "tokens" |
| "Unexpected token < in JSON at position 0" | auth | other | bare `/token/` |
| "…maximum context length is 128000 tokens…" | auth | other | bare `/token/` |
| ENOENT for a file named `auth-tokens.*` (live S1b too) | auth | other | trigger words inside a quoted path |
| Slack `invalid_auth` / `not_authed` | other | auth | `\b` never fires across `_` (underscore is a word char) |
| AWS "Signature expired: …" | other | auth | no rule |
| fs server "Access denied - path outside allowed directories" (live S2 too) | other | auth | regex has "permission denied" only |

Stakes: kind feeds `tool_fail:<kind>` → League/telemetry breakdowns, and `tool_fail:internal` gates Sixth Man suggestions (a 503 → `other` today → no suggestion).

### (c2) Proposal evaluation (repo untouched, measured in `exp-classifier-realworld-proposal.mjs`)

Proposed rule set: quota before auth; strip quoted literals before matching; replace bare `/token/` with contextual credential-token patterns; underscore-tolerant `auth` (`(?:^|[^a-z])auth`); add "access denied" + "signature expired"; internal covers 502/503. Result on the same 46-text corpus: **11 → 0 misclassified, 0 regressions**. Caveat: tuned on this corpus (overfit risk) — treat as direction, validate on held-out texts before adopting.

## Conclusions

1. (HIGH) Drift detection (`schema_drift_suspect` + rule-3 drift events) is structurally dead on the real wire — SDK client-side validation converts every drift into `hard_fail:protocol`. Proposal: in `backends.ts` catch, detect the SDK's own validation McpErrors (codes -32600/-32602 with the client's fixed message prefixes "Structured content does not match" / "has an output schema but did not return structured content") and map them to `outputSchemaViolation` evidence; or disable SDK client-side validation if the SDK exposes that.
2. (MEDIUM) `McpError -32000 Connection closed` → map to `transportError`, one-line fix in `backends.ts`; restores spec labeling and Sixth Man behavior on crashes.
3. (MEDIUM) methodology §8's fairness promise leaks on the real wire: agent-malformed args arrive as isError results (`tool_fail:schema`, attributable) and will punish tools in ratings for caller mistakes. Proposal: treat SDK input-validation signatures ("Input validation error"/"Invalid arguments for tool" + `-32602` inside isError text) as caller-fault (non-attributable marker, like soft_fail) — with care for gaming risk.
4. (MEDIUM) Kind heuristics misclassify 23.9% of a realistic corpus, all in the auth direction; measured proposal reaches 0/46 with no regressions on the same corpus.
5. (INFO) Precedence and attributability are exactly as spec'd — 1000/1000 fuzz checks clean.
6. (INFO) `roster serve` blocks 60.006s per hanging (non-MCP or wedged) backend, sequentially, before its per-backend try/catch resumes; spawn-ENOENT fails in 9ms. Proposal: pass a connect timeout and/or connect backends in parallel.

Files: `exp-classifier-realworld-{failserver,servers,errtexts,fuzz,proposal}.mjs`, raw numbers in `results-classifier-realworld.json`.
