# Fix wave — applied from the 2026-07-04 swarm findings

Every fix below was independently re-verified against the real code (the swarm's own findings were mostly unverified when the session limit killed the verifiers), landed with a regression test, and gated on a forced clean build + the full suite (**120 tests**) + real-server live paths (e2e, dense-live, filesystem 8/8, fail-probes 0/8). Findings judged not-a-bug or design-intent are listed at the bottom with the reason.

## Trust surface (HIGH)

| Fix | What was wrong | How it's fixed | Test |
|---|---|---|---|
| **Config write races** (`cli/rosterfile.ts`) | `saveConfig` wrote to a **shared** `<target>.tmp`, so concurrent writers truncated each other's file and raced the rename to ENOENT — corrupt `roster.json`, ~57% crash under contention. *(This was a regression in my own earlier "atomic" fix.)* | `atomicWriteFileSync`: private tmp (`pid`+random) + rename, tmp cleaned on failure. Used by `saveConfig`, sync, and eject. | cli.test |
| **Sync error swallowing** (`cli/sync.ts`) | The whole import step was wrapped in `try/catch`, so a failed `saveConfig` was eaten — sync reported `synced` while the user's servers were never persisted (routed nowhere). | Only the *parse* is caught; a save failure now propagates and aborts before the client config is touched. | cli.test |
| **Eject wrong-restore** (`cli/eject.ts`, `sync.ts`) | Pristine backup was chosen by mutable `manifest.timestamp` and corrupt manifests were silently skipped → a 1-byte manifest tamper made eject restore a **different** (user-edited) backup. | Selection keys off the immutable backup **directory name**; a missing/corrupt pristine manifest is refused loudly (INTEGRITY FAILURE), never advanced past. | cli.test |
| **SKILL.md BOM** (`playbook/skill.ts`) | A leading UTF-8 BOM sat before `---`, so frontmatter never matched and was silently voided (name→slug, description→""). | Strip a leading BOM before parsing. | playbook.test |
| **Trust-scan blind spots** (`playbook/trust.ts`) | Scanned only the body — never the `description` (the text OpenClaw injects into every prompt) or bundled-**script contents** (a path list hid `curl\|bash`). | Scans metadata + body + script file contents (bounded head-read, round 2). Scripts deliberately SKIP the base64 rule (too noisy on real minified code) — so a base64-decode-and-exec **inside a script remains a known gap**, not covered. | playbook.test |

## Identity & routing (HIGH)

| Fix | What was wrong | How it's fixed | Test |
|---|---|---|---|
| **Namespace collision** (`shared/namespacing.ts`) | A source ending in `_` fused with the `__` separator: `("a_","b")` and `("a","_b")` minted the same id and routed to the wrong backend. | `sanitizeSource` strips leading/trailing `_`; first `__` is now always exactly the separator. | namespacing.test |
| **Prune deletes learned state** (`cli/serve.ts`, `shared`, `coach/store.ts`) | Protected-source keys used raw `sanitizeSource(name)` while capabilities were stored under the reserved-renamed/suffixed key (`skill`→`skill-server`), so an unavailable backend's vectors were pruned despite the "preserved" log line. | Shared `normalizeBackendName` used by both connect and protect; `pruneMissing` also matches the de-suffixed base. | store.test |
| **Ajv `$id` poisoning** (`router/rosterServer.ts`) | One shared Ajv registered each schema's `$id`; the 2nd suggestion carrying a `$id` threw "already exists" → `args_compatible` read true once then false forever, and `_cache` grew unboundedly. | Fresh Ajv per (rare) suggestion + recursive strip of `$id`/`$schema`/`$anchor`. | cards.test |

## Correctness & quality (MEDIUM)

| Fix | What was wrong | How it's fixed | Test |
|---|---|---|---|
| **Fabricated per-category ratings** (`coach/store.ts`) | `recomputeRatings(category)` ignored `intent_cat` → wrote each capability's **global** stats under the requested category label. Also, ratings never expired. | Category calls filter by `intent_cat`; ratings with no surviving evidence are deleted. | store.test |
| **Lexical stopword pollution** (`coach/store.ts`) | Query stopwords (`for`,`the`,`that`…) drove wrong-source tools into the top-5 for ~26% of needs; camelCase names (`printEnv`) were unmatchable. | Stopwords filtered from the query (with all-stopword fallback); camelCase split in both index and query. | store.test |
| **Worst-hit displacement** (`coach/store.ts`) | Min-max scored the worst genuine lexical hit `0`, then `score>0` dropped it — displaced by an unrelated rated tool (87.6% of narrow needs). | Genuine FTS hits keep a `0.05` floor. | store.test |
| **Fusion weights** (`coach/store.ts`) | `0.3/0.7` left measurable MiniLM quality on the table. | `0.15/0.85` (lab-optimal); abstain-gate comments corrected to the truthful tiny-roster scope. | dense-live |
| **Transport death mis-class** (`router/backends.ts`) | A server dying mid-call surfaced as `McpError ConnectionClosed` and was classified `protocol`, not `transport` — which also silenced the Sixth Man exactly when a backend crashed. | `ConnectionClosed` → `transportError`. | classifier/router |
| **Attribution fairness** (`coach/classifier.ts`, methodology §8) | Input-validation rejections (`tool_fail:schema`, incl. folded `-32602`) dinged a tool's public Wilson score for the caller's malformed args. | `tool_fail:schema` is non-attributable; output drift stays attributable. **Policy change — reversible; flagged for owner.** | classifier.test |
| **Combine verifier holes** (`combine/*`, `suites`, signing) | `fileExists` couldn't tell a dir from a file (a "create directory" task passed by writing a file); macOS case/NFD folding false-passed 3 mutations. | New `dirExists`; all path verifiers assert the **byte-exact** basename in the parent listing. Hardened **before** signing. | combine.test |
| **Draft card width** (`router/cards.ts`) | A 1000-value enum / 200-property object rendered a card heavier than the whole roster. | Enum capped at 16, properties at 50 (required first), elision flagged. | cards.test |

## Deliberately NOT changed (with reason)

- **OATS single-centroid / 4-outcome floor / weak negatives** — intentional v1 design that the verified dense-live path depends on. The "poisoning" case needs mislabeled *successes* (the implicit-feedback problem: a semantically-wrong result the classifier can't see is wrong). Correction (meta-review caught my earlier wording): the §8 input-validation change removes some NEGATIVE evidence and therefore does **not** help against success-driven poisoning — it is unrelated to this gap. Documented honestly in methodology §9a rather than rewritten.
- **Embedding batch-shape nondeterminism** — inherent to ONNX matmul batching; effect is sub-top-1 jitter only. Not a correctness bug.
- **Gemma RAM (~1.7–1.9 GB) / dispose reclaiming ~0 for MiniLM** — the model's cost and MiniLM's small footprint, not leaks; the dispose fix's real benefit (no cross-session accumulation) was confirmed.
- **Stemming (plural/verb forms)** — the correct fix is a Porter FTS tokenizer, an index-schema change too risky to rush into this wave; noted as a follow-up.
- **Trust-scan false positives (~33%)** — inherent to conservative regex heuristics; the scan is advisory ("review"), so over-flagging is the safe direction. Only the false-*negatives* (the dangerous direction) were fixed.

## Round 2 — from an adversarial meta-review of round 1

A 7-lens meta-review (independent agents, then per-finding skeptic verification) audited the round-1 diff. It confirmed the core fixes correct but found two bugs I'd *introduced*, two real gaps I'd missed, three vacuous tests, and a couple of overclaims. All addressed:

| Fix | What the review found | Resolution |
|---|---|---|
| **`roster serve` connect hang** (`router/backends.ts`) | No timeout on connect → a wedged backend hangs boot ~60s each, sequentially (a real swarm finding I'd dropped). | Bounded handshake + child-process cleanup; hanging-transport regression test. |
| **Output-schema drift invisible** (`coach/store.ts`) | `defHash` omitted `outputSchema`, and the runtime check is dead (the MCP SDK validates output itself and throws first — verified in SDK source). Caught by neither detector. | `outputSchema` added to the drift hash, with a test. |
| **Bug I introduced: Ajv over-strip** (`router/rosterServer.ts`) | Recursively stripping `$id`/`$anchor` (redundant given fresh-Ajv-per-call) broke `$ref`-by-`$id` resolution → false negatives. | Strip only the `$schema` dialect; keep `$id`/`$ref`. `$ref` regression test added. |
| **Bug I introduced: unbounded script read** (`playbook/trust.ts`) | Read the whole script file *then* capped → a huge script threw, and the swallowed throw left it UNSCANNED (re-opening the curl\|bash-in-script gap). | Bounded head-read (`readSync` ≤256KB), never loads the whole file. |
| **Over-broad `tool_fail:schema`** (`coach/classifier.ts`) | `schema` matched before `internal`, so a genuine 500/panic containing a schema-ish word was wrongly excused. | Reordered: internal faults win; test added (mutation-verified to discriminate). |
| **Verifier parent-fold** (`combine/runner.ts`) | `entryExistsExact` byte-checked only the final basename; parent dirs still folded on macOS. | Walks every path component byte-exact; case-variant regression test added. |
| **Three vacuous tests** | Worst-hit-floor, eject-wrong-restore, and atomic-write tests passed even with their fixes reverted. | All three rebuilt to genuinely discriminate — **mutation-tested**: each now fails when its fix is reverted. |

## Round 3 — finishing the deferred list

Three of the round-2 disclosures were then actually fixed (the user asked to finalize everything), each with a mutation-verified test:

| Fix | What was wrong | How it's fixed | Test |
|---|---|---|---|
| **Remove/re-add drift bypass** (`coach/db.ts`, `store.ts`) | Pruning deleted a capability's `def_hash`, so a tool removed then re-added with a *changed* definition slipped back in as "new" — no drift event, no quarantine. | A `removed_capability` tombstone carries the last-seen hash (+ quarantine state + last-drift ts) forward. On re-add: changed def → drift + quarantine; unchanged but mid-dwell → dwell preserved. | store.test (mutation-verified) |
| **Manifest-less backup bricks eject** (`cli/sync.ts`) | A crash mid-sync (between writing `original` and `manifest.json`) could leave a manifest-less oldest backup that dead-ends eject. | The backup dir is assembled in a `.staging-` dir and **renamed into place atomically** — a crash leaves a complete backup or none. `listBackups` skips staging dirs. | cli.test still green |
| **Transport-death untested** (`router/backends.ts`) | The `ConnectionClosed → transport` mapping had no isolated test (hard to simulate a mid-call death). | Extracted a pure `errorToEvidence(err)` and unit-tested every branch (ConnectionClosed→transport, RequestTimeout→timeout, other McpError→protocol, plain Error→transport). | router.test |

### Genuinely deferred / disclosed (fixing would be over-engineering for the risk)

- **Sequential divergent-boot prune** (medium): the `keepSeenSince` window protects the transient overlap between two `roster serve` boots; a fully sequential race isn't covered. Low real risk because `roster.json` is a single shared file, so divergence is transient and a genuine config change *should* prune. A correct fix needs cross-process liveness tracking (IPC) — disproportionate. Disclosed.
- **Prune de-suffix over-protection** (low): protecting base `x` also shields a genuinely-removed `x-2` from pruning until `x` reappears — a stale-tool leak in the safe (never-wrongly-delete) direction. The ambiguity (collision-suffix vs literal `-2` name) is unresolvable from the stored key alone; over-protection is the correct bias.
- **camelCase index on upgrade** (low): the split only re-indexes added/drifted tools, so an *existing* `coach.db` keeps the old index until a tool drifts. Moot pre-launch (no installs); the round-2 `defHash` change forces a one-time reindex on the first upgraded boot anyway.
- **`schema_drift_suspect` runtime path** (low): effectively dead on the real wire (the SDK pre-validates output). The connect-time `defHash` (now incl. `outputSchema`) is the real, working drift mechanism; the runtime path stays as harmless belt-and-suspenders. Kept rather than churned out.

## Round 4 — from the full-codebase deep review (Fable 5 audit, 2026-07-07)

An independent principal-level audit read every file, ran the whole stack, and probed adversarially. It found no CRITICAL, but a set of real MAJOR/MEDIUM issues — including one core-thesis bug the 16-charter swarm + prior rounds missed because they verified *conformance to spec*, not *sanity of the spec*. Every genuine defect fixed with a regression test; the moat fix (M1) is mutation-verified.

| Fix | What was wrong | Resolution | Test |
|---|---|---|---|
| **M1 — soft-fail starved the Coach** (`coach/store.ts`) | The retry-as-soft-failure rule marked ANY prior same-tool/different-args call soft_fail, conflating "retried because unusable" with the dominant iterate-over-inputs pattern — discarding ~4 of 5 real successes (empirically confirmed). This is the "learns from your outcomes" moat. | Only a prior **non-success** is soft-failed; a genuine success always counts. The failure-fairness intent is preserved (a failure→adjusted-retry still excludes the failure). | store.test (mutation-verified) |
| **M2 — eject broke the flagship client** (`cli/eject.ts`, `clients.ts`) | `~/.claude.json` is Claude Code's live state file; byte-restore reverted every unrelated setting and the modified-guard refused forever. | State-file clients (claude-code, openclaw) restore **key-level** — swap the servers map back, preserve all other live keys, no refusal. Dedicated clients keep byte-restore (comment fidelity). | cli.test |
| **M3 — raw-wire -32602 dinged the tool** (`router/backends.ts`, `coach/classifier.ts`) | A legacy server returning a plain `-32602` (not folded into isError) was classified attributable, contradicting methodology §8. | `-32602` → non-attributable `tool_fail:schema`, matching the isError-folded carve-out; fairness no longer depends on SDK vintage. | classifier.test |
| **M4 — classifier misrouted error texts** (`coach/classifier.ts`) | "30000 tokens per min" → auth; "invalid token format in 'path' argument" → auth (a caller-fault pierced the fairness carve-out). | quota checked before auth; schema (caller-side) before auth; auth synonyms (invalid_auth/signature/…). Best-effort by design; P7(c) is the precise fix. | classifier.test |
| **M5 — synced entry pointed at a missing binary** (`cli/sync.ts`) | `command: "roster"` fails to spawn for `npx roster init` users with no global install. | npx-aware entry when no global `roster` is on PATH; `isAlreadySynced` recognizes both forms. | cli.test |
| **D1 — transparent list was lossy** (`router`, `shared`) | `title` and `annotations` (incl. `readOnlyHint`/`destructiveHint`) were stripped — safety-relevant for clients that gate confirmations. | Modeled on the capability, captured from backends, re-exported verbatim. | router.test |
| **D2+D8 — one bad config aborted the fleet** (`cli/bin.ts`, `sync.ts`, `jsonc.ts`) | A BOM'd/malformed/array config threw and left the rest of the sync fleet unsynced with an anonymous error. | Per-client try/catch in the sync loop; BOM strip in `parseJsonc`; a non-object config is rejected loudly (no eternal false-"synced"). | (fleet loop) |
| **D3 — transparent error codes flattened** (`router`) | Backend protocol errors were re-thrown as `-32603`; the original code survived only in text. | The original JSON-RPC code is preserved and re-thrown. | router.test |
| **D4 — warm boot re-embedded everything** (`cli/serve.ts`, `coach`) | Every serve process re-embedded the whole roster (zero vec reuse). | Skip capabilities that already have a vector in the current model's space. | (behavioral) |
| **D9a — pretty-printed drafts** (`router/rosterServer.ts`) | Indented draft JSON cost +46–53% marginal tokens on BPE — an own-goal against the token-savings pitch. | Compact JSON. | router.test |
| **Minors** | skill invocations minted perfect Wilson (→ recorded `explored`, non-rating); standings banner would contradict a ranked row (→ conditional); biome missed test dirs (→ widened); dead `pct1` (→ removed); `latencyBucket(4000)` mislabeled (→ boundary fixed). | — | store/league/stats |

### Still deferred / disclosed from this audit (not silent)

- **M6 — draft-utilization harness** (the handoff M1 milestone: does draft/call actually work across real clients?) is unbuilt and had fallen off tracking. **Restored to the plan** — STATUS §4/§7. Needs real clients (partly founder/tester work).
- **D5 — local quarantine** lifts on a 24h dwell (not a re-Combine) and a re-signatured tool inherits its predecessor's local rating/OATS state. Disclosed in methodology §6; the public League re-verifies independently, so published scores are unaffected. `combine self` local gate is planned.
- **D6/D1 doc truth** — the README receipt sentence and "identical behavior"/"±15%" claims were tempered to match what actually ships.
- **D7 — praise asymmetry** is enforced by the human publishing gate, not code (the review's "process-trust, not cryptographic" — accepted for v1, said out loud); `signed:` is a plain YAML boolean by the same reasoning.
- **D9b/c/d** — `trimSchema` depth-1 is a deliberate token/structure tradeoff; Ajv dialect false-negatives in `args_compatible` (suggest-only, advisory); boot-order suffix identity for post-sanitization name collisions (exotic). All noted in STATUS §7.
- **Perf/RAM** — default-Gemma ~1.7–1.9 GB RSS per five-mode session (the model's cost; mitigated by transparent-default + idle unload); sequential backend connects at boot (bounded by the 15s connect timeout). Disclosed.
