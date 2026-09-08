import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "assets", "roster-launch-sfx.wav");
const SAMPLE_RATE = 48000;
const DURATION = 12.4;
const TOTAL = Math.floor(SAMPLE_RATE * DURATION);
const left = new Float32Array(TOTAL);
const right = new Float32Array(TOTAL);

const clamp = (value, min = -1, max = 1) => Math.max(min, Math.min(max, value));
const indexAt = (seconds) => Math.max(0, Math.min(TOTAL, Math.floor(seconds * SAMPLE_RATE)));
let seed = 0x2e1a9b73;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 * 2 - 1;
};

function add(index, sample, pan = 0) {
  if (index < 0 || index >= TOTAL) return;
  const p = clamp(pan);
  left[index] += sample * (0.78 - p * 0.2);
  right[index] += sample * (0.78 + p * 0.2);
}

function thump(start, gain = 0.36, duration = 0.3) {
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  let phase = 0;
  for (let index = begin; index < end; index += 1) {
    const t = (index - begin) / SAMPLE_RATE;
    const frequency = 42 + 110 * Math.exp(-t * 24);
    phase += Math.PI * 2 * frequency / SAMPLE_RATE;
    const body = Math.sin(phase) * Math.exp(-t * 10.5);
    // A short pitched transient gives the impact definition without the
    // brittle white-noise click that made earlier renders sound synthetic.
    const transient = Math.sin(Math.PI * 2 * 1780 * t) * Math.exp(-t * 92) * 0.11;
    add(index, Math.tanh((body + transient) * 1.38) * gain);
  }
}

function click(start, gain = 0.12, pan = 0) {
  const begin = indexAt(start);
  const end = indexAt(start + 0.052);
  let phase = 0;
  // A short, low mechanical tick reads as typing; the old 1.7 kHz tone
  // lingered like a squeak when the terminal printed a burst of lines.
  const frequency = 560 + pan * 45;
  for (let index = begin; index < end; index += 1) {
    const t = (index - begin) / SAMPLE_RATE;
    phase += Math.PI * 2 * frequency / SAMPLE_RATE;
    const envelope = (1 - Math.exp(-t * 520)) * Math.exp(-t * 118);
    const tone = Math.sin(phase) * 0.84 + Math.sin(phase * 1.93 + 0.18) * 0.14;
    add(index, tone * envelope * gain, pan);
  }
}

function glint(start, frequency = 880, gain = 0.07, pan = 0) {
  const begin = indexAt(start);
  const end = indexAt(start + 0.34);
  for (let index = begin; index < end; index += 1) {
    const t = (index - begin) / SAMPLE_RATE;
    const envelope = Math.min(1, t / 0.006) * Math.exp(-t * 10.5);
    const phase = Math.PI * 2 * frequency * t;
    const sample = Math.sin(phase) * 0.7 + Math.sin(phase * 2.01 + 0.2) * 0.2;
    add(index, sample * envelope * gain, pan);
  }
}

function whoosh(start, duration = 0.4, gain = 0.1, panFrom = 0.8, panTo = -0.8) {
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
    const envelope = Math.sin(Math.PI * progress) ** 1.5;
    const air = Math.sin(Math.PI * 2 * (260 + progress * 420) * t) * 0.09;
    add(index, ((low - slower) * 0.58 + air) * envelope * gain, panFrom + (panTo - panFrom) * progress);
  }
}

function smokePulse(start, duration = 0.34, gain = 0.055, pan = 0, pitch = 118) {
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  let filteredNoise = 0;
  let lowBody = 0;
  let phase = 0;
  for (let index = begin; index < end; index += 1) {
    const t = (index - begin) / SAMPLE_RATE;
    const progress = t / duration;
    const envelope = Math.sin(Math.PI * progress) ** 1.7;
    const raw = noise();
    filteredNoise += (raw - filteredNoise) * (0.018 + progress * 0.055);
    lowBody += (filteredNoise - lowBody) * 0.012;
    phase += Math.PI * 2 * (pitch + progress * 42) / SAMPLE_RATE;
    // A low, airy transient mirrors the soft visual plume. It deliberately
    // avoids a hard click or a bright pitched chirp, so it sits under the mix.
    const air = (filteredNoise - lowBody) * 0.42;
    const body = Math.sin(phase) * Math.exp(-t * 8.5) * 0.13;
    add(index, (air + body) * envelope * gain, pan + (progress - 0.5) * 0.16);
  }
}

// Tactile impacts reinforce visual beats without adding another melodic layer.
thump(0.02, 0.46);
whoosh(0.86, 0.36, 0.085);
thump(1.08, 0.28);
for (let time = 1.48, step = 0; time < 3.62; time += 0.18, step += 1) {
  click(time, step % 2 === 0 ? 0.05 : 0.032, step % 2 === 0 ? -0.55 : 0.55);
}
whoosh(3.78, 0.38, 0.09, -0.85, 0.85);

[4.62, 5.0, 5.38, 5.76, 6.14].forEach((time, index) => {
  thump(time, index === 2 ? 0.3 : 0.21, 0.22);
  glint(time + 0.018, [659.25, 739.99, 830.61, 932.33, 1046.5][index], 0.075, -0.4 + index * 0.2);
});
whoosh(6.84, 0.36, 0.095, 0.85, -0.85);

[7.54, 7.78, 8.02, 8.26, 8.5].forEach((time, index) => {
  thump(time, index === 2 ? 0.34 : 0.25, 0.25);
  click(time + 0.07, 0.06, -0.6 + index * 0.3);
});
// The ranked-route scene has its own quiet audio grammar: a neutral intake
// plume, two restrained candidate wisps, then one slightly fuller green
// resolution pulse on the selected Playwright lane.
smokePulse(7.78, 0.46, 0.09, -0.42, 108);
smokePulse(8.38, 0.28, 0.042, 0.22, 132);
smokePulse(8.54, 0.28, 0.042, 0.08, 140);
smokePulse(8.72, 0.44, 0.095, 0.42, 156);
whoosh(9.02, 0.36, 0.095, -0.8, 0.8);
thump(9.36, 0.42, 0.32);
[9.62, 9.8, 9.98, 10.16].forEach((time, index) => {
  glint(time, [440, 554.37, 659.25, 830.61, 987.77][index], 0.065, -0.65 + index * 0.32);
});
whoosh(10.34, 0.34, 0.085, 0.8, -0.8);
thump(10.62, 0.48, 0.36);
[10.82, 11.0, 11.18, 11.36, 11.54].forEach((time, index) => {
  glint(time, [440, 554.37, 659.25, 830.61, 987.77][index], 0.08, -0.72 + index * 0.36);
});
whoosh(11.72, 0.22, 0.06, -0.4, 0.4);
thump(11.94, 0.42, 0.3);
[12.08, 12.16, 12.24, 12.32].forEach((time, index) => {
  glint(time, [554.37, 659.25, 830.61, 987.77][index], 0.055, -0.6 + index * 0.4);
});

let peak = 0;
for (let index = 0; index < TOTAL; index += 1) peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
const normalization = peak > 0 ? 1 / peak : 1;
const data = Buffer.alloc(TOTAL * 4);
for (let index = 0; index < TOTAL; index += 1) {
  const limitedLeft = Math.tanh(left[index] * normalization * 1.2) / Math.tanh(1.2) * 0.78;
  const limitedRight = Math.tanh(right[index] * normalization * 1.2) / Math.tanh(1.2) * 0.78;
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
console.log(`Wrote ${OUTPUT} (${DURATION}s tactile launch cues)`);
