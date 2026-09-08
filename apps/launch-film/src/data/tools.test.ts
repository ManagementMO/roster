import { describe, expect, it } from "vitest";
import { BENCH_TOOL, DETAILED_TOOLS, STARTING_FIVE } from "./tools";

describe("film tool universe", () => {
  it("has exactly five selected starters and a distinct Sixth Man", () => {
    expect(STARTING_FIVE).toHaveLength(5);
    expect(new Set(STARTING_FIVE.map((tool) => tool.id)).size).toBe(5);
    expect(STARTING_FIVE.every((tool) => tool.selected)).toBe(true);
    expect(STARTING_FIVE.some((tool) => tool.id === BENCH_TOOL.id)).toBe(false);
    expect(BENCH_TOOL.benchRank).toBe(1);
  });

  it("keeps every detailed card stable and uniquely addressable", () => {
    expect(new Set(DETAILED_TOOLS.map((tool) => tool.id)).size).toBe(DETAILED_TOOLS.length);
    expect(DETAILED_TOOLS.every((tool) => tool.position.length === 3)).toBe(true);
  });
});
