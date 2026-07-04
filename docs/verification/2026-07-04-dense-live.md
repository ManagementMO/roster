# Dense rung live verification — 2026-07-04T16:17:08.184Z
model: Xenova/all-MiniLM-L6-v2 (real download + inference via transformers.js)

## 1. Real embeddings load and run (background-fetch path)
  embedded 4 tool texts in 175ms (includes first-run model fetch if uncached)
  ✓ MiniLM vectors kept at native 384 dims (Matryoshka truncation is Gemma-only — live-verified fix)

## 2. Semantic beats lexical: paraphrased need, zero token overlap
  lexical-only order:  memory__search_nodes, fs__read_text_file, memory__create_entities, web__fetch_page
  hybrid (dense) order: memory__search_nodes, memory__create_entities, web__fetch_page, fs__read_text_file
  ✓ dense puts both memory tools on top for "remember a fact about the user for later" (top cos=-0.041)
  ✓ the file tool — #2 lexically on token noise — is demoted to last by dense fusion

## 3. OATS refinement from real outcome vectors shifts ranking
  ✓ OATS adjusted exactly the tool with ≥4 real success vectors ({"adjusted":1,"skipped":3})
  post-OATS order for "recall stored knowledge about the user": memory__search_nodes(0.491), memory__create_entities(0.121), web__fetch_page(0.058), fs__read_text_file(0.056)
  ✓ the outcome-refined tool now ranks #1 for its winning need-shape

## Result: DENSE RUNG + OATS VERIFIED LIVE (real model, real inference)
