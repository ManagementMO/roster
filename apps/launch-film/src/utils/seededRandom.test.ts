import { describe, expect, it } from "vitest";
import { makeSeededRandom, randomBetween } from "./seededRandom";

describe("seeded random utilities", () => {
  it("returns the same sequence for the same seed", () => {
    const first = makeSeededRandom("roster-launch");
    const second = makeSeededRandom("roster-launch");
    expect(Array.from({ length: 8 }, first)).toEqual(Array.from({ length: 8 }, second));
  });

  it("keeps ranged values inside the requested bounds", () => {
    const random = makeSeededRandom("range");
    const values = Array.from({ length: 100 }, () => randomBetween(random, -4, 9));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-4);
    expect(Math.max(...values)).toBeLessThan(9);
  });
});
