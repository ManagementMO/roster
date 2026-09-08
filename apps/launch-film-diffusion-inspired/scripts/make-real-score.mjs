import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(ROOT, "assets", "roster-launch-real-score.wav");
const sfx = path.join(ROOT, "assets", "roster-launch-sfx.wav");
const music = path.join(ROOT, "assets", "music", "mixkit-techno-fest-vibes.mp3");
const cues = spawnSync(process.execPath, [path.join(ROOT, "scripts", "make-real-sfx-bed.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});
if (cues.status !== 0) process.exit(cues.status ?? 1);

const mix = spawnSync("ffmpeg", [
  "-y",
  "-i", music,
  "-i", sfx,
  "-filter_complex",
  "[0:a]atrim=0:12.4,asetpts=N/SR/TB,afade=t=in:st=0:d=0.04,afade=t=out:st=12.06:d=0.34,volume=0.72[music];[1:a]volume=0.74[sfx];[music][sfx]amix=inputs=2:duration=first:dropout_transition=0,volume=1.9,alimiter=limit=0.95[out]",
  "-map", "[out]",
  "-t", "12.4",
  "-ar", "48000",
  "-ac", "2",
  output,
], { cwd: ROOT, stdio: "inherit" });
if (mix.status !== 0) process.exit(mix.status ?? 1);
console.log(`Wrote ${output} (12.4s Techno Fest Vibes bed + real Mixkit launch SFX)`);
