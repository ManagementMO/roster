/**
 * Technically verify a rendered MP4 — without ffprobe.
 *
 * `ffmpeg` is not installed in this environment and the one bundled with
 * Playwright is compiled with almost every codec disabled, so this script uses
 * `@remotion/media-parser` instead: it parses the real container and reports
 * dimensions, frame rate, duration, codecs, and the audio stream. It then
 * DECODES the file end to end with `parseMedia`'s sample callbacks, so a
 * truncated or corrupt master fails here rather than in someone's timeline.
 *
 * Results are written into `src/qa/manifest.json` so the QA sheet prints
 * measured numbers rather than intended ones.
 */
import fs from "node:fs";
import path from "node:path";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import { OUT, ROOT } from "./lib/render.mjs";

const target = process.argv[2] ?? path.join(OUT, "roster-launch-premium-master.mp4");
if (!fs.existsSync(target)) {
  process.stderr.write(`probe  missing file: ${target}\n`);
  process.exit(1);
}

const stat = fs.statSync(target);

let videoSamples = 0;
let audioSamples = 0;
let firstVideoTimestamp = null;
let lastVideoTimestamp = 0;

const result = await parseMedia({
  src: target,
  reader: nodeReader,
  acknowledgeRemotionLicense: true,
  fields: {
    dimensions: true,
    durationInSeconds: true,
    slowFps: true,
    videoCodec: true,
    audioCodec: true,
    container: true,
    tracks: true,
    numberOfAudioChannels: true,
    sampleRate: true,
    isHdr: true,
  },
  onVideoTrack: () => (sample) => {
    videoSamples++;
    if (firstVideoTimestamp === null) firstVideoTimestamp = sample.timestamp;
    lastVideoTimestamp = Math.max(lastVideoTimestamp, sample.timestamp);
  },
  onAudioTrack: () => () => {
    audioSamples++;
  },
});

const videoTrack = result.tracks.find((t) => t.type === "video");
const audioTrack = result.tracks.find((t) => t.type === "audio");

const report = {
  file: path.relative(ROOT, target),
  container: result.container,
  size: `${(stat.size / 1024 / 1024).toFixed(2)} MB`,
  resolution: `${result.dimensions?.width}×${result.dimensions?.height}`,
  fps: result.slowFps ? result.slowFps.toFixed(3) : "unknown",
  duration: `${result.durationInSeconds?.toFixed(3)} s`,
  videoCodec: result.videoCodec ?? "unknown",
  videoCodecString: videoTrack?.codec ?? "unknown",
  audioCodec: result.audioCodec ?? "none",
  audioCodecString: audioTrack?.codec ?? "none",
  audioChannels: String(result.numberOfAudioChannels ?? 0),
  audioSampleRate: result.sampleRate ? `${result.sampleRate} Hz` : "none",
  hdr: String(result.isHdr),
  decodedVideoSamples: String(videoSamples),
  decodedAudioSamples: String(audioSamples),
  lastVideoTimestamp: `${(lastVideoTimestamp / 1_000_000).toFixed(3)} s`,
};

for (const [k, v] of Object.entries(report)) {
  process.stdout.write(`probe  ${k.padEnd(22)} ${v}\n`);
}

/** Hard checks — the reason this script exists rather than a printout. */
const failures = [];
if (result.dimensions?.width !== 1920 || result.dimensions?.height !== 1080) {
  failures.push(`expected 1920×1080, got ${report.resolution}`);
}
if (!result.slowFps || Math.abs(result.slowFps - 60) > 0.05) failures.push(`expected 60 fps, got ${report.fps}`);
if (!result.videoCodec?.startsWith("h264")) failures.push(`expected h264, got ${report.videoCodec}`);
if (result.audioCodec !== "aac") failures.push(`expected aac audio, got ${report.audioCodec}`);
if (audioSamples === 0) failures.push("no audio samples decoded");
if (videoSamples < 3400) failures.push(`decoded only ${videoSamples} video samples`);

const manifestPath = path.join(ROOT, "src", "qa", "manifest.json");
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
fs.writeFileSync(
  manifestPath,
  `${JSON.stringify({ ...previous, meta: { ...report, verified: failures.length === 0 ? "PASS" : "FAIL" } }, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const f of failures) process.stderr.write(`probe  FAIL  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`probe  PASS  decoded ${videoSamples} video + ${audioSamples} audio samples end to end\n`);
