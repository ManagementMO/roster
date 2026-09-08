import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const cues = JSON.parse(fs.readFileSync(path.join(appDir, "src/audio/cues.json"), "utf8"));

const sampleRate = 48_000;
const channels = 2;
const duration = cues.durationSeconds;
const sampleCount = Math.round(sampleRate * duration);
const left = new Float64Array(sampleCount);
const right = new Float64Array(sampleCount);
const tau = Math.PI * 2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (value) => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

const add = (index, value, pan = 0) => {
  if (index < 0 || index >= sampleCount) return;
  const angle = ((pan + 1) * Math.PI) / 4;
  left[index] += value * Math.cos(angle);
  right[index] += value * Math.sin(angle);
};

let noiseState = 0x726f7374;
const noise = () => {
  noiseState ^= noiseState << 13;
  noiseState ^= noiseState >>> 17;
  noiseState ^= noiseState << 5;
  return ((noiseState >>> 0) / 4294967296) * 2 - 1;
};

const addImpact = (at, strength = 1, pan = 0) => {
  const start = Math.round(at * sampleRate);
  const length = Math.round(0.92 * sampleRate);
  for (let offset = 0; offset < length; offset += 1) {
    const t = offset / sampleRate;
    const pitch = 82 * Math.exp(-t * 5.2) + 34;
    const sub = Math.sin(tau * pitch * t) * Math.exp(-t * 5.1);
    const body = Math.sin(tau * 146 * t) * Math.exp(-t * 13);
    const click = noise() * Math.exp(-t * 80);
    add(start + offset, strength * (sub * 0.42 + body * 0.13 + click * 0.055), pan);
  }
};

const addClick = (at, strength = 1, pan = 0) => {
  const start = Math.round(at * sampleRate);
  const length = Math.round(0.055 * sampleRate);
  for (let offset = 0; offset < length; offset += 1) {
    const t = offset / sampleRate;
    const envelope = Math.exp(-t * 74);
    const value = (Math.sin(tau * 2100 * t) * 0.28 + noise() * 0.16) * envelope * strength;
    add(start + offset, value, pan);
  }
};

const addSweep = (at, direction = 1, strength = 1) => {
  const start = Math.round(at * sampleRate);
  const length = Math.round(1.12 * sampleRate);
  let phase = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const t = offset / length;
    const envelope = Math.sin(Math.PI * t) ** 1.5;
    const frequency = 180 + 1750 * smoothstep(t);
    phase += tau * frequency / sampleRate;
    const value = (Math.sin(phase) * 0.075 + noise() * 0.018) * envelope * strength;
    add(start + offset, value, direction * (t * 2 - 1) * 0.78);
  }
};

const addFlyBy = (at, direction = 1) => {
  const start = Math.round(at * sampleRate);
  const length = Math.round(0.78 * sampleRate);
  let low = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const t = offset / length;
    const envelope = Math.sin(Math.PI * t) ** 2;
    low += 0.08 * (noise() - low);
    add(start + offset, low * envelope * 0.21, direction * (t * 2 - 1));
  }
};

const addRise = (at, lengthSeconds, strength = 1) => {
  const start = Math.round(at * sampleRate);
  const length = Math.round(lengthSeconds * sampleRate);
  let phase = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const t = offset / length;
    const envelope = smoothstep(t) * (1 - smoothstep((t - 0.86) / 0.14));
    const frequency = 110 + 330 * t * t;
    phase += tau * frequency / sampleRate;
    add(start + offset, Math.sin(phase) * envelope * 0.11 * strength, -0.24 + 0.48 * t);
  }
};

const addFailure = (at) => {
  const start = Math.round(at * sampleRate);
  const length = Math.round(0.56 * sampleRate);
  let low = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const t = offset / sampleRate;
    low += 0.16 * (noise() - low);
    const gate = Math.sin(tau * 23 * t) > -0.12 ? 1 : 0.12;
    const envelope = Math.sin(Math.PI * offset / length) ** 0.8;
    add(start + offset, (low * 0.22 + Math.sin(tau * 74 * t) * 0.08) * envelope * gate, 0.18);
  }
};

// Continuous local-first score: a restrained D drone with tension shaped by scene.
for (let index = 0; index < sampleCount; index += 1) {
  const t = index / sampleRate;
  const intro = smoothstep(t / 1.6);
  const outro = 1 - smoothstep((t - 56.25) / 0.7);
  const overload = smoothstep((t - 9.5) / 5.5) * (1 - smoothstep((t - 17.2) / 1.0));
  const resolve = smoothstep((t - 17.0) / 4.0);
  const pulse = 0.78 + 0.22 * Math.sin(tau * 0.24 * t);
  const drone =
    Math.sin(tau * 36.708 * t + Math.sin(t * 0.13) * 0.15) * 0.085 +
    Math.sin(tau * 55.0 * t + 0.7) * 0.038 +
    Math.sin(tau * 73.416 * t + 1.4) * (0.022 + resolve * 0.018);
  const tension = Math.sin(tau * 109.9 * t + Math.sin(t * 1.7)) * overload * 0.027;
  const shimmer = Math.sin(tau * 293.66 * t + Math.sin(t * 0.31) * 2.2) * resolve * 0.009;
  add(index, (drone * pulse + tension + shimmer) * intro * outro, Math.sin(t * 0.11) * 0.18);
}

// A disciplined rhythmic bed that tightens during overload and clears at the reveal.
const beatSeconds = 60 / cues.tempoBpm;
for (let at = 3.15, beat = 0; at < 54; at += beatSeconds, beat += 1) {
  const strength = at < 10 ? 0.28 : at < 17 ? 0.48 : at < 37 ? 0.34 : 0.42;
  addImpact(at, strength, beat % 2 === 0 ? -0.1 : 0.1);
}

cues.impacts.forEach((at, index) => addImpact(at, index === cues.impacts.length - 1 ? 1.24 : 0.72, index % 2 ? 0.08 : -0.08));
cues.scanSweeps.forEach((at, index) => addSweep(at, index % 2 === 0 ? 1 : -1, 0.94));
cues.flyBys.forEach((at, index) => addFlyBy(at, index % 2 === 0 ? 1 : -1));
cues.connectionClicks.forEach((at, index) => addClick(at, 0.68, index % 2 ? 0.38 : -0.38));

cues.typingWindows.forEach(([from, to], windowIndex) => {
  let at = from;
  let key = 0;
  while (at < to) {
    addClick(at, 0.26, ((key % 7) - 3) / 7);
    const cadence = 0.055 + ((key * 37 + windowIndex * 11) % 9) * 0.009;
    at += cadence;
    key += 1;
  }
});

addRise(14.4, 2.8, 0.7);
addRise(34.1, 3.2, 0.85);
addFailure(cues.failureAt);
addRise(cues.sixthManRiseAt, 1.2, 1.15);
addRise(52.2, 2.4, 1.0);

// A deterministic soft-knee mastering pass lifts the quiet atmospheric bed
// without letting short impacts dominate the available headroom.
const masteringDrive = 3.6;
const masteringCeiling = Math.tanh(masteringDrive);
for (let index = 0; index < sampleCount; index += 1) {
  left[index] = Math.tanh(left[index] * masteringDrive) / masteringCeiling;
  right[index] = Math.tanh(right[index] * masteringDrive) / masteringCeiling;
}

let peak = 0;
for (let index = 0; index < sampleCount; index += 1) {
  peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
}
const gain = peak > 0 ? 0.88 / peak : 1;

const dataBytes = sampleCount * channels * 2;
const buffer = Buffer.alloc(44 + dataBytes);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(channels, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * channels * 2, 28);
buffer.writeUInt16LE(channels * 2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(dataBytes, 40);

for (let index = 0; index < sampleCount; index += 1) {
  const offset = 44 + index * 4;
  buffer.writeInt16LE(Math.round(clamp(left[index] * gain, -1, 1) * 32767), offset);
  buffer.writeInt16LE(Math.round(clamp(right[index] * gain, -1, 1) * 32767), offset + 2);
}

const output = path.join(appDir, "public/audio/roster-launch-bed.wav");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, buffer);
process.stdout.write(`Generated ${path.relative(appDir, output)} · ${duration}s · 48kHz stereo · peak normalized to -1.1 dBFS\n`);
