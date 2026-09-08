import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const source = read("src/roster-film-inspired.jsx");
const scenes = read("src/inspired/scenes.js");
const design = read("src/inspired/design.js");
const drawing = read("src/inspired/drawing.js");
const combined = `${source}\n${scenes}\n${design}\n${drawing}`;
const duration = Number(design.match(/DURATION = ([0-9.]+)/)?.[1]);
if (!Number.isFinite(duration) || duration < 8 || duration > 15) throw new Error(`Duration must be 8–15s; got ${duration}`);
for (const token of ["roster-launch-inspired", "useTicker", "createEffect", "drawFilm", "<surface", "<audio", "200", "verify checkout flow", "Playwright selected", "The right tool. Right now."]) {
  if (!combined.includes(token)) throw new Error(`Missing required narrative/system token: ${token}`);
}
if (combined.includes("Math.random(") || combined.includes("Date.now(") || combined.includes("setTimeout(") || combined.includes("setInterval(")) throw new Error("Motion must be deterministic and playhead-driven");
for (const asset of ["roster-logo.png", "github.svg", "slack.svg", "notion.svg", "figma.svg", "playwright.svg"]) {
  if (!existsSync(path.join(ROOT, "assets", "brands", asset))) throw new Error(`Missing local asset: ${asset}`);
}
if (!existsSync(path.join(ROOT, "assets", "roster-launch-inspired-score.wav"))) throw new Error("Missing inspired score; run pnpm sound");
console.log(`Inspired source checks passed (${duration}s, deterministic motion, local marks and score)`);
