import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "assets", "roster-launch-sound-design.wav");
const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const DURATION = 57;
const TOTAL = SAMPLE_RATE * DURATION;
const left = new Float32Array(TOTAL);
const right = new Float32Array(TOTAL);

const clamp = (value, min = -1, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (value) => {
  const v = Math.max(0, Math.min(1, value));
  return v * v * (3 - 2 * v);
};
const envelope = (time, attack, release, duration) => {
  const inPart = smooth(Math.min(1, time / attack));
  const outPart = smooth(Math.min(1, Math.max(0, (duration - time) / release)));
  return inPart * outPart;
};
const sampleIndex = (seconds) => Math.max(0, Math.min(TOTAL - 1, Math.floor(seconds * SAMPLE_RATE)));

function addSample(index, value, pan = 0) {
  const spread = Math.max(-1, Math.min(1, pan));
  left[index] += value * (0.75 - spread * 0.25);
  right[index] += value * (0.75 + spread * 0.25);
}

function addTone(start, duration, frequency, amplitude, options = {}) {
  const wave = options.wave ?? "sine";
  const pan = options.pan ?? 0;
  const attack = options.attack ?? 0.008;
  const release = options.release ?? Math.min(0.18, duration * 0.5);
  const detune = options.detune ?? 0;
  const begin = sampleIndex(start);
  const end = Math.min(TOTAL, sampleIndex(start + duration));
  for (let i = begin; i < end; i += 1) {
    const t = (i - begin) / SAMPLE_RATE;
    const phase = 2 * Math.PI * (frequency + detune) * t;
    const source = wave === "triangle"
      ? 2 * Math.abs(2 * ((frequency * t + 0.25) % 1) - 1) - 1
      : wave === "square"
        ? Math.sin(phase) >= 0 ? 1 : -1
        : Math.sin(phase);
    addSample(i, source * amplitude * envelope(t, attack, release, duration), pan);
  }
}

function addNoise(start, duration, amplitude, options = {}) {
  const pan = options.pan ?? 0;
  const attack = options.attack ?? 0.004;
  const release = options.release ?? 0.12;
  let seed = Math.floor(start * 100000) + Math.floor(duration * 1000) + 17;
  const begin = sampleIndex(start);
  const end = Math.min(TOTAL, sampleIndex(start + duration));
  for (let i = begin; i < end; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = ((seed / 4294967296) * 2 - 1) * envelope((i - begin) / SAMPLE_RATE, attack, release, duration);
    addSample(i, value * amplitude, pan);
  }
}

function addSweep(start, duration, from, to, amplitude, pan = 0) {
  const begin = sampleIndex(start);
  const end = Math.min(TOTAL, sampleIndex(start + duration));
  for (let i = begin; i < end; i += 1) {
    const t = (i - begin) / SAMPLE_RATE;
    const progress = t / duration;
    const frequency = from + (to - from) * progress;
    const phase = 2 * Math.PI * (from * t + (to - from) * t * progress * 0.5);
    addSample(i, Math.sin(phase) * amplitude * envelope(t, 0.05, 0.35, duration), pan);
  }
}

// A quiet tonal bed: harmonic, slow-moving and deliberately not a generic loop.
for (let i = 0; i < TOTAL; i += 1) {
  const time = i / SAMPLE_RATE;
  const fade = smooth(Math.min(1, time / 2.2)) * smooth(Math.min(1, (DURATION - time) / 2.4));
  const drift = Math.sin(2 * Math.PI * 0.08 * time) * 0.5 + 0.5;
  const bed = (Math.sin(2 * Math.PI * 48 * time) * 0.013 + Math.sin(2 * Math.PI * 72 * time + drift) * 0.008 + Math.sin(2 * Math.PI * 96 * time) * 0.004) * fade;
  left[i] += bed;
  right[i] += bed * 0.96;
}

// Scene punctuation: a low impact plus a single glass harmonic.
for (const [time, intensity] of [[0, 0.8], [3, 0.34], [9.6, 0.48], [16.5, 0.56], [21.5, 0.44], [29.5, 0.46], [35.5, 0.65], [42.5, 0.42], [46.5, 0.5], [49.8, 0.34], [53.5, 0.38], [55.25, 0.92]]) {
  addTone(time, 0.72, 58, 0.26 * intensity, { attack: 0.004, release: 0.52, wave: "sine" });
  addTone(time + 0.018, 0.48, 220 + intensity * 120, 0.11 * intensity, { attack: 0.006, release: 0.36, wave: "triangle", pan: -0.15 });
}

// Terminal cadence and command completion.
for (let time = 4.0; time < 5.72; time += 0.085) {
  addNoise(time, 0.024, 0.032, { release: 0.018, pan: Math.sin(time * 4) * 0.3 });
}
addTone(5.75, 0.18, 760, 0.08, { attack: 0.006, release: 0.12, wave: "triangle" });
for (let time = 17.35; time < 18.7; time += 0.07) addNoise(time, 0.018, 0.026, { release: 0.014, pan: -0.2 });

// The search pass is one authored rising sweep, not a stock whoosh.
addSweep(22.1, 7.1, 180, 1240, 0.045, -0.15);
addTone(23.2, 7, 164, 0.018, { attack: 0.4, release: 0.5, detune: 3 });
// Clearing fragments: short glass grains riding the wipe.
for (let index = 0; index < 12; index += 1) {
  const time = 30.6 + index * 0.34;
  addNoise(time, 0.1, 0.022, { release: 0.07, pan: (index % 5) / 4 - 0.5 });
  addTone(time + 0.01, 0.16, 560 + index * 41, 0.025, { attack: 0.006, release: 0.1, wave: "triangle", pan: (index % 2 ? 0.3 : -0.3) });
}

// Five distinct lineup locks, increasingly confident.
[36.0, 37.1, 38.2, 39.3, 40.4].forEach((time, index) => {
  addTone(time, 0.32, 260 + index * 42, 0.065, { attack: 0.006, release: 0.22, wave: "triangle", pan: (index - 2) * 0.15 });
  addTone(time + 0.03, 0.18, 780 + index * 38, 0.035, { attack: 0.004, release: 0.12, wave: "sine", pan: (2 - index) * 0.12 });
});

// Packet movement and result return.
[43.55, 44.15, 44.75, 45.35].forEach((time, index) => addTone(time, 0.12, 440 + index * 55, 0.035, { attack: 0.004, release: 0.08, wave: "triangle", pan: index % 2 ? 0.35 : -0.35 }));

// Failure crackle, followed by a clean suggestion chime.
addNoise(47.35, 0.24, 0.075, { attack: 0.002, release: 0.18, pan: 0.1 });
addTone(47.38, 0.26, 92, 0.1, { attack: 0.002, release: 0.2, wave: "square" });
addTone(48.35, 0.36, 392, 0.07, { attack: 0.01, release: 0.22, wave: "triangle", pan: 0.2 });
addTone(48.52, 0.42, 588, 0.065, { attack: 0.012, release: 0.25, wave: "triangle", pan: -0.2 });
addTone(49.0, 0.48, 784, 0.052, { attack: 0.012, release: 0.32, wave: "sine" });

// Final identity chord, designed as a single resolve instead of a generic riser.
for (const [frequency, amplitude, pan] of [[220, 0.09, -0.3], [330, 0.07, 0.25], [440, 0.06, -0.12], [660, 0.04, 0.2]]) {
  addTone(55.2, 1.45, frequency, amplitude, { attack: 0.08, release: 0.8, wave: "triangle", pan });
}
addSweep(54.1, 1.1, 160, 880, 0.028, 0);

const output = Buffer.alloc(44 + TOTAL * CHANNELS * 2);
const writeAscii = (offset, value) => output.write(value, offset, "ascii");
writeAscii(0, "RIFF");
output.writeUInt32LE(36 + TOTAL * CHANNELS * 2, 4);
writeAscii(8, "WAVE");
writeAscii(12, "fmt ");
output.writeUInt32LE(16, 16);
output.writeUInt16LE(1, 20);
output.writeUInt16LE(CHANNELS, 22);
output.writeUInt32LE(SAMPLE_RATE, 24);
output.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);
output.writeUInt16LE(CHANNELS * 2, 32);
output.writeUInt16LE(16, 34);
writeAscii(36, "data");
output.writeUInt32LE(TOTAL * CHANNELS * 2, 40);
let peak = 0;
for (let i = 0; i < TOTAL; i += 1) {
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
// Leave headroom for social encoders while bringing the intentionally quiet
// design up to a useful listening level. This is deterministic peak mastering,
// not a frame-dependent or playback-dependent volume change.
const masterGain = peak > 0 ? 0.78 / peak : 1;
let offset = 44;
for (let i = 0; i < TOTAL; i += 1) {
  const l = Math.tanh(left[i] * masterGain);
  const r = Math.tanh(right[i] * masterGain);
  output.writeInt16LE(Math.round(clamp(l) * 32767), offset);
  output.writeInt16LE(Math.round(clamp(r) * 32767), offset + 2);
  offset += 4;
}
mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, output);
console.log(`Wrote ${OUTPUT} (${DURATION}s, ${SAMPLE_RATE}Hz stereo)`);
