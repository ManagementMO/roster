# identity-fuzz — namespacing collisions, backend registry, schema-trim torture, Ajv args_compatible

**Question.** Can distinct (server, tool) identities silently collapse onto one id (corrupting ratings and routing)? Does the registry key servers the way the rest of the system assumes? Do pathological schemas crash or bloat the card/validation paths?

**Method (all real, no mocks).** Built dist of `@rosterhq/shared` / `@rosterhq/router` / `@rosterhq/coach` imported exactly like `docs/verification/dense-live.mjs`. Live rigs use real `@modelcontextprotocol/sdk` Servers + Clients over `InMemoryTransport` (the router's own `TransportBackendConfig` hook), a full `RosterServer` in five and transparent modes, real SQLite (`openCoachDb(":memory:")`), and — for experiment E — a real `npx -y @modelcontextprotocol/server-filesystem` OS process over stdio sandboxed to the lab tmp dir. Ajv is the router's own dependency (ajv 8.20.0, `Ajv2020({strict:false})`), driven through a verbatim copy of `sixthManSuggestion`'s validate block and through the real server on the wire. No embedding model was loaded: this charter makes no retrieval claims (RAM left to sibling agents).

Raw numbers: `docs/lab/results-identity-fuzz.json` (sections a/b/c/d/d2/e). Scripts: `docs/lab/exp-identity-fuzz-{a-roundtrip,b-registry,c-trimschema,d-ajv,d2-ajv-followup,e-realserver,merge}.mjs`.

## A. Round-trip fuzz + collision hunt (`a_roundtrip_collisions`)

1000 seeded (source,name) pairs across 10 categories (unicode, spaces, dots, dashes, leading digits, ~200-char, `__`-in-name, underscore edges, mixed case, punctuation):

| metric | value |
|---|---|
| round-trip OK (parse returns the sanitized identity) | **922 / 1000** |
| mismatches | 78 — 77 in `underscoreEdges`, 1 in `longs`; **every one** is the same mechanism: source ending `_` or name starting `_` shifts the `__` split |
| parse-null on namespacedId output | 0 in fuzz; **4/5** in targeted probe — any source sanitizing to `_` yields `___tool`, which `parseNamespacedId` rejects (null) |
| invalid chars in id | 0 (sanitizer always emits `[A-Za-z0-9_-]`) |

Systematic hunt (exhaustive 7-symbol alphabet `a b _ - . ␣ A`, lengths 1–3, 159,201 pairs → 9,093 ids):

- **300 ids carry ≥ 2 distinct *sanitized* identities** (cross-boundary collisions), all of the `("a_","b")` vs `("a","_b")` → `a___b` family. `parseNamespacedId("a___b")` returns `{source:"a", name:"_b"}` — the other owner's outcomes get parsed into this identity.
- 5,445 ids additionally merge distinct *raw* pairs (sanitizer lossiness by design: `b.c` = `b c` = `b-c` = `b--c`; any all-unicode name → `x`, so two Chinese-named tools on one server collide on `src__x`).

## B. Registry + boot identity (live BackendManager, real SDK servers) (`b_registry`)

Phase 1 — 8 backends connected with colliding names. Registry keys: `my-server, my_server, MY-SERVER, my-server-2, skill-server, skill-server-2, a_, a`.

- Suffixing works; reserved word honored (`skill` → `skill-server`; literal `skill-server` → `skill-server-2`). Case and `_` vs `-` are preserved (those names do NOT collide).
- **Duplicate tool id across backends is real**: backend `a_` (tool `b`) and backend `a` (tool `_b`) both produce id `a___b`. `allTools()` exposes the duplicate; `lookup("a___b")` returns the first backend — the live call intended for backend `a`'s `_b` was **answered by backend `a_`'s `b`** (`P7::b` instead of `P8::_b`). 1 misroute / 10 tools in this rig; outcome rows for both physical tools merge under one capability id.

Phase 2 — config names `["my server", "my-server"]` (both sanitize to `my-server`; first connected wins the bare key). Boot 1: `my-server__run` → PHYS-A. Boot 2 with PHYS-A down (serve.ts catch path): `my-server__run` → **PHYS-B**. All ratings/OATS history recorded under that id silently transfers to a different physical server.

Phase 3 — serve.ts prune bookkeeping. serve.ts builds `unavailable = sanitizeSource(configName)`, but capabilities are stored under the **post-rename/suffix key**:

| stored source | protected set serve builds | result |
|---|---|---|
| `skill-server__lookup_docs` | `{skill, my-server}` | **PRUNED** |
| `my-server-2__run` | `{skill, my-server}` | **PRUNED** |
| `my-server__run` | `{skill, my-server}` | kept |
| counterfactual: protect actual stored sources | `{skill-server, my-server, my-server-2}` | pruned = [] |

## E. Same bug against a REAL production server (`e_realserver`)

Real `npx -y @modelcontextprotocol/server-filesystem` (real OS process, stdio, 14 tools, connect 694 ms) configured under the name `skill`: stored as `skill-server__*`; a real `list_directory` call routed correctly and returned the probe file. Next-boot simulation with the backend down: protection set `{skill}` → **14/14 capabilities pruned**, while stderr would have printed *“its learned state is preserved”*. Trust-claim violation, reproduced with a production server.

## C. trimSchema / toCard torture (`c_trimschema`)

16 cases — cyclic `$ref` (string), true JS object cycle, cyclic enum array, 50-deep nesting, 500 properties, 1000-entry enum, anyOf towers, boolean `true`/`false`, `null`, `undefined`, array-as-schema, properties-as-array, type-as-object, fat realistic schema:

- **Termination: every case < 0.2 ms** (max 0.183 ms; bound is depth-1 traversal). No hangs, cycles included.
- Throws: only `null` and `undefined` schemas (`TypeError: Cannot read properties of null (reading 'type')`). Unreachable through `toCard` (truthiness guard) and `fetchTools` (`?? {type:"object"}`), but `trimSchema` is an exported public API.
- **The trim does not trim enums**: 1000-entry enum → keptFraction **1.0** (33,958 of 33,958 bytes survive into the draft card ≈ 8.5k tokens per draft that includes the tool). For contrast: 500-prop schema keeps 16.2%, fat github-ish schema keeps 5.5%, description prose is capped at 240 chars.
- anyOf-rooted schema (123 KB) trims to 17 bytes `{"type":"object"}` — zero argument info survives for such tools (info).
- Cyclic enum: card itself builds, but `JSON.stringify` (the exact `handleDraft` pattern) throws. Reachability is limited: stdio JSON cannot carry cycles; via the in-process transport hook the cycle is stopped earlier — `syncCapabilities` throws (caught in serve.ts, index goes stale) so it never reaches a five-mode card. Live transparent-mode rig with the cyclic schema: `tools/list` succeeded over InMemoryTransport (no serialization) and the healthy tool still called fine — **no crash**.

## D. Ajv args_compatible (`d_ajv`, `d2_ajv_followup`)

Unit matrix (18 cases, verbatim `sixthManSuggestion` logic): draft-07 / 2020-12 / bogus `$schema` URIs all validate correctly after the top-level strip; nested `$schema` in a subschema is fine; recursive `$ref:"#"` fine; 50-deep/500-prop/1000-enum fine. **No case crashed the process; every throw was caught → `false`** (including a JS-cycle `RangeError`).

False verdicts (valid args reported incompatible):

| schema shape | result | thrown inside try |
|---|---|---|
| draft-07 tuple `items: [...]` | `false` (spec: valid) | `schema is invalid: .../items must be object,boolean` |
| draft-04 `exclusiveMinimum: true` | `false` (spec: valid) | `.../exclusiveMinimum must be number` |
| unresolvable `$ref` | `false` | `MissingRefError` |
| `$id` with fragment | `false` **from the first call** | `$id must match pattern "^[^#]*#?$"` |

**$id poisoning (live on the wire).** Alternate tool whose schema carries a clean `$id`: real client → real RosterServer five-mode, same failing call three times, identical args: `args_compatible` = **[true, false, false]** (`d2.liveCleanIdSequence`). Cause: each suggestion destructures a *fresh* schema object; Ajv registers the `$id` on first compile and throws `schema with key or id … already exists` on every later compile. A second tool sharing the same `$id` is *permanently* `false`. Server stayed alive throughout (`serverAliveAfter: true`).

**Recompile + leak.** The fresh-object-per-call pattern defeats Ajv's cache entirely (`ajv._cache` = 2,008 entries after 2,000 validates):

| schema | ms/validate (prod pattern) | heap growth | same-object baseline |
|---|---|---|---|
| 500 properties | **42.9 ms** | **612 MB / 2,000 calls (~0.3 MB each)** | 0.031 ms |
| typical 3-prop | 0.19 ms | 23.6 KB per call | — |
| 123 KB anyOf tower | 529 ms single compile, synchronous in the call handler | — | — |

## Conclusions (measurement → proposal, never applied)

1. **HIGH — prune-protection identity mismatch** (b.phase3, e): configured-name sanitization ≠ stored source for renamed (`skill`) and suffixed (dup-name) backends; learned state is deleted while stderr promises preservation. *Proposal: have `connect()` surface the final registry key and build `unavailable` from it (or map config name → key(s) at prune time).*
2. **HIGH — cross-boundary id collisions + live misrouting** (a, b.phase1): source ending `_` / name starting `_` collapse distinct identities into one id; lookup routes to the wrong physical backend. *Proposal: strip leading/trailing `_` in `sanitizeSource` and leading `_` runs in the name segment (or reject), making the first `__` provably the separator.*
3. **HIGH — boot-order identity swap for post-sanitization duplicate config names** (b.phase2): suffix assignment depends on connect order/success; ids migrate between physical servers across boots. *Proposal: suffix deterministically by config key (e.g. hash), or refuse duplicate sanitized names at config load.*
4. **HIGH — `$id` poisons `args_compatible`** (d, d2): flag flips true→false for identical args; cross-tool `$id` reuse permanently false; fragment-`$id` always false. *Proposal: strip `$id` alongside `$schema`, and cache compiled validators per capability id.*
5. **MEDIUM — per-suggestion recompile + unbounded `ajv._cache` growth** (d.cacheGrowth, d2.smallSchemaLeak): 1,383× slower than cached validation on fat schemas, ~24 KB–0.3 MB leaked per suggestion, half-second synchronous stall possible. Same proposal as (4).
6. **MEDIUM — dialect false-negatives** (d.unit): draft-07 tuple `items` / draft-04 boolean `exclusiveMinimum` → valid args labeled incompatible (contradicts the code comment's intent; no crash). *Proposal: on compile-throw, omit the flag or report `"unknown"` instead of `false`.*
7. **MEDIUM — trim keeps whole enums** (c.tokenSink): 34 KB enum → every draft card, keptFraction 1.0 while prose is capped. *Proposal: cap enum lists in cards (e.g. 20 + count).*
8. **LOW — `trimSchema(null/undefined)` throws**; guarded at internal call sites but exported. **LOW — sources sanitizing to `_`** produce ids `parseNamespacedId` itself rejects (sixthMan same-source filter degrades). **INFO — verified good**: suffixing/reserved-word logic, case/`_`-vs-`-` distinctness, 92.2% clean round-trip with a single failure mechanism, all trim cases < 0.2 ms, and **no live rig ever crashed** (charter d gate holds).
