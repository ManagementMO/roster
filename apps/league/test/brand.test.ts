import fs from "node:fs";
import { expect, it } from "vitest";
import { ROSTER_WORDMARK } from "../src/brand.js";

// Compare the actual outlines, independent of theme colors and renderer ids.
// This runs in normal CI, so editing the canonical asset cannot silently leave
// the self-contained League pages on a different version of the logo.
function geometry(svg: string) {
  return [...svg.matchAll(/<([A-Za-z][\w:-]*)\b([^>]*)>/g)].map((element) => ({
    tag: element[1],
    attributes: [...element[2]!.matchAll(/\b(viewBox|d|transform|x|y|width|height|rx|ry|cx|cy|r|points)="([^"]*)"/g)]
      .map((attribute) => [attribute[1], attribute[2]])
      .sort(([first], [second]) => first!.localeCompare(second!)),
  }));
}

it("keeps the embedded League wordmark in sync with the canonical SVG geometry", () => {
  const canonical = fs.readFileSync(new URL("../../../assets/brand/roster-r-01/roster-lockup-pearl.svg", import.meta.url), "utf8");
  expect(geometry(ROSTER_WORDMARK)).toEqual(geometry(canonical));
  expect(ROSTER_WORDMARK).toContain('aria-label="Roster"');
});
