import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAPI = process.env.DAPI
  ?? (existsSync("/usr/local/bin/dapi")
    ? "/usr/local/bin/dapi"
    : "/Applications/Diffusion Studio.app/Contents/Resources/cli/bin/dapi");
const SOURCE = path.join(APP_ROOT, "src", "roster-film-inspired.jsx");
const SCENES = path.join(APP_ROOT, "src", "inspired", "scenes.js");
const DESIGN = path.join(APP_ROOT, "src", "inspired", "design.js");
const OUTPUT_ROOT = path.join(APP_ROOT, "out");
const OUT = path.join(OUTPUT_ROOT, "inspired");
const TIMES = ["0", "0.3", "0.7", "1.15", "1.45", "1.85", "2.3", "2.9", "3.35", "3.65", "4.2", "4.62", "5.05", "5.55", "6.15", "6.55", "7.05", "7.65", "8.1", "8.55", "9.0", "9.4", "9.85", "10.45", "11.0", "11.45"];

function run(args, options = {}) {
  const result = spawnSync(DAPI, args, { cwd: APP_ROOT, stdio: "inherit", env: process.env, ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(args) {
  return execFileSync(DAPI, args, { cwd: APP_ROOT, encoding: "utf8" }).trim();
}

function ensureOut() {
  mkdirSync(OUT, { recursive: true });
}

function reset(directory) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

function openProject() {
  run(["open", "--background", APP_ROOT]);
}

function mount() {
  openProject();
  run(["mount", path.relative(APP_ROOT, SOURCE)]);
}

function activeSceneId() {
  const context = JSON.parse(capture(["context"]));
  if (!context.activeSceneId) throw new Error("Diffusion Studio did not report an active scene");
  return String(context.activeSceneId);
}

function render(kind) {
  ensureOut();
  mount();
  const id = activeSceneId();
  const config = kind === "preview"
    ? { format: "mp4", video: { codec: "avc", resolution: 720, bitrate: 6000000, fps: 30 }, audio: { enabled: true, codec: "aac", bitrate: 128000, sampleRate: 48000, numberOfChannels: 2 } }
    : { format: "mp4", video: { codec: "avc", resolution: 1080, bitrate: 18000000, fps: 60 }, audio: { enabled: true, codec: "aac", bitrate: 192000, sampleRate: 48000, numberOfChannels: 2 } };
  const output = path.join(OUT, kind === "preview" ? "roster-launch-inspired-preview.mp4" : "roster-launch-inspired-master.mp4");
  run(["node", "render", id, "-o", output, "--json", JSON.stringify(config)]);
  console.log(`Rendered ${output}`);
}

function capturePoster() {
  ensureOut();
  const dir = path.join(OUT, "poster-capture");
  reset(dir);
  const master = path.join(OUT, "roster-launch-inspired-master.mp4");
  if (existsSync(master)) run(["media", "grab", master, "-t", "11.25", "-q", "fullres", "-S", "-o", dir]);
  else {
    mount();
    run(["node", "capture", activeSceneId(), "-t", "11.25", "-S", "-o", dir]);
  }
  const frame = readdirSync(dir).find((file) => file.endsWith(".png"));
  if (!frame) throw new Error("Poster capture did not produce a PNG");
  const output = path.join(OUT, "roster-launch-inspired-poster.png");
  copyFileSync(path.join(dir, frame), output);
  console.log(`Rendered ${output}`);
}

function captureContact() {
  ensureOut();
  mount();
  const dir = path.join(OUT, "contact-capture");
  reset(dir);
  run(["node", "capture", activeSceneId(), "--per-sheet", "12", "-t", ...TIMES, "-o", dir]);
  const sheets = readdirSync(dir).filter((file) => file.endsWith(".png")).sort().map((file) => path.join(dir, file));
  if (!sheets.length) throw new Error("Contact capture did not produce PNG sheets");
  const output = path.join(OUT, "roster-launch-inspired-contact-sheet.png");
  const result = spawnSync("magick", [...sheets.flatMap((sheet) => [sheet, "-resize", "960x540"]), "+smush", "16", output], { cwd: APP_ROOT, stdio: "inherit" });
  if (result.status !== 0) throw new Error("magick failed while composing the contact sheet");
  console.log(`Rendered ${output}`);
}

function captureStills() {
  ensureOut();
  mount();
  const dir = path.join(OUT, "qa-stills");
  reset(dir);
  run(["node", "capture", activeSceneId(), "-S", "-t", ...TIMES, "-o", dir]);
  console.log(`Rendered still QA frames in ${dir}`);
}

function validate() {
  const source = readFileSync(SOURCE, "utf8");
  const scenes = readFileSync(SCENES, "utf8");
  const design = readFileSync(DESIGN, "utf8");
  const combined = `${source}\n${scenes}\n${design}`;
  const required = ["roster-launch-inspired", "useTicker", "createEffect", "drawFilm", "<surface", "<audio", "200", "verify checkout flow", "Playwright", "The right tool. Right now."];
  const missing = required.filter((token) => !combined.includes(token));
  if (missing.length) throw new Error(`Inspired source validation failed; missing: ${missing.join(", ")}`);
  if (combined.includes("Math.random(") || combined.includes("Date.now(") || combined.includes("setTimeout(") || combined.includes("setInterval(")) throw new Error("Inspired motion must be deterministic and playhead-driven");
  const duration = Number(design.match(/DURATION = ([0-9.]+)/)?.[1]);
  if (!Number.isFinite(duration) || duration < 8 || duration > 15) throw new Error(`Inspired duration must be 8–15s; got ${duration}`);
  if (!existsSync(path.join(APP_ROOT, "assets", "brands", "roster-logo.png"))) throw new Error("Supplied Roster logo asset is missing");
  if (!existsSync(path.join(APP_ROOT, "assets", "roster-launch-inspired-score.wav"))) throw new Error("Inspired score is missing; run pnpm sound");
  openProject();
  run(["mount", path.relative(APP_ROOT, SOURCE)]);
  console.log(`Inspired DAPI mount validated (scene ${activeSceneId()}; ${duration}s; preview 30fps; master 60fps)`);
}

const [command, argument] = process.argv.slice(2);
switch (command) {
  case "open": openProject(); break;
  case "mount": mount(); console.log(`Mounted scene ${activeSceneId()}`); break;
  case "check": validate(); break;
  case "render":
    if (argument !== "preview" && argument !== "master") throw new Error("Use render preview or render master");
    render(argument);
    break;
  case "poster": capturePoster(); break;
  case "contact": captureContact(); break;
  case "stills": captureStills(); break;
  default:
    console.error("Usage: node scripts/editor-inspired.mjs open|mount|check|render preview|render master|poster|contact|stills");
    process.exit(1);
}
