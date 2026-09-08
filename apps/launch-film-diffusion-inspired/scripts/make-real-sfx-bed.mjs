import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "assets", "roster-launch-sfx.wav");
const DURATION = 12.4;

const assets = {
  impact: path.join(ROOT, "assets", "sfx", "mixkit", "fast-impact-blow.mp3"),
  sweep: path.join(ROOT, "assets", "sfx", "mixkit", "futuristic-cinematic-sweep.mp3"),
  digitalSweep: path.join(ROOT, "assets", "sfx", "mixkit", "digital-sweep.mp3"),
  typing: path.join(ROOT, "assets", "sfx", "mixkit", "laptop-typing.mp3"),
  click: path.join(ROOT, "assets", "sfx", "mixkit", "interface-device-click.mp3"),
  confirm: path.join(ROOT, "assets", "sfx", "mixkit", "high-tech-confirm.mp3"),
  touch: path.join(ROOT, "assets", "sfx", "mixkit", "hi-tech-touch.mp3"),
  movieImpact: path.join(ROOT, "assets", "sfx", "mixkit", "movie-impact-transition.mp3"),
};

// Real recordings are placed against the existing visual cue map. The source
// trims stay short so tactile detail punctuates the music instead of masking it.
const events = [
  { asset: "impact", at: 0.02, duration: 0.62, volume: 0.42 },
  { asset: "digitalSweep", at: 0.72, duration: 0.58, volume: 0.18 },
  { asset: "typing", at: 1.34, duration: 2.38, volume: 0.18, fadeOut: 0.24 },
  { asset: "click", at: 1.58, duration: 0.16, volume: 0.07 },
  { asset: "click", at: 1.94, duration: 0.16, volume: 0.06 },
  { asset: "click", at: 2.30, duration: 0.16, volume: 0.07 },
  { asset: "click", at: 2.66, duration: 0.16, volume: 0.06 },
  { asset: "click", at: 3.02, duration: 0.16, volume: 0.07 },
  { asset: "click", at: 3.38, duration: 0.16, volume: 0.05 },
  { asset: "sweep", at: 3.76, duration: 0.74, volume: 0.22 },
  { asset: "confirm", at: 4.62, duration: 0.42, volume: 0.24 },
  { asset: "confirm", at: 5.00, duration: 0.42, volume: 0.22 },
  { asset: "confirm", at: 5.38, duration: 0.42, volume: 0.27 },
  { asset: "confirm", at: 5.76, duration: 0.42, volume: 0.22 },
  { asset: "confirm", at: 6.14, duration: 0.42, volume: 0.24 },
  { asset: "digitalSweep", at: 6.82, duration: 0.58, volume: 0.20 },
  { asset: "touch", at: 7.54, duration: 0.30, volume: 0.12 },
  { asset: "touch", at: 7.78, duration: 0.30, volume: 0.10 },
  { asset: "touch", at: 8.02, duration: 0.30, volume: 0.10 },
  { asset: "confirm", at: 8.58, duration: 0.46, volume: 0.24 },
  { asset: "sweep", at: 9.02, duration: 0.60, volume: 0.18 },
  { asset: "impact", at: 9.36, duration: 0.60, volume: 0.36 },
  { asset: "click", at: 9.62, duration: 0.16, volume: 0.07 },
  { asset: "click", at: 9.80, duration: 0.16, volume: 0.07 },
  { asset: "click", at: 9.98, duration: 0.16, volume: 0.07 },
  { asset: "click", at: 10.16, duration: 0.16, volume: 0.07 },
  { asset: "digitalSweep", at: 10.34, duration: 0.52, volume: 0.18 },
  { asset: "movieImpact", at: 10.62, duration: 0.78, volume: 0.22 },
  { asset: "confirm", at: 10.82, duration: 0.42, volume: 0.17 },
  { asset: "confirm", at: 11.00, duration: 0.42, volume: 0.18 },
  { asset: "confirm", at: 11.18, duration: 0.42, volume: 0.19 },
  { asset: "confirm", at: 11.36, duration: 0.42, volume: 0.20 },
  { asset: "confirm", at: 11.54, duration: 0.42, volume: 0.22 },
  { asset: "sweep", at: 11.72, duration: 0.38, volume: 0.14 },
  { asset: "impact", at: 11.94, duration: 0.46, volume: 0.34 },
  { asset: "confirm", at: 12.08, duration: 0.30, volume: 0.13 },
  { asset: "confirm", at: 12.18, duration: 0.22, volume: 0.11 },
];

const inputFiles = [...new Set(events.map((event) => assets[event.asset]))];
const inputArgs = inputFiles.flatMap((file) => ["-i", file]);
const filters = events.map((event, index) => {
  const inputIndex = inputFiles.indexOf(assets[event.asset]);
  const fadeOut = event.fadeOut ?? Math.min(0.1, event.duration * 0.3);
  const fadeIn = Math.min(0.012, event.duration * 0.08);
  const fadeOutStart = Math.max(0, event.duration - fadeOut);
  const delay = Math.round(event.at * 1000);
  return `[${inputIndex}:a]atrim=start=0:duration=${event.duration},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut},volume=${event.volume},adelay=${delay}|${delay}[s${index}]`;
});
const labels = events.map((_, index) => `[s${index}]`).join("");
filters.push(`${labels}amix=inputs=${events.length}:duration=longest:dropout_transition=0,atrim=0:${DURATION},alimiter=limit=0.95[out]`);

const result = spawnSync("ffmpeg", [
  "-y",
  ...inputArgs,
  "-filter_complex", filters.join(";"),
  "-map", "[out]",
  "-t", String(DURATION),
  "-ar", "48000",
  "-ac", "2",
  OUTPUT,
], { cwd: ROOT, stdio: "inherit" });

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Wrote ${OUTPUT} (real Mixkit SFX bed, ${DURATION}s)`);
