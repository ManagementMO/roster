/**
 * Deterministic pseudo-randomness.
 *
 * `Math.random()` is banned in this project: a render is a pure function of the
 * frame number, and two renders of frame 812 must be byte-identical. Everything
 * that needs to look scattered — the tool field, grain offsets, fragment
 * trajectories — draws from a seeded mulberry32 stream instead.
 */

/** mulberry32: small, fast, good enough distribution for visual scatter. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable hash of a string → seed. Lets components seed from their own name. */
export function seedFrom(label: string): number {
  let h = 2166136261;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Uniform float in [min, max). */
export function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Uniform integer in [min, max]. */
export function rangeInt(rng: () => number, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1));
}

/** Pick one element. Never returns undefined for a non-empty array. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() from an empty array");
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))] as T;
}

/**
 * Poisson-ish scatter: sample `count` points in a box, rejecting any that fall
 * within `minDist` of an accepted point. Bounded attempts so it always
 * terminates; returns however many it managed to place. Used for the background
 * tool field, where an even-but-not-gridded distribution is the whole point.
 */
export function scatter(
  seed: number,
  count: number,
  box: { x: number; y: number; w: number; h: number },
  minDist: number,
): Array<{ x: number; y: number }> {
  const rng = makeRng(seed);
  const points: Array<{ x: number; y: number }> = [];
  const maxAttempts = count * 24;
  for (let i = 0; i < maxAttempts && points.length < count; i++) {
    const x = box.x + rng() * box.w;
    const y = box.y + rng() * box.h;
    let ok = true;
    for (const p of points) {
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy < minDist * minDist) {
        ok = false;
        break;
      }
    }
    if (ok) points.push({ x, y });
  }
  return points;
}
