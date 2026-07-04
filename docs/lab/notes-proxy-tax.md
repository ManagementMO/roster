# proxy-tax: the honest cost of the roster middleman

**Question.** What does putting Roster between an agent and its MCP servers actually cost — per call, per draft, at boot, and on disk?

**Machine.** Apple M5 (10 cores), 24 GiB RAM, node v22.22.3, macOS. NOTE: 24 GiB ≥ 8 GiB means the real `roster serve` auto-selects **Gemma** (`selectModelId`), so (c) measures the Gemma path — the true default on this machine. (a)/(d) use MiniLM per swarm convention. All raw numbers: `docs/lab/results-proxy-tax.json`. Scripts: `docs/lab/exp-proxy-tax-*.mjs`.

**Method.** hrtime.bigint, warmup excluded, p50/p95 over ≥100 iterations unless a row states n. Real machinery only: real MiniLM/Gemma ONNX inference (transformers.js, models pre-cached — model *download* is excluded everywhere and said so), real `packages/cli/dist/bin.js serve` over stdio, real `npx @modelcontextprotocol/server-filesystem`, a real 133-tool MCP stdio backend built from the shared corpus (`exp-proxy-tax-corpus-server.mjs`), real SQLite files.

## (a) draftCandidates latency vs roster size (in-process, k=5, 66 real needs × 3 rounds)

| tools | lexical p50 | lexical p95 | hybrid p50 | hybrid p95 | hybrid/lex |
|---|---|---|---|---|---|
| 10 | 0.036 ms | 0.045 ms | 0.047 ms | 0.066 ms | 1.3× |
| 50 | 0.047 ms | 0.074 ms | 0.131 ms | 0.160 ms | 2.8× |
| 133 | 0.075 ms | 0.098 ms | 0.303 ms | 0.354 ms | 4.0× |
| 500 | 0.117 ms | 0.180 ms | 1.104 ms | 1.311 ms | 9.4× |

Plus the warm per-need embed that a hybrid draft needs: MiniLM single-text p50 **0.883 ms** / p95 1.468 ms (n=120). Embedding 500 tool cards once took 676 ms (batch 16). Hybrid grows ~linearly with roster size because `loadVecs()` re-reads and deserializes **every** vec blob from SQLite on every draft (500 × 1.5 KiB ≈ 0.77 MB per draft at 500 tools). At realistic sizes this is still ~1 ms — a non-problem today; the scaling shape is worth knowing at 5k+ tools.

## (b) per-call tax through the real middleman (read_text_file, n=120/condition, A/B/A)

| condition | 1 KiB p50 | 1 KiB p95 | 64 KiB p50 (n=40) |
|---|---|---|---|
| direct → fs server (#1) | 0.165 ms | 0.274 ms | 0.612 ms |
| direct → fs server (#2, drift check) | 0.171 ms | 0.247 ms | 0.562 ms |
| through `roster serve` (transparent) | 0.380 ms | 0.695 ms | 1.256 ms |
| through `roster serve` (five: `call`) | 0.355 ms | 0.474 ms | 1.206 ms |

**Added by the middleman: ~+0.19–0.22 ms p50 (+0.23–0.45 ms p95) on 1 KiB; ~+0.64–0.69 ms on 64 KiB.** The tax is payload-proportional (extra JSON parse/serialize hop each way) but sub-millisecond at 64 KiB — noise against any real tool that does I/O. Five-mode wire `draft` (lexical, 14 tools, embeddings off): p50 0.192 ms. Outcome logging is on the hot path but costs ~34 µs/call (see d).

## (c) cold boot → first draft, 133 real tools (five mode; models already in cache — download excluded)

| boot | connect (spawn→MCP init) | listTools | first draft | serve RSS after draft |
|---|---|---|---|---|
| embeddings off | 181.5 ms | 182.8 ms | 184.3 ms | 84 MB |
| auto #1 | 166.8 ms | 167.5 ms | 187.6 ms | 91 MB |
| auto #2 | 268.2 ms | 269.3 ms | 290.9 ms | 101 MB |
| auto #3 | 242.3 ms | 243.4 ms | 261.6 ms | 91 MB |
| auto #4 | 175.2 ms | 176.0 ms | 190.8 ms | 90 MB |
| auto #5 (warm DB) | 181.6 ms | 182.4 ms | 197.9 ms | 90 MB |

Boot→usable is **~0.17–0.29 s**, and the first draft really is served lexically without waiting on the model (design claim verified live). Dense rung ready (all 133 vecs backfilled): **3.3 s** after boot (Gemma, warm cache). Then:

- **serve RSS with Gemma resident: 1.73–1.93 GB** (vs ~90 MB router-only). One `roster serve` runs **per client session** (db.ts), so 3 concurrent MCP clients ≈ 5+ GB RAM until the 10-min idle unload.
- **Hybrid wire draft p50 after warm: 51–58 ms** (Gemma per-need embed dominates; MiniLM's is 0.9 ms).
- **Warm-DB reboot re-embeds everything:** boot #5 reused boot #2's coach.db (133 vecs already stored, same model) yet all 133 vec rows were rewritten (updated_at ≥ boot time), dense-ready again 3.2 s — `makeLazyEmbedder`'s backfill has no "vec already current" skip. Cheap on an M5, pure waste (CPU + battery + delayed dense readiness) on every session start of every machine; grows with roster size.

## (d) coach.db growth + maintenance at 10k outcomes (file DB, WAL-checkpointed sizes)

| stage | size |
|---|---|
| schema only | 88 KiB |
| +133 capabilities | 152 KiB |
| +133 MiniLM base vecs | 420 KiB |
| +66 need vecs | 560 KiB |
| +1k outcomes | 820 KiB |
| +10k outcomes | 3,156 KiB |
| after recomputeRatings | 3,172 KiB |
| after runOats (133 adj vecs) | 3,436 KiB |

- **~266 B per outcome** (marginal, 1k→10k). recordOutcome p50 **34 µs** / p95 49 µs (n=10,000) — the write tax on every proxied call.
- Draft latency on the 10k-outcome DB (133 tools): lexical p50 0.098 ms (fresh: 0.075), hybrid 0.391 ms (fresh: 0.303), post-OATS hybrid 0.416 ms — ~30% relative drift, absolutely negligible; **no meaningful degradation at 10k outcomes**.
- Maintenance at 10k: recomputeRatings **3.8–5.5 ms**; runOats **32–37 ms** (adjusted all 133). The opportunistic boot maintenance is invisible.
- **need_vec is the real grower and is never pruned**: measured **2,138 B per unique need** (1,000 real unique MiniLM embeds stored → +2,088 KiB). Only a model switch wipes it (`ensureEmbeddingModel`); `outcome` rows are never deleted either. Arithmetic on measured marginals (not a simulation): 100 unique needs/day ≈ 75 MB/year need_vec + ~10 MB/year outcomes. Not urgent, but unbounded.

## Conclusion — the honest proxy-tax table

| cost | measured |
|---|---|
| per proxied tool call | +0.19–0.22 ms p50 (1 KiB); +~0.65 ms (64 KiB); payload-proportional |
| per draft (lexical, 133 tools) | ~0.1 ms in-process, ~0.2 ms wire |
| per draft (hybrid) | +0.9 ms MiniLM / +~55 ms Gemma (embed dominates) |
| boot → first usable draft (133 tools) | 0.17–0.29 s (dense not required) |
| dense ready after boot | ~3.3 s warm-cache Gemma; re-paid every session (no vec reuse) |
| RAM | ~90 MB router-only; **1.7–1.9 GB with Gemma resident, per client session** |
| disk | 3.4 MiB @ 133 tools + 10k outcomes; ~266 B/outcome; 2.1 KiB/unique need, unpruned |

The latency story is genuinely excellent — the middleman is sub-ms everywhere the router itself decides. The two honest costs are RAM under the default Gemma path (per-session, multiplied across clients) and the every-session full re-embed of the roster.
