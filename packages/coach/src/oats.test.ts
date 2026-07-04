import { describe, expect, it } from "vitest";
import { cosine, meanVec, normalize, oatsAdjust } from "./oats.js";

const v = (...xs: number[]) => new Float32Array(xs);

describe("vector helpers", () => {
  it("normalize produces unit vectors and tolerates zero", () => {
    const n = normalize(v(3, 4));
    expect(n[0]).toBeCloseTo(0.6, 5);
    expect(n[1]).toBeCloseTo(0.8, 5);
    expect([...normalize(v(0, 0))]).toEqual([0, 0]);
  });

  it("cosine basics", () => {
    expect(cosine(v(1, 0), v(1, 0))).toBeCloseTo(1, 6);
    expect(cosine(v(1, 0), v(0, 1))).toBeCloseTo(0, 6);
    expect(() => cosine(v(1), v(1, 0))).toThrow(RangeError);
  });

  it("meanVec averages", () => {
    expect([...meanVec([v(0, 2), v(2, 0)])]).toEqual([1, 1]);
  });
});

describe("oatsAdjust", () => {
  const base = normalize(v(1, 0, 0));
  const positives = [v(0, 1, 0), v(0, 0.9, 0.1), v(0.1, 1, 0), v(0, 1, 0.05)];
  const negatives = [v(1, 0, 0.9), v(0.9, 0, 1)];

  it("does not apply below the minimum-positives floor", () => {
    const r = oatsAdjust(base, positives.slice(0, 3), negatives);
    expect(r.applied).toBe(false);
    expect(cosine(r.vec, base)).toBeCloseTo(1, 5);
  });

  it("moves toward the success centroid and away from failures", () => {
    const r = oatsAdjust(base, positives, negatives);
    expect(r.applied).toBe(true);
    const posCentroid = meanVec(positives);
    const negCentroid = meanVec(negatives);
    expect(cosine(r.vec, posCentroid)).toBeGreaterThan(cosine(base, posCentroid));
    expect(cosine(r.vec, negCentroid)).toBeLessThan(cosine(base, negCentroid));
  });

  it("returns a unit vector and is deterministic", () => {
    const a = oatsAdjust(base, positives, negatives).vec;
    const b = oatsAdjust(base, positives, negatives).vec;
    let norm = 0;
    for (const x of a) norm += x * x;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
    expect([...a]).toEqual([...b]);
  });

  it("keeps description anchoring: adjusted vector still correlates with base", () => {
    const r = oatsAdjust(base, positives, negatives);
    expect(cosine(r.vec, base)).toBeGreaterThan(0.2);
  });
});
