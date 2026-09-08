import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(APP_ROOT, file), "utf8");
const design = read("src/real/design.js");
const source = read("src/roster-film-real.jsx");
const scenes = read("src/real/scenes.js");
const drawing = read("src/real/drawing.js");
const requiredAssets = ["github.svg", "playwright.svg", "linear.svg", "postgresql.svg", "claude.svg", "roster-logo.png", "roster.png", "roster-clean.png"];
const requiredOrbitMarks = ["asana", "jira", "miro", "airtable"];
const forbiddenOrbitMarks = ["docker", "npm", "openai", "claude"];

const duration = Number(design.match(/DURATION = ([0-9.]+)/)?.[1]);
if (!Number.isFinite(duration) || duration > 15 || duration < 8) throw new Error(`Real asset duration must be 8–15s; got ${duration}`);
if (!source.includes('scene="roster-launch-real"')) throw new Error("Real composition scene id is missing");
if (!source.includes("volume={0.82}")) throw new Error("Audio must use a positive safe linear mix gain");
for (const token of ["npx roster init", "roster sync --five", "YOUR AGENT HAS", "ROSTER RANKS THE ROUTE.", "THE BEST TOOL GOES FIRST.", "LOCAL-FIRST"]) {
  if (!source.includes(token) && !scenes.includes(token) && !design.includes(token)) throw new Error(`Missing narrative token: ${token}`);
}
for (const token of ["drawTerminalWindow", "drawBrandMark", "BRAND_PATH_CACHE", "drawToolObject", "drawRosterMark"]) {
  if (!drawing.includes(token) && !scenes.includes(token)) throw new Error(`Missing real-asset system token: ${token}`);
}
for (const mark of requiredOrbitMarks) {
  if (!design.includes(`{ id: "${mark}"`)) throw new Error(`Missing agent-facing orbit mark: ${mark}`);
  const extension = mark === "miro" ? "png" : "svg";
  if (!existsSync(path.join(APP_ROOT, "assets", "brands", `${mark}.${extension}`))) throw new Error(`Missing orbit asset: ${mark}.${extension}`);
}
for (const mark of forbiddenOrbitMarks) {
  if (design.includes(`{ id: "${mark}"`)) throw new Error(`Runtime or package mark must not appear in the final orbit: ${mark}`);
}
const combined = `${source}\n${scenes}\n${drawing}`;
if (combined.includes("Math.random(") || combined.includes("Date.now(") || combined.includes("setInterval(") || combined.includes("setTimeout(")) {
  throw new Error("Real asset motion must be deterministic and playhead-driven");
}
for (const asset of requiredAssets) {
  if (!existsSync(path.join(APP_ROOT, "assets", "brands", asset))) throw new Error(`Missing local brand asset: ${asset}`);
}
if (!existsSync(path.join(APP_ROOT, "assets", "brands", "ASSET-SOURCES.md"))) throw new Error("Brand asset provenance file is missing");
console.log(`Real asset checks passed (${duration}s, ${requiredAssets.length} local marks, deterministic terminal transcript)`);
