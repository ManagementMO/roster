import { describe, expect, it } from "vitest";
import { latencyBucket, percentile, wilsonLowerBound } from "./stats.js";

describe("wilsonLowerBound", () => {
  it("is humble with small samples: 84/100 outranks 3/3", () => {
    expect(wilsonLowerBound(84, 100)).toBeGreaterThan(wilsonLowerBound(3, 3));
  });

  it("matches known values", () => {
    expect(wilsonLowerBound(3, 3)).toBeCloseTo(0.4385, 3);
    expect(wilsonLowerBound(84, 100)).toBeCloseTo(0.7558, 3);
    expect(wilsonLowerBound(0, 10)).toBe(0);
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it("is monotonic in n at fixed rate", () => {
    expect(wilsonLowerBound(90, 100)).toBeGreaterThan(wilsonLowerBound(9, 10));
  });

  it("rejects impossible inputs", () => {
    expect(() => wilsonLowerBound(5, 3)).toThrow(RangeError);
    expect(() => wilsonLowerBound(-1, 3)).toThrow(RangeError);
  });
});

describe("latencyBucket", () => {
  it("buckets per spec", () => {
    expect(latencyBucket(0)).toBe("<250");
    expect(latencyBucket(249)).toBe("<250");
    expect(latencyBucket(250)).toBe("250-1000");
    expect(latencyBucket(999)).toBe("250-1000");
    expect(latencyBucket(1000)).toBe("1000-4000");
    expect(latencyBucket(4000)).toBe("1000-4000"); // exactly 4000 is not ">4000"
    expect(latencyBucket(4001)).toBe(">4000");
  });
});

describe("percentile", () => {
  it("computes p50/p95 on sorted arrays", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(100);
    expect(percentile([], 50)).toBeNull();
    expect(percentile([42], 95)).toBe(42);
  });
});
