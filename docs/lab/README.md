# The Lab — empirical experiment campaign

The dense-embedding sweep proved that live measurement finds truths code review cannot (the `(cos+1)/2` mapping silently turned 70/30 hybrid fusion into ~10/90 — only visible with a real model). This directory extends that method to the whole system.

**Shared fixtures** (every experiment uses these so numbers are comparable):

- `corpus.mjs` — 133 tool cards across 20 sources, modeled on real public MCP servers (names real; descriptions faithful one-liners that may lag upstream).
- `needs.mjs` — 66 ground-truthed agent needs across styles (paraphrase / terse / verbose / typo / trap / cross-server / zero-overlap / non-english). Ground truth is human judgment; treat it as fallible when interpreting misses.
- `metrics.mjs` — hit@k, MRR, percentiles, per-style summaries.

**Experiment outputs**: each experiment writes `exp-<slug>*.mjs` (the runnable script), `results-<slug>.json` (raw measured output — every published number must trace here), and `notes-<slug>.md` (method + numbers + conclusion). No fabricated numbers, ever: a number without a results-file trace does not exist.

Import mechanics for built packages: see `docs/verification/dense-live.mjs`.
