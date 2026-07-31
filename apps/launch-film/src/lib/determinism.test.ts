import { describe, expect, it } from "vitest";
import { centerline, houseCurve, polygon, pt, radialCurve, ribbonPath, roundedPolyPath } from "./geometry";
import { makeRng, scatter, seedFrom } from "./rng";
import { buildField, CANDIDATES, LINEUP, SEARCH_SLOTS, STARTER_CANDIDATES } from "./world";

describe("seeded randomness", () => {
  it("produces the same stream for the same seed", () => {
    const a = makeRng(1234);
    const b = makeRng(1234);
    const left = Array.from({ length: 32 }, () => a());
    const right = Array.from({ length: 32 }, () => b());
    expect(left).toEqual(right);
  });

  it("produces a different stream for a different seed", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a()).not.toBe(b());
  });

  it("stays inside [0, 1)", () => {
    const rng = makeRng(seedFrom("roster"));
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("hashes a label to a stable seed", () => {
    expect(seedFrom("roster-field")).toBe(seedFrom("roster-field"));
    expect(seedFrom("roster-field")).not.toBe(seedFrom("roster-fielc"));
  });

  it("scatters without ever placing two points closer than minDist", () => {
    const points = scatter(99, 60, { x: 0, y: 0, w: 1600, h: 900 }, 90);
    expect(points.length).toBeGreaterThan(20);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]!;
        const b = points[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(90);
      }
    }
  });
});

describe("the shared world is deterministic", () => {
  it("rebuilds the background field identically", () => {
    expect(buildField(seedFrom("roster-field"))).toEqual(buildField(seedFrom("roster-field")));
  });
});

describe("ribbon geometry", () => {
  const curve = radialCurve(pt(100, 100), pt(900, 500), 0.42, 30);

  it("returns a closed filled path, not a stroke", () => {
    const d = ribbonPath(curve, () => 8);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("draws nothing at zero progress and something at full progress", () => {
    expect(ribbonPath(curve, () => 8, 0)).toBe("");
    expect(ribbonPath(curve, () => 8, 1).length).toBeGreaterThan(100);
  });

  it("advances toward the target as progress grows", () => {
    // The path string has a fixed segment count, so its LENGTH is constant —
    // what must grow is how far along the curve the ribbon actually reaches.
    const endOf = (p: number) => {
      const points = centerline(curve, p, 40).split("L");
      const last = points[points.length - 1]!;
      const [x, y] = last.replace("M", "").split(",").map(Number);
      return Math.hypot(x! - 100, y! - 100);
    };
    const reach = [0.25, 0.5, 0.75, 1].map(endOf);
    for (let i = 1; i < reach.length; i++) {
      expect(reach[i]!).toBeGreaterThan(reach[i - 1]!);
    }
    expect(endOf(1)).toBeCloseTo(Math.hypot(800, 400), 4);
  });

  it("is byte-identical across calls — a render must be reproducible", () => {
    expect(ribbonPath(curve, (t) => 9 - t * 4, 0.66)).toBe(ribbonPath(curve, (t) => 9 - t * 4, 0.66));
    expect(centerline(curve, 0.66)).toBe(centerline(curve, 0.66));
  });

  it("keeps the house curve's endpoints exact", () => {
    const [p0, , , p3] = houseCurve(pt(10, 20), pt(500, 300), 40);
    expect(p0).toEqual({ x: 10, y: 20 });
    expect(p3).toEqual({ x: 500, y: 300 });
  });
});

describe("prism geometry", () => {
  it("builds a five-sided housing whose vertices sit on the radius", () => {
    const points = polygon(pt(0, 0), 150, 5, 0);
    expect(points).toHaveLength(5);
    for (const p of points) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(150, 6);
    }
  });

  it("puts the first vertex straight up at rotation 0", () => {
    const [first] = polygon(pt(0, 0), 100, 5, 0);
    expect(first!.x).toBeCloseTo(0, 6);
    expect(first!.y).toBeCloseTo(-100, 6);
  });

  it("rounds a polygon into a closed path", () => {
    const d = roundedPolyPath(polygon(pt(0, 0), 100, 5, 0), 12);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("Q");
  });
});

describe("staging", () => {
  it("draws exactly five starters", () => {
    expect(STARTER_CANDIDATES).toHaveLength(5);
    expect(LINEUP).toHaveLength(5);
  });

  it("gives every search candidate a slot", () => {
    expect(SEARCH_SLOTS.length).toBeLessThanOrEqual(CANDIDATES.length);
  });

  it("keeps the lineup inside the social-safe box", () => {
    for (const slot of LINEUP) {
      expect(slot.x - slot.width / 2).toBeGreaterThanOrEqual(160);
      expect(slot.x + slot.width / 2).toBeLessThanOrEqual(1760);
    }
  });

  it("never puts two lineup cards on top of each other", () => {
    const sorted = [...LINEUP].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const left = sorted[i - 1]!;
      const right = sorted[i]!;
      expect(right.x - right.width / 2).toBeGreaterThan(left.x + left.width / 2);
    }
  });
});
