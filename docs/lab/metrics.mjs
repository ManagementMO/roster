/** Shared metrics so every lab experiment reports comparable numbers. */

/** Extract ranked tool ids from draftCandidates() output (or raw id arrays). */
export const rankedIds = (candidates) => candidates.map((c) => (c.entry ? c.entry.id : c.id ?? c));

export const hitAtK = (ranked, acceptable, k) => ranked.slice(0, k).some((id) => acceptable.includes(id)) ? 1 : 0;

/** Reciprocal rank of the best-placed primary id (0 if absent). */
export const reciprocalRank = (ranked, primary) => {
  const idx = ranked.findIndex((id) => primary.includes(id));
  return idx === -1 ? 0 : 1 / (idx + 1);
};

export const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

export const percentile = (xs, p) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

/**
 * rows: [{ style, hit1, hit5, rr }] → overall + per-style aggregates.
 * Report `n` alongside every aggregate; per-style samples are small.
 */
export const summarize = (rows) => {
  const agg = (rs) => ({
    n: rs.length,
    hit1: +mean(rs.map((r) => r.hit1)).toFixed(3),
    hit5: +mean(rs.map((r) => r.hit5)).toFixed(3),
    mrr: +mean(rs.map((r) => r.rr)).toFixed(3),
  });
  const byStyle = {};
  for (const r of rows) (byStyle[r.style] ??= []).push(r);
  return {
    overall: agg(rows),
    byStyle: Object.fromEntries(Object.entries(byStyle).map(([s, rs]) => [s, agg(rs)])),
  };
};
