/**
 * Wilson score lower bound — the League's ranking key.
 * Humble with small samples by construction: wilson(3,3) < wilson(84,100).
 * https://www.evanmiller.org/how-not-to-sort-by-average-rating.html
 */
export function wilsonLowerBound(successes: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  if (successes < 0 || successes > n) throw new RangeError("successes must be within [0, n]");
  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = phat + z2 / (2 * n);
  const spread = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - spread) / denom);
}

export function percentile(sortedAscending: readonly number[], p: number): number | null {
  if (sortedAscending.length === 0) return null;
  const idx = Math.min(
    sortedAscending.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAscending.length) - 1),
  );
  return sortedAscending[idx] ?? null;
}

import type { LatencyBucket } from "./types.js";

export function latencyBucket(ms: number): LatencyBucket {
  if (ms < 250) return "<250";
  if (ms < 1000) return "250-1000";
  if (ms < 4000) return "1000-4000";
  return ">4000";
}
