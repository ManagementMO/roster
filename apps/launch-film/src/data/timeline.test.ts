import { describe, expect, it } from "vitest";
import { FILM_FPS, MASTER_DURATION, SCENES } from "./timeline";

describe("master timeline", () => {
  it("runs for exactly 57 seconds at 60 fps", () => {
    expect(FILM_FPS).toBe(60);
    expect(MASTER_DURATION).toBe(57 * FILM_FPS);
  });

  it("contains all eleven scenes with no gaps or overlaps", () => {
    expect(SCENES.map((scene) => scene.id)).toEqual([
      "hook",
      "terminal",
      "overload",
      "init",
      "search",
      "clear",
      "startingFive",
      "toolCall",
      "sixthMan",
      "coachLeague",
      "final",
    ]);

    expect(SCENES[0]?.from).toBe(0);
    for (let index = 1; index < SCENES.length; index += 1) {
      expect(SCENES[index]?.from).toBe(SCENES[index - 1]?.to);
    }
    expect(SCENES.at(-1)?.to).toBe(MASTER_DURATION);
  });
});
