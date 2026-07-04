/**
 * OATS — outcome-aware embedding refinement (arXiv 2603.13426).
 * Pure vector math: no I/O, no model, no clock. The store feeds it and persists results.
 */

export function normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm === 0) return new Float32Array(v.length);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = (v[i] as number) / norm;
  return out;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new RangeError("dimension mismatch");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function meanVec(vs: readonly Float32Array[]): Float32Array {
  if (vs.length === 0) throw new RangeError("meanVec of empty set");
  const dims = vs[0]!.length;
  const out = new Float32Array(dims);
  for (const v of vs) {
    if (v.length !== dims) throw new RangeError("dimension mismatch");
    for (let i = 0; i < dims; i++) out[i] = (out[i] as number) + (v[i] as number);
  }
  for (let i = 0; i < dims; i++) out[i] = (out[i] as number) / vs.length;
  return out;
}

export interface OatsOptions {
  alpha?: number;
  beta?: number;
  iterations?: number;
  minPositives?: number;
}

export interface OatsResult {
  vec: Float32Array;
  applied: boolean;
}

/**
 * ê ← normalize((1−α)·ê + α·mean(Q⁺) − β·mean(Q⁻)), iterated N times from the
 * base description embedding. Below minPositives (paper floor: 4) the base is
 * returned untouched — cold-start tools keep their description semantics.
 */
export function oatsAdjust(
  base: Float32Array,
  positives: readonly Float32Array[],
  negatives: readonly Float32Array[],
  opts: OatsOptions = {},
): OatsResult {
  const { alpha = 0.3, beta = 0.1, iterations = 3, minPositives = 4 } = opts;
  if (positives.length < minPositives) {
    return { vec: normalize(base), applied: false };
  }
  const posCentroid = meanVec(positives);
  const negCentroid = negatives.length > 0 ? meanVec(negatives) : null;

  let e = normalize(base);
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Float32Array(e.length);
    for (let i = 0; i < e.length; i++) {
      let x = (1 - alpha) * (e[i] as number) + alpha * (posCentroid[i] as number);
      if (negCentroid) x -= beta * (negCentroid[i] as number);
      next[i] = x;
    }
    e = normalize(next);
  }
  return { vec: e, applied: true };
}
