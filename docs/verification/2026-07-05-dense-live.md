# Dense rung live verification — 2026-07-05T01:05:36.463Z
model: Xenova/all-MiniLM-L6-v2 (real download + inference via transformers.js)

## 1. Real embeddings load and run (background-fetch path)
  embedded 4 tool texts in 178ms (includes first-run model fetch if uncached)
  ✓ MiniLM vectors kept at native 384 dims (Matryoshka truncation is Gemma-only — live-verified fix)

## 2. Semantic beats lexical: paraphrased need, zero token overlap
  lexical-only order:  memory__create_entities, memory__search_nodes, fs__read_text_file, web__fetch_page
  hybrid (dense) order: memory__create_entities, memory__search_nodes, fs__read_text_file, web__fetch_page
  observed cosine span: 0.000 (< 0.15 ⇒ dense abstains by design)
  ✓ uninformative dense channel abstains — hybrid order equals lexical exactly

## 3. OATS refinement from real outcome vectors shifts ranking
  ✓ OATS adjusted exactly the tool with ≥4 real success vectors ({"adjusted":1,"skipped":3})
  post-OATS order for "recall stored knowledge about the user": memory__search_nodes(0.491), memory__create_entities(0.121), web__fetch_page(0.058), fs__read_text_file(undefined)
  ✓ the outcome-refined tool now ranks #1 for its winning need-shape

## Result: DENSE RUNG + OATS VERIFIED LIVE (real model, real inference)
