# Gemma serve-level dense-path verification — 2026-07-04T16:41:16.906Z
machine RAM: 24 GiB → default model should be EmbeddingGemma-300M
  t+0s draft#1 (never blocked): starters=[memory__read_graph, memory__delete_relations…] · base_vecs=0@-d · need_vecs=0@-d
  t+20s draft#2 (never blocked): starters=[memory__read_graph, memory__delete_relations…] · base_vecs=0@-d · need_vecs=0@-d
  t+40s draft#3 (never blocked): starters=[memory__read_graph, memory__delete_relations…] · base_vecs=9@256d · need_vecs=1@256d

## WARM after ~40s (3 drafts, all served instantly meanwhile)
  ✓ base vectors backfilled for 9 capabilities at 256 dims
  ✓ need vectors recorded at 256 dims
  ✓ dims = 256 (Gemma Matryoshka) — model auto-select + truncation correct
  post-warm draft order: memory__read_graph, memory__delete_relations, memory__create_entities, memory__delete_observations, memory__add_observations
  ✓ memory tool ranks #1 with dense active
