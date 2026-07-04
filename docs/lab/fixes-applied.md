# Fix wave — applied from the 2026-07-04 swarm findings

Every fix below was independently re-verified against the real code (the swarm's own findings were mostly unverified when the session limit killed the verifiers), landed with a regression test, and gated on a forced clean build + the full suite (**120 tests**) + real-server live paths (e2e, dense-live, filesystem 8/8, fail-probes 0/8). Findings judged not-a-bug or design-intent are listed at the bottom with the reason.

## Trust surface (HIGH)

| Fix | What was wrong | How it's fixed | Test |
|---|---|---|---|
| **Config write races** (`cli/rosterfile.ts`) | `saveConfig` wrote to a **shared** `<target>.tmp`, so concurrent writers truncated each other's file and raced the rename to ENOENT — corrupt `roster.json`, ~57% crash under contention. *(This was a regression in my own earlier "atomic" fix.)* | `atomicWriteFileSync`: private tmp (`pid`+random) + rename, tmp cleaned on failure. Used by `saveConfig`, sync, and eject. | cli.test |
| **Sync error swallowing** (`cli/sync.ts`) | The whole import step was wrapped in `try/catch`, so a failed `saveConfig` was eaten — sync reported `synced` while the user's servers were never persisted (routed nowhere). | Only the *parse* is caught; a save failure now propagates and aborts before the client config is touched. | cli.test |
| **Eject wrong-restore** (`cli/eject.ts`, `sync.ts`) | Pristine backup was chosen by mutable `manifest.timestamp` and corrupt manifests were silently skipped → a 1-byte manifest tamper made eject restore a **different** (user-edited) backup. | Selection keys off the immutable backup **directory name**; a missing/corrupt pristine manifest is refused loudly (INTEGRITY FAILURE), never advanced past. | cli.test |
| **SKILL.md BOM** (`playbook/skill.ts`) | A leading UTF-8 BOM sat before `---`, so frontmatter never matched and was silently voided (name→slug, description→""). | Strip a leading BOM before parsing. | playbook.test |
| **Trust-scan blind spots** (`playbook/trust.ts`) | Scanned only the body — never the `description` (the text OpenClaw injects into every prompt) or bundled-**script contents** (a path list hid `curl\|bash`). | Scans metadata + body + script file contents (size-capped; scripts skip the noisy base64 rule). | playbook.test |

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

- **OATS single-centroid / 4-outcome floor / weak negatives** — intentional v1 design that the verified dense-live path depends on; the "poisoning" case needs mislabeled *successes* (an upstream attribution issue, now further guarded by the §8 input-validation exclusion). Documented honestly in methodology §9a rather than rewritten.
- **Embedding batch-shape nondeterminism** — inherent to ONNX matmul batching; effect is sub-top-1 jitter only. Not a correctness bug.
- **Gemma RAM (~1.7–1.9 GB) / dispose reclaiming ~0 for MiniLM** — the model's cost and MiniLM's small footprint, not leaks; the dispose fix's real benefit (no cross-session accumulation) was confirmed.
- **Stemming (plural/verb forms)** — the correct fix is a Porter FTS tokenizer, an index-schema change too risky to rush into this wave; noted as a follow-up.
- **Trust-scan false positives (~33%)** — inherent to conservative regex heuristics; the scan is advisory ("review"), so over-flagging is the safe direction. Only the false-*negatives* (the dangerous direction) were fixed.
