# notes-token-economics — the receipt/marketing numbers, measured for real

**Question.** What do Roster's public numbers (the "~85% token cut", the Day-0 receipt's ±15% estimate label, the 5-card draft) look like when measured against REAL servers, REAL wire payloads, and REAL tokenizers — and what does `trimSchema`'s depth-1 cut actually drop?

**Method.** `exp-token-economics.mjs` (+ `exp-token-economics-pretty.mjs`), all numbers in `results-token-economics.json`:

- Spawned real `@modelcontextprotocol/server-filesystem` + `server-memory` via `npx -y` (sandboxed to a tmp dir, `MEMORY_FILE_PATH` redirected). Captured raw `tools/list` from direct client connections.
- Ran the real `RosterServer` (transparent + five modes) over real MCP client connections (`InMemoryTransport`), real `BackendManager` against those live servers, real `CoachStore`, real MiniLM inference (`Xenova/all-MiniLM-L6-v2` via transformers.js) for tool/need vectors. Draft responses measured as the actual wire text served.
- Token definition: `estimateTokensFromChars` (= ceil(chars/4), the shipped estimator) on compact JSON for lists (conservative: favors the direct baseline) and on as-served text for draft responses. Cross-checked with two real tokenizers run locally: MiniLM WordPiece and `Xenova/claude-tokenizer` (**legacy** public Anthropic BPE, Claude-1.x era — labeled as such; it is NOT any current model's tokenizer, and no current-Claude numbers are claimed anywhere here).
- 133-tool corpus (`corpus.mjs`) drafted across all 66 ground-truthed needs (`needs.mjs`), exact `handleDraft` payload shape.
- Trim ladder `trimAtDepth(schema, d)` verified to reproduce the shipped `trimSchema` byte-for-byte at d=1 on 23/23 real schemas (`stableStringify` equality).

## A. Live servers: 23 real tools (fs 14, memory 9)

| surface | chars | est tokens |
|---|---|---|
| direct tools/list (both servers) | 22,034 | **5,509** |
| roster transparent list | 19,950 | 4,988 (−9.5% vs direct) |
| five-mode static surface (draft+call defs) | 809 | **203** |
| draft response, actual wire (n=14 needs) | mean 2,651 | **mean 662.9** (p95 803) |

**Headline (est-token terms): 23 tools, 5,509 tokens direct vs 866 via draft+one-draft = −84.3%.** Break-even: 8.0 drafts before five-mode exceeds the direct list.

Same headline recomputed end-to-end inside each real tokenizer (all measured, no scaling):

| counter | direct | static | draft mean | 1-draft session | saved | break-even |
|---|---|---|---|---|---|---|
| chars/4 (shipped) | 5,509 | 203 | 662.9 | 866 | **−84.3%** | 8.0 |
| MiniLM WordPiece | 8,503 | 302 | 654.8 | 957 | **−88.7%** | 12.5 |
| legacy-Claude BPE | 4,868 | 189 | 623.5 | 813 | **−83.3%** | 7.5 |

→ The "~85%" marketing figure is REAL at this scale and robust across tokenizer families (83.3–88.7%).

**Transparent mode drops fields.** The transparent list is *smaller* than direct despite adding `fs__`/`memory__` prefixes, because `RosterServer.listTools()` maps only `{name, description, inputSchema, outputSchema}`. Measured drops: `title` (23/23 tools, 575 chars), `annotations` (14/23, 678 chars — includes `readOnlyHint`/`destructiveHint` that clients use for permission gating), `execution` (23/23, 897 chars). "Byte-faithful passthrough" currently holds for calls, not for the list.

## B. 133-tool corpus, 66 needs

Corpus ships stub schemas (`{type:"object"}`), so its full list is a **lower bound**; measured real-schema weight is 958 chars/tool (part A) vs 132.6 chars/tool for stubs. `hybridList` grafts the 23 real captured fs/memory schemas onto the matching corpus tools (110 remain stubs).

| surface | est tokens |
|---|---|
| full 133 list (stub schemas) | **4,408** (lower bound) |
| full 133 list (23 real schemas grafted) | 5,843 (still a lower bound) |
| draft wire mean (n=66, real MiniLM vectors) | **297.5** (p95 313; compact 218.7) |
| one-draft session (203 static + draft) | **501** |

**Headline: 133 tools, ≥4,408 tokens direct vs 501 via draft = −88.6% (−91.4% against the hybrid list).** Break-even 14.1 drafts (stub) / 19.0 (hybrid). Sanity: hit@5 = 0.773 across the 66 needs (live subset 0.714, n=14) — drafts are sane, not degenerate.

## C. Is `estimateTokensFromChars` honest? (receipt claims ±15%)

| payload | chars | chars/4 | MiniLM | legacy-Claude | bias vs MiniLM | bias vs legacy-Claude |
|---|---|---|---|---|---|---|
| fs direct list | 12,227 | 3,057 | 4,587 | 2,725 | −33.4% | +12.2% |
| memory direct list | 9,808 | 2,452 | 3,914 | 2,146 | −37.4% | +14.3% |
| fs+memory list | 22,034 | 5,509 | 8,503 | 4,868 | −35.2% | +13.2% |
| draft+call defs | 809 | 203 | 302 | 189 | −32.8% | +7.4% |
| largest live draft wire | 3,209 | 803 | 775 | 743 | +3.6% | +8.1% |
| corpus 133 list | 17,630 | 4,408 | 6,627 | 3,911 | −33.5% | +12.7% |
| corpus hybrid list | 23,372 | 5,843 | 9,135 | 5,309 | −36.0% | +10.1% |
| plain-prose control | 246 | 62 | 51 | 49 | +21.6% | +26.5% |

- Against the legacy-Claude BPE, chars/4 is within ±15% **on JSON payloads only** (+7…+14%); on prose it overcounts by +26.5% — and the receipt's flagship number (OpenClaw skill injection) is prose-shaped.
- Against WordPiece it is −33…−37% on compact JSON. **The "±15%" label is tokenizer-family- and payload-type-dependent, not a general property.**
- Caveat (stated, not dodged): neither measured tokenizer is Claude's or GPT's *current* one; modern code-trained BPEs compress JSON better than the 2023 BPE, which would push chars/4 further into overcounting. No current-model numbers are fabricated here — these are measured brackets.

**Pretty-printing (`JSON.stringify(payload, null, 2)` in `handleDraft`) costs real tokens.** On the 14 actual live draft wires: +53.3% vs compact on the legacy-Claude BPE (623.5 → 406.8 mean), +46.1% in chars/4 terms. MiniLM reports 0.0% — an artifact (BERT normalizers erase whitespace), i.e., WordPiece counters are blind to this class of waste. Compact serving would cut the one-draft session to ~657 est tokens (−88.1% instead of −84.3% at 23 tools).

## D. trimSchema depth study (real schemas + 3 pathological synthetics)

Mean card tokens across the 23 real schemas (card = id/kind/description/input):

| depth | d0 | **d1 (shipped)** | d2 | d3 | d6 | full |
|---|---|---|---|---|---|---|
| mean | 28.8 | **47.9** | 51.0 | 59.3 | 60.1 | 91.2 |
| max | 34 | 61 | 67 | 91 | 97 | 155 |

Dropped-key census at shipped d1 (23 real schemas): `items` **14/14 dropped**, prop `description` 26/26 dropped, `default` 4/4 dropped, nested `required` 6/27 dropped (top-level 21 kept), nested `properties` 6/29 flattened, `enum` 1/1 kept.

**11/23 tools (48%) lose argument *structure*, not just prose**: every array-of-object arg becomes `{type:"array"}` — e.g. `fs__edit_file.edits` (items `{oldText, newText}`, both required, invisible) and `memory__create_entities.entities` (items `{name, entityType, observations}`, all required, invisible). An agent in five mode cannot construct valid args from these cards without a failed probe call first. Restoring structure with depth-2 costs **+13.1%** card tokens on exactly those 11 tools (49.3 → 55.7 mean; +6.4 tokens/card ≈ +32 tokens per 5-card draft).

Synthetics (tokens per card at each depth):

| schema | d0 | d1 | d2 | d3 | d6 | full |
|---|---|---|---|---|---|---|
| deep6 (6-level nesting) | 25 | 48 | 70 | 93 | 165 | 229 |
| wide200 (200 properties) | 26 | **1,800** | 1,800 | 1,800 | 1,800 | 4,707 |
| anyOf forest (4-branch × 3-deep) | 34 | 56 | 71 | 128 | 2,100 | 2,664 |

- **No width guard**: depth trimming gives zero protection against wide schemas — one 200-prop tool yields an 1,800-token card at d1; five such cards (9,000t) would exceed most full lists.
- anyOf at d1 collapses to `{type:"any"}` — cheap but total information loss on the discriminated-union arg.

## Conclusions

1. **The headline is honest at 23 real tools: −84.3% (est), −83.3…−88.7% across real tokenizer families; ≥−88.6% at 133 tools.** Break-even 7.5–12.5 drafts (23 tools) / 14–19 (133) — sessions that re-draft heavily still win at realistic scales.
2. Transparent mode's tool list silently strips `title`, `annotations` (incl. read-only hints), and `execution` — measurable (2,150 chars across 23 tools) and contrary to the passthrough promise.
3. The draft response's pretty-printing burns ~50% extra real tokens on whitespace-sensitive BPEs; compacting is a free win.
4. The receipt's "±15%" label on chars/4 is not defensible as stated — measured bias spans −37%…+27% depending on tokenizer family and payload type.
5. Depth-1 trim erases argument structure for half the official servers' tools; depth-2 buys it back for +13% on the affected cards. Independent width cap needed for pathological wide schemas.

*(Scratch payload captures under tmp-token-economics/ were deleted after the run per lab rules; rerun `node docs/lab/exp-token-economics.mjs` then `node docs/lab/exp-token-economics-pretty.mjs` to regenerate everything, including raw captures.)*
