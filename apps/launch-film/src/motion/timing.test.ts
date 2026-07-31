import { describe, expect, it } from "vitest";
import {
  BOUNDARIES,
  DURATION_IN_FRAMES,
  FPS,
  POSTER_FRAME,
  SCENES,
  TEASER,
  TEASER_DURATION,
  localFrame,
  sampleFrames,
  scene,
} from "./timing";

describe("scene table", () => {
  it("is contiguous — no gap and no overlap between scenes", () => {
    for (let i = 1; i < SCENES.length; i++) {
      const previous = SCENES[i - 1]!;
      const current = SCENES[i]!;
      expect(current.from).toBe(previous.from + previous.duration);
    }
  });

  it("starts at frame 0 and runs 54–58 seconds", () => {
    expect(SCENES[0]!.from).toBe(0);
    const seconds = DURATION_IN_FRAMES / FPS;
    expect(seconds).toBeGreaterThanOrEqual(54);
    expect(seconds).toBeLessThanOrEqual(58);
  });

  it("implements all eleven beats of the brief", () => {
    expect(SCENES.map((s) => s.id)).toEqual([
      "hook",
      "terminal",
      "overload",
      "initialize",
      "search",
      "clearing",
      "startingFive",
      "toolCall",
      "sixthMan",
      "coachLeague",
      "reveal",
    ]);
  });

  it("exposes one boundary per cut", () => {
    expect(BOUNDARIES).toHaveLength(SCENES.length - 1);
    expect(BOUNDARIES.every((b) => b > 0 && b < DURATION_IN_FRAMES)).toBe(true);
  });

  it("keeps the hook readable inside two seconds", () => {
    // The hook has to land its sentence within 120 frames; the scene itself must
    // therefore be at least that long, or the copy would be cut off mid-reveal.
    expect(scene("hook").duration).toBeGreaterThanOrEqual(120);
  });

  it("holds the reveal long enough to read the command", () => {
    // The command plate appears at local frame 150; anything under ~200 frames
    // would push it off screen before it can be read.
    expect(scene("reveal").duration).toBeGreaterThanOrEqual(200);
  });
});

describe("frame helpers", () => {
  it("converts absolute frames to scene-local ones", () => {
    const s = scene("search");
    expect(localFrame("search", s.from)).toBe(0);
    expect(localFrame("search", s.from + 42)).toBe(42);
  });

  it("samples entry, midpoint and exit strictly inside every scene", () => {
    for (const s of SCENES) {
      const f = sampleFrames(s.id);
      expect(f.entry).toBeGreaterThan(s.from);
      expect(f.entry).toBeLessThan(f.mid);
      expect(f.mid).toBeLessThan(f.exit);
      expect(f.exit).toBeLessThan(s.from + s.duration);
    }
  });

  it("throws on an unknown scene rather than silently rendering nothing", () => {
    // @ts-expect-error — deliberately invalid id
    expect(() => scene("nope")).toThrow(/unknown scene/);
  });

  it("puts the poster frame inside the reveal, before its fade-out", () => {
    const reveal = scene("reveal");
    expect(POSTER_FRAME).toBeGreaterThan(reveal.from);
    expect(POSTER_FRAME).toBeLessThan(reveal.from + reveal.duration - 20);
  });
});

describe("teaser cut", () => {
  it("only samples windows that exist in the film", () => {
    for (const seg of TEASER.segments) {
      expect(seg.from).toBeGreaterThanOrEqual(0);
      expect(seg.from + seg.duration).toBeLessThanOrEqual(DURATION_IN_FRAMES);
    }
  });

  it("reports its own total length", () => {
    expect(TEASER_DURATION).toBe(TEASER.segments.reduce((n, s) => n + s.duration, 0));
  });
});
