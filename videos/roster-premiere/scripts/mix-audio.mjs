import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const audio = path.join(project, "assets/audio");
fs.mkdirSync(audio, {recursive: true});

function run(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-y", ...args], {cwd: project, encoding: "utf8", maxBuffer: 8e6});
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stderr;
}

// A small pitch-preserving tempo change locks the roughly 125 BPM source to a 128 BPM edit.
// The quiet final bar makes the held identity read as a deliberate musical ending.
run(["-i", ".media/audio/bgm/bgm_002.mp3", "-t", "30", "-af",
  "atempo=1.024,afade=t=in:st=0:d=0.035,afade=t=out:st=27.8:d=2.2,loudnorm=I=-18:TP=-2:LRA=7",
  "-ar", "48000", "-ac", "2", "assets/audio/music-bed.wav"]);

const cues = [
  {kind:"impact", at:0.05, gain:0.21, duration:0.85},
  ...[0.16,0.34,0.80,1.0,1.19,1.43,1.66,1.87,2.05,2.20,2.57].map(at=>({kind:"click",at,gain:0.10,duration:0.18})),
  ...[3.75,7.5,15,20.625,24.375].map(at=>({kind:"whoosh",at:at-0.30,gain:0.16,duration:0.63})),
  ...[4.53,4.95,5.29,5.54,5.73].map(at=>({kind:"impact",at,gain:0.13,duration:0.55})),
  ...[7.9,8.05,8.18,8.31,8.44,8.57,8.7,8.83,8.96].map(at=>({kind:"click",at,gain:0.09,duration:0.12})),
  ...[11.1,11.58,12.06,12.54,13.02,13.7].map(at=>({kind:"click",at,gain:0.14,duration:0.19})),
  {kind:"whoosh",at:16.2,gain:0.13,duration:0.9},
  {kind:"impact",at:17.79,gain:0.12,duration:0.7},
  {kind:"whoosh",at:18.2,gain:0.11,duration:0.85},
  {kind:"click",at:19.13,gain:0.15,duration:0.22},
  ...[21.525,21.935,22.345,22.775].map(at=>({kind:"click",at,gain:0.14,duration:0.20})),
  {kind:"whoosh",at:25.80,gain:0.17,duration:0.75},
  {kind:"impact",at:26.355,gain:0.22,duration:1.4},
];
const inputFiles = {click:".media/audio/sfx/sfx_001.mp3",whoosh:".media/audio/sfx/sfx_002.mp3",impact:".media/audio/sfx/sfx_003.mp3"};
const args = ["-i", "assets/audio/music-bed.wav"];
const filter = ["[0:a]anull[music]"];
for (const [i,cue] of cues.entries()) {
  args.push("-i", inputFiles[cue.kind]);
  const delay = Math.round(cue.at*1000);
  filter.push(`[${i+1}:a]atrim=0:${cue.duration},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0.02,cue.duration-0.12)}:d=0.12,volume=${cue.gain},adelay=${delay}|${delay}[s${i}]`);
}
filter.push(`[music]${cues.map((_,i)=>`[s${i}]`).join("")}amix=inputs=${cues.length+1}:normalize=0:duration=first,alimiter=limit=0.88:level=0[mix]`);
run([...args,"-filter_complex",filter.join(";"),"-map","[mix]","-t","30","-ar","48000","-c:a","pcm_s24le","assets/audio/premiere-mix.wav"]);

// Two-pass EBU loudness normalization: measured levels, no guessing from wave amplitude.
const measurement = run(["-i","assets/audio/premiere-mix.wav","-af","loudnorm=I=-15:TP=-1.5:LRA=8:print_format=json","-f","null","-"]);
const measurementJson = measurement.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
if (!measurementJson) throw new Error("FFmpeg did not return loudness measurements");
const measured = JSON.parse(measurementJson);
const normalization = `loudnorm=I=-15:TP=-1.5:LRA=8:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`;
const finalReport = run(["-i","assets/audio/premiere-mix.wav","-af",normalization,"-t","30","-ar","48000","-ac","2","-c:a","pcm_s24le","assets/audio/premiere-score.wav"]);
fs.mkdirSync(path.join(project, "verification"), {recursive: true});
fs.writeFileSync(path.join(project, "verification/audio-normalization.json"), JSON.stringify({target:{integratedLufs:-15,truePeakDbtp:-1.5},measuredBefore:measured,final:JSON.parse(finalReport.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? "{}"),cues},null,2)+"\n");
fs.writeFileSync(path.join(project, "audio_meta.json"), JSON.stringify({bgm:{path:"assets/audio/premiere-score.wav",volume:1},voices:[],sfx:[],duration:30,note:"Music and effects are pre-mixed to a measured 30-second master."},null,2)+"\n");
console.log(`Mixed ${cues.length} effects with the licensed music bed; normalized 30s stereo score at 48 kHz.`);
