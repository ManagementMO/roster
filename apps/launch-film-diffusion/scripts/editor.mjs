import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAPI = process.env.DAPI
  ?? (existsSync("/usr/local/bin/dapi")
    ? "/usr/local/bin/dapi"
    : "/Applications/Diffusion Studio.app/Contents/Resources/cli/bin/dapi");
const OUTPUT_ROOT = path.join(APP_ROOT, "out");
const OUT = path.join(OUTPUT_ROOT, "real");
const SOURCE = path.join(APP_ROOT, "src", "roster-film-real.jsx");
const SCENES = path.join(APP_ROOT, "src", "real", "scenes.js");
const TIMES = [
  "0", "0.25", "0.55", "0.9", "1.2", "1.5", "1.95", "2.35", "2.75", "3.1", "3.5", "3.9", "4.3",
  "4.7", "5.05", "5.45", "5.85", "6.25", "6.65", "7.0", "7.35", "7.7", "8.05", "8.4", "8.75", "9.1",
  "9.45", "9.8", "10.15", "10.5", "10.85", "11.2", "11.55", "11.9", "12.2", "12.4",
];

function ensureOut() {
  mkdirSync(OUT, { recursive: true });
}

function resetGeneratedDirectory(directory) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

function run(args, options = {}) {
  const result = spawnSync(DAPI, args, {
    cwd: APP_ROOT,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(args) {
  return execFileSync(DAPI, args, { cwd: APP_ROOT, encoding: "utf8" }).trim();
}

function openProject() {
  run(["open", "--background", APP_ROOT]);
}

function mountProject() {
  openProject();
  run(["mount", path.relative(APP_ROOT, SOURCE)]);
}

function activeSceneId() {
  const context = JSON.parse(capture(["context"]));
  if (!context.activeSceneId) throw new Error("Diffusion Studio did not report an active scene");
  return String(context.activeSceneId);
}

function captureStartSeconds(fileName) {
  const timecode = fileName.split("-")[0];
  const match = timecode.match(/^(?:(\d+)s)?(?:(\d+)f)?$/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1] ?? 0) + Number(match[2] ?? 0) / 30;
}

function render(kind) {
  ensureOut();
  mountProject();
  const id = activeSceneId();
  const config = kind === "preview"
    ? {
        format: "mp4",
        video: { codec: "avc", resolution: 720, bitrate: 6000000, fps: 30 },
        audio: { enabled: true, codec: "aac", bitrate: 128000, sampleRate: 48000, numberOfChannels: 2 },
      }
    : {
        format: "mp4",
        video: { codec: "avc", resolution: 1080, bitrate: 18000000, fps: 60 },
        audio: { enabled: true, codec: "aac", bitrate: 192000, sampleRate: 48000, numberOfChannels: 2 },
      };
  const output = path.join(OUT, kind === "preview" ? "roster-launch-real-preview.mp4" : "roster-launch-real-master.mp4");
  run(["node", "render", id, "-o", output, "--json", JSON.stringify(config)]);
  console.log(`Rendered ${output}`);
}

function capturePoster() {
  ensureOut();
  const dir = path.join(OUT, "poster-capture");
  resetGeneratedDirectory(dir);
  const master = path.join(OUT, "roster-launch-real-master.mp4");
  if (existsSync(master)) {
    run(["media", "grab", master, "-t", "11.3", "-q", "fullres", "-S", "-o", dir]);
  } else {
    mountProject();
    const id = activeSceneId();
    run(["node", "capture", id, "-t", "10.1", "-S", "-o", dir]);
  }
  const frame = readdirSync(dir).find((file) => file.endsWith(".png"));
  if (!frame) throw new Error("Poster capture did not produce a PNG");
  const output = path.join(OUT, "roster-launch-real-poster.png");
  copyFileSync(path.join(dir, frame), output);
  console.log(`Rendered ${output}`);
}

function captureContact() {
  ensureOut();
  mountProject();
  const id = activeSceneId();
  const dir = path.join(OUT, "contact-capture");
  resetGeneratedDirectory(dir);
  run(["node", "capture", id, "--per-sheet", "12", "-t", ...TIMES, "-o", dir]);
  const sheets = readdirSync(dir)
    .filter((file) => file.endsWith(".png"))
    .sort((left, right) => captureStartSeconds(left) - captureStartSeconds(right))
    .map((file) => path.join(dir, file));
  if (sheets.length === 0) throw new Error("Contact capture did not produce PNG sheets");
  const output = path.join(OUT, "roster-launch-real-contact-sheet.png");
  const montage = spawnSync("magick", [...sheets.flatMap((sheet) => [sheet, "-resize", "960x540"]), "+smush", "16", output], {
    cwd: APP_ROOT,
    stdio: "inherit",
  });
  if (montage.status !== 0) throw new Error("montage failed while composing the contact sheet");
  console.log(`Rendered ${output}`);
}

function captureStills() {
  ensureOut();
  mountProject();
  const id = activeSceneId();
  const dir = path.join(OUT, "qa-stills");
  resetGeneratedDirectory(dir);
  run(["node", "capture", id, "-S", "-t", ...TIMES, "-o", dir]);
  console.log(`Rendered still QA frames in ${dir}`);
}

function captureBeforeAfter() {
  ensureOut();
  const beforeCandidates = [
    path.join(OUTPUT_ROOT, "spectacle", "roster-launch-spectacle-poster.png"),
    path.join(OUTPUT_ROOT, "roster-launch-diffusion-poster.png"),
  ];
  const before = beforeCandidates.find((candidate) => existsSync(candidate));
  const after = path.join(OUT, "roster-launch-real-poster.png");
  const output = path.join(OUT, "roster-launch-real-before-after.png");
  if (!before) throw new Error(`Before poster is missing; checked: ${beforeCandidates.join(", ")}`);
  if (!existsSync(after)) throw new Error(`After poster is missing: ${after}; run poster first`);
  const montage = spawnSync("magick", [before, "-resize", "960x540", after, "-resize", "960x540", "+append", output], {
    cwd: APP_ROOT,
    stdio: "inherit",
  });
  if (montage.status !== 0) throw new Error("magick failed while composing the before/after comparison");
  console.log(`Rendered ${output}`);
}

function validate() {
  execFileSync(process.execPath, [path.join(APP_ROOT, "scripts", "check-real.mjs")], { cwd: APP_ROOT, stdio: "inherit" });
  const source = readFileSync(SOURCE, "utf8");
  const scenes = readFileSync(SCENES, "utf8");
  const combined = `${source}\n${scenes}`;
  const required = ["roster-launch-real", "useTicker", "createEffect", "drawFilm", "<surface", "<audio", "YOUR AGENT HAS", "POLLUTING YOUR CONTEXT", "ROSTER RANKS THE ROUTE.", "verify checkout flow", "ONLY THE ONES THAT MATTER"];
  const missing = required.filter((token) => !combined.includes(token));
  if (missing.length > 0) throw new Error(`Source validation failed; missing: ${missing.join(", ")}`);
  if (combined.includes("Math.random(") || combined.includes("Date.now(")) throw new Error("Source validation failed; motion must be deterministic");
  openProject();
  run(["mount", path.relative(APP_ROOT, SOURCE)]);
  const context = JSON.parse(capture(["context"]));
  if (!context.activeSceneId) throw new Error("Mount validation failed; no active scene");
  console.log(`Diffusion Studio real-asset mount validated (scene ${context.activeSceneId}; 12.4s, preview 30fps, master 60fps)`);
}

const [command, argument] = process.argv.slice(2);
switch (command) {
  case "open":
    openProject();
    break;
  case "mount":
    mountProject();
    console.log(`Mounted scene ${activeSceneId()}`);
    break;
  case "check":
    validate();
    break;
  case "render":
    if (argument !== "preview" && argument !== "master") throw new Error("Use render preview or render master");
    render(argument);
    break;
  case "poster":
    capturePoster();
    break;
  case "contact":
    captureContact();
    break;
  case "stills":
    captureStills();
    break;
  case "before-after":
    captureBeforeAfter();
    break;
  default:
    console.error("Usage: node scripts/editor.mjs open|mount|check|render preview|render master|poster|contact|stills|before-after");
    process.exit(1);
}
