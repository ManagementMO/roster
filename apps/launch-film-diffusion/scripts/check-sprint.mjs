import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designPath = path.join(ROOT, "src", "sprint", "design.js");
const scenesPath = path.join(ROOT, "src", "sprint", "scenes.js");
const sourcePath = path.join(ROOT, "src", "roster-film-sprint.jsx");
const scorePath = path.join(ROOT, "assets", "roster-launch-sprint-score.wav");

for (const requiredPath of [designPath, scenesPath, sourcePath, scorePath]) {
  assert.equal(existsSync(requiredPath), true, `Sprint production asset must exist: ${requiredPath}`);
}

const design = await import(pathToFileURL(designPath).href);
assert.equal(design.DURATION, 9.6, "Sprint duration must remain exactly 9.6 seconds");
assert.ok(design.DURATION <= 10, "Sprint must never exceed ten seconds");
assert.deepEqual(
  design.COLOR,
  {
    paper: "#F7F8FA",
    white: "#FFFFFF",
    ink: "#070A10",
    slate: "#576170",
    line: "#DCE2EA",
    blue: "#246BFD",
    blueDeep: "#1649B8",
    green: "#22A66F",
    amber: "#E8A62D",
  },
  "Sprint palette must stay neutral and brand-clean",
);
assert.equal(design.STARTERS.length, 5, "Exactly five tools must form the lineup");
assert.equal(Object.keys(design.TIMELINE).length, 5, "The sprint must keep a five-beat story spine");
assert.ok(Math.max(...Object.values(design.TIMELINE).map((range) => range[1])) <= design.DURATION);

const source = readFileSync(sourcePath, "utf8");
const scenes = readFileSync(scenesPath, "utf8");
const combined = `${source}\n${scenes}`;
for (const token of [
  'scene="roster-launch-sprint"',
  "YOUR AGENT HAS",
  "200",
  "ONLY FIVE",
  "THE STARTING FIVE",
  "npx roster init",
]) {
  assert.ok(combined.includes(token), `Sprint source must include ${token}`);
}
for (const forbidden of ["Math.random(", "setTimeout(", "setInterval(", "COLOR.violet", "COLOR.cyan", "purple", "turquoise"]) {
  assert.equal(combined.includes(forbidden), false, `Sprint source must not include ${forbidden}`);
}
assert.ok(statSync(scorePath).size > 1_000_000, "Sprint score must contain rendered stereo audio");

console.log("Sprint structural checks passed (9.6s, five beats, five starters, clean palette, deterministic source)");
