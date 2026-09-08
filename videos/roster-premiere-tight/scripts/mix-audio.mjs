import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function run(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-y", ...args], { cwd:project, encoding:"utf8", maxBuffer:8e6 });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stderr;
}

// Original pop-rock arrangement using CC0 recorded instruments and original effects.
// Leave extra PCM headroom for AAC reconstruction peaks in the delivered video.
const source = "assets/audio/original-score-float.wav";
const report = run(["-i",source,"-af","loudnorm=I=-13:TP=-2:LRA=7:print_format=json","-f","null","-"]);
const parse = (text) => JSON.parse(text.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? "{}");
const measured = parse(report);
if (!measured.input_i) throw new Error("No FFmpeg loudness measurement");
const filter = `loudnorm=I=-13:TP=-2:LRA=7:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`;
const finalReport = run(["-i",source,"-af",filter,"-t","15","-ar","48000","-ac","2","-c:a","pcm_s24le","assets/audio/premiere-score.wav"]);
// A new asset URL makes Studio load the revised score instead of a cached decode.
fs.copyFileSync(path.join(project,"assets/audio/premiere-score.wav"),path.join(project,"assets/audio/full-send-score.wav"));
fs.copyFileSync(path.join(project,"assets/audio/premiere-score.wav"),path.join(project,"assets/audio/full-send-final.wav"));
fs.mkdirSync(path.join(project,"verification"),{recursive:true});
fs.writeFileSync(path.join(project,"verification/audio-normalization.json"),JSON.stringify({target:{integratedLufs:-13,truePeakDbtp:-2},measuredBefore:measured,final:parse(finalReport)},null,2)+"\n");
fs.writeFileSync(path.join(project,"audio_meta.json"),JSON.stringify({bgm:{path:"assets/audio/full-send-final.wav",volume:1},voices:[],sfx:[],duration:15,note:"Original Full Send pop-rock arrangement, with a dry Playwright contact at 8.20s and a restrained guitar dip; 15-second 48 kHz stereo master."},null,2)+"\n");
run(["-i","assets/audio/premiere-score.wav","-c:a","aac","-b:a","256k","-movflags","+faststart","assets/audio/five-in-motion.m4a"]);
fs.copyFileSync(path.join(project,"assets/audio/five-in-motion.m4a"),path.join(project,"assets/audio/five-in-motion-full-send.m4a"));
console.log("Mastered Full Send; saved 24-bit WAV, AAC listening copy and measurements.");
