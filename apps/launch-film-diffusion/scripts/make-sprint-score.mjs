import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = process.env.SCORE_OUTPUT ?? path.join(ROOT, "assets", "roster-launch-sprint-score.wav");
const SAMPLE_RATE = 48000;
const DURATION = Number(process.env.SCORE_DURATION ?? "9.6");
const REAL_PROFILE = process.env.SCORE_PROFILE === "real";
const OUTPUT_GAIN = Number(process.env.SCORE_GAIN ?? "1");
const TOTAL = Math.floor(SAMPLE_RATE * DURATION);
const left = new Float32Array(TOTAL);
const right = new Float32Array(TOTAL);

const clamp = (value, min = -1, max = 1) => Math.max(min, Math.min(max, value));
const indexAt = (seconds) => Math.max(0, Math.min(TOTAL, Math.floor(seconds * SAMPLE_RATE)));
let seed = 0x52a42d11;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 * 2 - 1;
};

function add(index, sample, pan = 0, width = 0) {
  if (index < 0 || index >= TOTAL) return;
  const p = clamp(pan);
  left[index] += sample * (0.76 - p * 0.26) + sample * width * 0.1;
  right[index] += sample * (0.76 + p * 0.26) - sample * width * 0.1;
}

function kick(start, gain = 0.58, duration = 0.34) {
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  let phase = 0;
  for (let index = begin; index < end; index += 1) {
    const t = (index - begin) / SAMPLE_RATE;
    const frequency = 43 + 132 * Math.exp(-t * 27);
    phase += Math.PI * 2 * frequency / SAMPLE_RATE;
    const body = Math.sin(phase) * Math.exp(-t * 11);
    const click = t < 0.014 ? noise() * (1 - t / 0.014) * 0.2 : 0;
    add(index, Math.tanh((body + click) * 1.7) * gain);
  }
}

function bass(start, frequency, gain = 0.18, duration = 0.28) {
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  for (let index = begin; index < end; index += 1) {
    const t = (index - begin) / SAMPLE_RATE;
    const envelope = Math.min(1, t / 0.006) * Math.exp(-t * 8.5);
    const phase = Math.PI * 2 * frequency * t;
    const sample = Math.sin(phase) * 0.82 + Math.sin(phase * 2) * 0.14;
    add(index, sample * envelope * gain, 0, 0.08);
  }
}

function pluck(start, frequency, gain = 0.11, pan = 0, duration = 0.42) {
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  for (let index = begin; index < end; index += 1) {
    const t = (index - begin) / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.004);
    const envelope = attack * Math.exp(-t * 8.8);
    const phase = Math.PI * 2 * frequency * t;
    const sample = Math.sin(phase) * 0.58
      + Math.sin(phase * 2.01 + 0.3) * 0.23
      + Math.sin(phase * 3.98 + 0.8) * 0.09;
    add(index, sample * envelope * gain, pan, 0.38);
  }
}

function tick(start, gain = 0.07, pan = 0) {
  const duration = 0.08;
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  let low = 0;
  for (let index = begin; index < end; index += 1) {
    const t = (index - begin) / SAMPLE_RATE;
    const raw = noise();
    low += (raw - low) * 0.05;
    add(index, (raw - low) * Math.exp(-t * 58) * gain, pan, 0.84);
  }
}

function whoosh(start, duration, gain = 0.09, panFrom = 0.8, panTo = -0.8) {
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  let low = 0;
  let slower = 0;
  for (let index = begin; index < end; index += 1) {
    const t = (index - begin) / SAMPLE_RATE;
    const progress = t / duration;
    const raw = noise();
    low += (raw - low) * (0.025 + progress * 0.13);
    slower += (low - slower) * 0.018;
    const envelope = Math.sin(Math.PI * progress) ** 1.7;
    add(index, (low - slower) * envelope * gain, panFrom + (panTo - panFrom) * progress, 0.92);
  }
}

function impact(start, root, gain = 0.52) {
  kick(start, gain);
  bass(start, root, gain * 0.32, 0.44);
  pluck(start + 0.008, root * 4, gain * 0.16, -0.28, 0.62);
  pluck(start + 0.022, root * 6, gain * 0.11, 0.34, 0.5);
}

function vacuum(start, duration = 0.34) {
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  let phase = 0;
  for (let index = begin; index < end; index += 1) {
    const t = (index - begin) / SAMPLE_RATE;
    const progress = t / duration;
    const frequency = 180 - progress * 138;
    phase += Math.PI * 2 * frequency / SAMPLE_RATE;
    const envelope = progress ** 2 * Math.min(1, (duration - t) / 0.025);
    add(index, Math.sin(phase) * envelope * 0.1, 0, 0.44);
  }
}

// 150 BPM. Short, tactile phrases leave clean air around the visual impacts.
if (!REAL_PROFILE) {
impact(0.02, 55, 0.72);
[0.34, 0.46, 0.58, 0.7, 0.82].forEach((time, index) => {
  pluck(time, [440, 554.37, 659.25, 880, 987.77][index], 0.09, -0.7 + index * 0.35, 0.28);
});
whoosh(0.94, 0.48, 0.12);
impact(1.28, 49, 0.58);

for (let time = 1.6, step = 0; time < 3; time += 0.2, step += 1) {
  tick(time, step % 2 === 0 ? 0.065 : 0.038, step % 2 === 0 ? -0.5 : 0.5);
  if (step % 2 === 0) bass(time, step % 4 === 0 ? 49 : 55, 0.11, 0.2);
}
pluck(2.05, 392, 0.1, -0.28, 0.42);
pluck(2.45, 493.88, 0.1, 0.24, 0.42);
impact(2.82, 55, 0.55);
whoosh(2.88, 1.42, 0.1);

for (let time = 3.08, step = 0; time < 4.7; time += 0.2, step += 1) {
  tick(time, step % 2 === 0 ? 0.058 : 0.034, -0.72 + (step % 5) * 0.36);
}
[3.26, 3.58, 3.9, 4.22, 4.54].forEach((time, index) => {
  pluck(time, [659.25, 587.33, 523.25, 493.88, 440][index], 0.115, 0.7 - index * 0.35, 0.36);
});

whoosh(4.72, 0.46, 0.12);
[5.02, 5.38, 5.74, 6.1, 6.46].forEach((time, index) => {
  impact(time, [55, 61.74, 65.41, 73.42, 82.41][index], index === 2 ? 0.62 : 0.48);
});

vacuum(6.78, 0.34);
whoosh(6.96, 0.44, 0.14);
impact(7.24, 55, 0.78);
[7.58, 7.72, 7.86, 8.0, 8.14].forEach((time, index) => {
  pluck(time, [440, 554.37, 659.25, 830.61, 987.77][index], 0.095, -0.72 + index * 0.36, 0.82);
});
bass(7.25, 55, 0.2, 1.2);
pluck(8.34, 440, 0.07, -0.3, 1.1);
pluck(8.36, 659.25, 0.065, 0.3, 1.1);
pluck(8.76, 554.37, 0.052, -0.18, 0.72);
pluck(9.1, 659.25, 0.046, 0.2, 0.54);
tick(9.22, 0.04, 0);
} else {
  // The extended real-asset cut keeps the same fast tactile language, but places
  // musical punctuation at the longer scene boundaries instead of leaving a
  // silent tail after the original sprint score.
  impact(0.02, 55, 0.72);
  [0.34, 0.46, 0.58, 0.7, 0.82].forEach((time, index) => {
    pluck(time, [440, 554.37, 659.25, 880, 987.77][index], 0.09, -0.7 + index * 0.35, 0.28);
  });
  whoosh(0.94, 0.42, 0.11);
  impact(1.1, 49, 0.52);
  for (let time = 1.5, step = 0; time < 3.7; time += 0.18, step += 1) {
    tick(time, step % 2 === 0 ? 0.062 : 0.038, step % 2 === 0 ? -0.5 : 0.5);
    if (step % 4 === 0) bass(time, 49, 0.1, 0.2);
  }
  [1.82, 2.2, 2.62, 3.04, 3.46].forEach((time, index) => {
    pluck(time, [392, 493.88, 523.25, 587.33, 659.25][index], 0.09, -0.4 + index * 0.2, 0.42);
  });
  whoosh(3.78, 0.38, 0.1);

  for (let time = 4.08, step = 0; time < 6.5; time += 0.2, step += 1) {
    tick(time, step % 2 === 0 ? 0.058 : 0.034, -0.72 + (step % 5) * 0.36);
  }
  [4.48, 4.86, 5.24, 5.62, 6.0].forEach((time, index) => {
    pluck(time, [659.25, 587.33, 523.25, 493.88, 440][index], 0.11, 0.7 - index * 0.35, 0.4);
  });
  whoosh(6.66, 0.42, 0.12);

  [6.98, 7.32, 7.66, 8.0, 8.34].forEach((time, index) => {
    impact(time, [55, 61.74, 65.41, 73.42, 82.41][index], index === 2 ? 0.62 : 0.48);
  });
  vacuum(10.12, 0.34);
  whoosh(10.3, 0.42, 0.14);
  impact(10.62, 55, 0.74);
  [10.99, 11.2, 11.41, 11.62, 11.83].forEach((time, index) => {
    pluck(time, [440, 554.37, 659.25, 830.61, 987.77][index], 0.09, -0.72 + index * 0.36, 0.72);
  });
  bass(10.62, 55, 0.18, 1.15);
  whoosh(12.68, 0.42, 0.1);
  impact(13.04, 55, 0.78);
  [13.38, 13.54, 13.7, 13.86, 14.02].forEach((time, index) => {
    pluck(time, [440, 554.37, 659.25, 830.61, 987.77][index], 0.095, -0.72 + index * 0.36, 0.82);
  });
  bass(13.05, 55, 0.2, 1.3);
  pluck(14.22, 440, 0.07, -0.3, 0.68);
  pluck(14.24, 659.25, 0.065, 0.3, 0.68);
  pluck(14.54, 554.37, 0.052, -0.18, 0.4);
  pluck(14.72, 659.25, 0.046, 0.2, 0.28);
  tick(14.82, 0.035, 0);
}

let peak = 0;
for (let index = 0; index < TOTAL; index += 1) peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
const normalization = peak > 0 ? 1 / peak : 1;
const limiterDrive = 1.28;
const limiterCeiling = 0.75;
const limiterScale = Math.tanh(limiterDrive);
const data = Buffer.alloc(TOTAL * 4);
for (let index = 0; index < TOTAL; index += 1) {
  const limitedLeft = Math.tanh(left[index] * normalization * limiterDrive) / limiterScale * limiterCeiling * OUTPUT_GAIN;
  const limitedRight = Math.tanh(right[index] * normalization * limiterDrive) / limiterScale * limiterCeiling * OUTPUT_GAIN;
  data.writeInt16LE(Math.round(clamp(limitedLeft) * 32767), index * 4);
  data.writeInt16LE(Math.round(clamp(limitedRight) * 32767), index * 4 + 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, Buffer.concat([header, data]));
console.log(`Wrote ${OUTPUT} (${DURATION}s, 150 BPM, 48000Hz stereo)`);
