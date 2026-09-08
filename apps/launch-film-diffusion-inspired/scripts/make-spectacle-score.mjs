import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "assets", "roster-launch-spectacle-score.wav");
const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const DURATION = 57;
const TOTAL = SAMPLE_RATE * DURATION;
const BPM = 112;
const BEAT = 60 / BPM;
const left = new Float32Array(TOTAL);
const right = new Float32Array(TOTAL);
const kickTimes = [];

const clamp = (value, min = -1, max = 1) => Math.max(min, Math.min(max, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const smooth = (value) => {
  const v = clamp(value, 0, 1);
  return v * v * (3 - 2 * v);
};
const indexAt = (seconds) => Math.max(0, Math.min(TOTAL, Math.floor(seconds * SAMPLE_RATE)));
const envelope = (time, duration, attack = 0.008, release = 0.2) => (
  smooth(Math.min(1, time / attack)) * smooth(Math.min(1, Math.max(0, (duration - time) / release)))
);

let noiseSeed = 0x3a42f17d;
const random = () => {
  noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
  return noiseSeed / 4294967296 * 2 - 1;
};

function add(index, sample, pan = 0, width = 0) {
  if (index < 0 || index >= TOTAL) return;
  const p = clamp(pan, -1, 1);
  const side = width * sample * 0.24;
  left[index] += sample * (0.78 - p * 0.28) + side;
  right[index] += sample * (0.78 + p * 0.28) - side;
}

function wave(type, phase) {
  if (type === "triangle") return 2 / Math.PI * Math.asin(Math.sin(phase));
  if (type === "softSaw") {
    return Math.sin(phase) * 0.72 + Math.sin(phase * 2) * 0.18 + Math.sin(phase * 3) * 0.08 + Math.sin(phase * 4) * 0.035;
  }
  if (type === "pulse") return Math.tanh(Math.sin(phase) * 2.4) * 0.72 + Math.sin(phase * 2) * 0.11;
  return Math.sin(phase);
}

function addSynth(start, duration, frequency, amplitude, options = {}) {
  const type = options.type ?? "softSaw";
  const attack = options.attack ?? 0.012;
  const release = options.release ?? Math.min(0.28, duration * 0.45);
  const pan = options.pan ?? 0;
  const detune = options.detune ?? 0.0028;
  const brightness = options.brightness ?? 1;
  const begin = indexAt(start);
  const end = indexAt(Math.min(DURATION, start + duration));
  for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
    const t = (sampleIndex - begin) / SAMPLE_RATE;
    const env = envelope(t, duration, attack, release);
    const drift = Math.sin(t * 1.9 + start) * 0.0014;
    const phaseA = Math.PI * 2 * frequency * (1 - detune + drift) * t;
    const phaseB = Math.PI * 2 * frequency * (1 + detune - drift) * t + 0.58;
    const body = wave(type, phaseA) * 0.54 + wave(type, phaseB) * 0.46;
    const air = Math.sin(phaseA * 2.01) * 0.055 * brightness;
    add(sampleIndex, (body + air) * amplitude * env, pan, Math.sin(t * 0.7) * 0.6);
  }
}

function addPad(start, duration, frequencies, amplitude = 0.045, color = 1) {
  frequencies.forEach((frequency, index) => {
    addSynth(start, duration, frequency, amplitude / frequencies.length * 1.9, {
      type: "softSaw",
      attack: 0.82,
      release: 1.35,
      pan: (index / Math.max(1, frequencies.length - 1) - 0.5) * 1.25,
      detune: 0.004 + index * 0.0008,
      brightness: color,
    });
  });
}

function addBass(start, duration, frequency, amplitude = 0.12) {
  const begin = indexAt(start);
  const end = indexAt(Math.min(DURATION, start + duration));
  for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
    const t = (sampleIndex - begin) / SAMPLE_RATE;
    const env = envelope(t, duration, 0.008, Math.min(0.24, duration * 0.6)) * Math.exp(-t * 0.48);
    const phase = Math.PI * 2 * frequency * t;
    const body = Math.sin(phase) * 0.72 + Math.sin(phase * 2) * 0.17 + Math.sin(phase * 3) * 0.07;
    add(sampleIndex, Math.tanh(body * 1.3) * amplitude * env, 0, 0.1);
  }
}

function addKick(start, amplitude = 0.56, tail = 0.48) {
  kickTimes.push(start);
  const begin = indexAt(start);
  const end = indexAt(Math.min(DURATION, start + tail));
  let phase = 0;
  for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
    const t = (sampleIndex - begin) / SAMPLE_RATE;
    const frequency = 42 + 118 * Math.exp(-t * 23);
    phase += Math.PI * 2 * frequency / SAMPLE_RATE;
    const body = Math.sin(phase) * Math.exp(-t * 9.2);
    const click = t < 0.018 ? (1 - t / 0.018) * random() * 0.22 : 0;
    add(sampleIndex, Math.tanh((body + click) * 1.65) * amplitude, 0, 0.08);
  }
}

function addClap(start, amplitude = 0.18, pan = 0) {
  const duration = 0.28;
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  let low = 0;
  for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
    const t = (sampleIndex - begin) / SAMPLE_RATE;
    const raw = random();
    low += (raw - low) * 0.065;
    const high = raw - low;
    const flam = Math.exp(-t * 23) + (t > 0.028 ? Math.exp(-(t - 0.028) * 29) * 0.64 : 0) + (t > 0.055 ? Math.exp(-(t - 0.055) * 34) * 0.42 : 0);
    add(sampleIndex, high * flam * amplitude, pan, 0.72);
  }
}

function addHat(start, amplitude = 0.055, open = false, pan = 0) {
  const duration = open ? 0.24 : 0.075;
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  let low = 0;
  for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
    const t = (sampleIndex - begin) / SAMPLE_RATE;
    const raw = random();
    low += (raw - low) * 0.035;
    const metallic = raw - low + Math.sin(Math.PI * 2 * 6120 * t) * 0.18 + Math.sin(Math.PI * 2 * 8340 * t) * 0.12;
    add(sampleIndex, metallic * amplitude * Math.exp(-t * (open ? 13 : 48)), pan, 0.9);
  }
}

function addGlass(start, frequency, amplitude = 0.1, pan = 0, duration = 0.65) {
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
    const t = (sampleIndex - begin) / SAMPLE_RATE;
    const env = Math.exp(-t * 6.5) * smooth(Math.min(1, t / 0.006));
    const tone = Math.sin(Math.PI * 2 * frequency * t) * 0.62
      + Math.sin(Math.PI * 2 * frequency * 2.71 * t) * 0.23
      + Math.sin(Math.PI * 2 * frequency * 4.13 * t) * 0.12;
    add(sampleIndex, tone * amplitude * env, pan, 0.48);
  }
}

function addWhoosh(start, duration, amplitude = 0.1, panFrom = -0.7, panTo = 0.7, lowToHigh = true) {
  const begin = indexAt(start);
  const end = indexAt(Math.min(DURATION, start + duration));
  let low = 0;
  let slow = 0;
  for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
    const t = (sampleIndex - begin) / SAMPLE_RATE;
    const progress = t / duration;
    const raw = random();
    const coefficient = mix(0.012, 0.22, lowToHigh ? progress : 1 - progress);
    low += (raw - low) * coefficient;
    slow += (low - slow) * 0.02;
    const band = low - slow;
    const env = Math.sin(Math.PI * progress) ** 1.45;
    add(sampleIndex, band * amplitude * env, mix(panFrom, panTo, progress), 0.9);
  }
}

function addRiser(start, duration, amplitude = 0.075) {
  addWhoosh(start, duration, amplitude, -0.8, 0.8, true);
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
    const t = (sampleIndex - begin) / SAMPLE_RATE;
    const p = t / duration;
    const env = smooth(p) * smooth(Math.min(1, (duration - t) / 0.12));
    let shepard = 0;
    for (let octave = 0; octave < 4; octave += 1) {
      const phase = (p * 3.2 + octave / 4) % 1;
      const frequency = 85 * 2 ** (phase * 4);
      const weight = Math.sin(Math.PI * phase) ** 1.2;
      shepard += Math.sin(Math.PI * 2 * frequency * t) * weight * 0.25;
    }
    add(sampleIndex, shepard * amplitude * env, Math.sin(p * Math.PI * 2) * 0.32, 0.5);
  }
}

function addVacuumPull(start, duration, amplitude = 0.08) {
  addWhoosh(start, duration, amplitude * 0.72, 0.78, -0.78, false);
  const begin = indexAt(start);
  const end = indexAt(start + duration);
  let phase = 0;
  for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
    const t = (sampleIndex - begin) / SAMPLE_RATE;
    const progress = t / duration;
    const frequency = mix(176, 38, smooth(progress));
    phase += Math.PI * 2 * frequency / SAMPLE_RATE;
    const env = smooth(progress) * smooth(Math.min(1, (duration - t) / 0.025));
    const pull = Math.sin(phase) * 0.64 + Math.sin(phase * 2.01) * 0.15;
    add(sampleIndex, pull * amplitude * env, Math.sin(progress * Math.PI) * 0.22, progress * 0.6);
  }
}

function addGlassCrack(start, amplitude = 0.18) {
  const shards = [
    [0, -0.82, 0.16],
    [0.012, 0.78, 0.13],
    [0.031, -0.4, 0.1],
    [0.052, 0.46, 0.08],
  ];
  shards.forEach(([offset, pan, gain]) => {
    const duration = 0.14;
    const begin = indexAt(start + offset);
    const end = indexAt(start + offset + duration);
    let low = 0;
    for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
      const t = (sampleIndex - begin) / SAMPLE_RATE;
      const raw = random();
      low += (raw - low) * 0.018;
      const brittle = raw - low + Math.sin(Math.PI * 2 * (3220 + offset * 11000) * t) * 0.18;
      add(sampleIndex, brittle * amplitude * gain * Math.exp(-t * 34), pan, 0.94);
    }
  });
  addGlass(start, 1180, amplitude * 0.42, -0.56, 0.42);
  addGlass(start + 0.018, 1760, amplitude * 0.34, 0.56, 0.36);
}

function addWideShimmer(start, duration, amplitude = 0.055) {
  const begin = indexAt(start);
  const end = indexAt(Math.min(DURATION, start + duration));
  let low = 0;
  for (let sampleIndex = begin; sampleIndex < end; sampleIndex += 1) {
    const t = (sampleIndex - begin) / SAMPLE_RATE;
    const progress = t / duration;
    const raw = random();
    low += (raw - low) * 0.009;
    const air = raw - low;
    const tail = smooth(Math.min(1, t / 0.34)) * smooth(Math.min(1, (duration - t) / 1.1));
    const harmonic = Math.sin(Math.PI * 2 * 880 * t) * 0.18
      + Math.sin(Math.PI * 2 * 1320.4 * t + 0.8) * 0.12
      + Math.sin(Math.PI * 2 * 1761.7 * t + 1.6) * 0.08;
    add(sampleIndex, (air * 0.32 + harmonic) * amplitude * tail, Math.sin(progress * Math.PI * 3) * 0.72, 0.96);
  }
}

function addImpact(start, amplitude = 0.55, color = 1) {
  addKick(start, amplitude * 0.82, 0.76);
  addWhoosh(start - 0.16, 0.42, amplitude * 0.08, -0.5, 0.5, true);
  addGlass(start + 0.012, 228 * color, amplitude * 0.12, -0.25, 0.9);
  addGlass(start + 0.024, 342 * color, amplitude * 0.09, 0.28, 1.1);
  addSynth(start, 1.2, 55, amplitude * 0.12, { type: "sine", attack: 0.004, release: 0.9, detune: 0.001 });
}

// Harmonic spine: the chords overlap so the score is continuous, not a set of scene loops.
addPad(0, 9.2, [73.42, 110, 146.83, 220], 0.085, 0.55);
addPad(7.6, 9.5, [65.41, 98, 130.81, 196], 0.092, 0.7);
addPad(15.2, 7.2, [58.27, 87.31, 116.54, 174.61], 0.1, 0.72);
addPad(20.2, 9.7, [73.42, 110, 146.83, 220], 0.105, 0.88);
addPad(28.4, 7.9, [65.41, 98, 130.81, 196], 0.104, 0.9);
addPad(34.0, 9.3, [73.42, 110, 146.83, 220], 0.13, 1.05);
addPad(41.0, 6.1, [82.41, 123.47, 164.81, 246.94], 0.085, 0.88);
addPad(45.8, 4.3, [58.27, 87.31, 116.54, 174.61], 0.075, 0.52);
addPad(48.2, 5.7, [65.41, 98, 130.81, 196], 0.11, 0.88);
addPad(52.2, 4.8, [73.42, 110, 146.83, 220, 293.66], 0.17, 1.15);

// Opening typography impacts and terminal ticks.
addImpact(0.04, 0.72, 0.86);
addImpact(1.08, 0.48, 1.2);
addImpact(2.34, 0.62, 1.5);
for (let time = 3.52; time < 4.55; time += 0.075) addHat(time, 0.042, false, Math.sin(time * 8) * 0.5);
for (let index = 0; index < 6; index += 1) addGlass(4.62 + index * 0.12, 520 + index * 48, 0.045, index % 2 ? 0.32 : -0.32, 0.34);
addRiser(6.68, 2.05, 0.1);
addVacuumPull(7.42, 1.13, 0.088);
addImpact(8.55, 0.68, 0.72);

// Groove begins in the universe and grows through search.
for (let beatIndex = 0; beatIndex < 51; beatIndex += 1) {
  const time = 8.55 + beatIndex * BEAT;
  if (time > 35.2) break;
  const sectionStrength = time < 15.4 ? 0.72 : time < 21 ? 0.62 : 0.88;
  if (beatIndex % 2 === 0 || time > 21) addKick(time, 0.34 * sectionStrength, 0.38);
  if (beatIndex % 4 === 2) addClap(time, 0.13 * sectionStrength, beatIndex % 8 === 2 ? -0.18 : 0.18);
  addHat(time + BEAT * 0.5, 0.035 * sectionStrength, beatIndex % 4 === 3, beatIndex % 2 ? 0.52 : -0.52);
  if (time > 20.2) addHat(time + BEAT * 0.25, 0.022, false, -0.25);
  const bassNotes = [73.42, 73.42, 87.31, 65.41, 73.42, 98, 87.31, 65.41];
  if (beatIndex % 2 === 0) addBass(time + BEAT * 0.06, BEAT * 0.78, bassNotes[beatIndex % bassNotes.length], 0.115 * sectionStrength);
}

// Initialization releases the overload, search then climbs in pitch.
addImpact(15.42, 0.74, 0.62);
addWhoosh(15.55, 4.7, 0.065, 0.8, -0.8, false);
addGlassCrack(17.18, 0.2);
addGlass(18.08, 392, 0.08, -0.24, 0.8);
addGlass(18.34, 587, 0.07, 0.22, 1.0);
addImpact(20.56, 0.62, 1.05);
addRiser(20.76, 8.1, 0.085);
const searchNotes = [293.66, 329.63, 392, 440, 493.88, 587.33, 659.25, 783.99];
for (let index = 0; index < 30; index += 1) {
  const time = 21.1 + index * BEAT * 0.5;
  addGlass(time, searchNotes[index % searchNotes.length], 0.035 + index / 30 * 0.018, (index % 5 - 2) * 0.18, 0.42);
}

// Clearing rhythm becomes granular, then five tuned lineup locks land hard.
addImpact(28.92, 0.62, 0.82);
addWhoosh(29.0, 5.7, 0.11, -0.85, 0.85, true);
for (let index = 0; index < 18; index += 1) {
  const time = 29.4 + index * 0.26;
  addHat(time, 0.045 + (index % 4) * 0.006, index % 5 === 0, (index % 6 - 2.5) * 0.18);
  if (index % 3 === 0) addGlass(time + 0.03, 680 + index * 24, 0.032, index % 2 ? 0.4 : -0.4, 0.28);
}
addGlass(34.24, 587.33, 0.07, -0.72, 1.8);
addGlass(34.62, 587.33, 0.052, 0.68, 1.55);
addGlass(35.02, 880, 0.038, -0.58, 1.3);
addGlass(35.46, 1174.66, 0.026, 0.5, 1.1);
const lineupTimes = [34.55, 34.85, 35.15, 35.45, 35.75];
const lineupNotes = [293.66, 349.23, 440, 523.25, 659.25];
lineupTimes.forEach((time, index) => {
  addImpact(time, 0.68 + index * 0.045, 0.72 + index * 0.12);
  addGlass(time, lineupNotes[index], 0.12, (index - 2) * 0.2, 1.0);
});

// Full groove for the payoff and crisp packet choreography.
for (let beatIndex = 0; beatIndex < 20; beatIndex += 1) {
  const time = 36.5 + beatIndex * BEAT;
  if (time > 46.0) break;
  addKick(time, beatIndex % 4 === 0 ? 0.48 : 0.35, 0.42);
  if (beatIndex % 2 === 1) addClap(time, 0.15, beatIndex % 4 === 1 ? -0.14 : 0.14);
  addHat(time + BEAT * 0.5, 0.05, beatIndex % 4 === 3, beatIndex % 2 ? 0.55 : -0.55);
  addHat(time + BEAT * 0.25, 0.026, false, -0.32);
  const bassStrength = time >= 42 ? 0.105 : 0.135;
  addBass(time + 0.025, BEAT * 0.72, [73.42, 87.31, 98, 65.41][beatIndex % 4], bassStrength);
}
[42.18, 42.72, 43.26, 43.8, 44.34, 44.88].forEach((time, index) => addGlass(time, 440 + index * 55, 0.055, index % 2 ? 0.5 : -0.5, 0.34));
addImpact(45.45, 0.56, 1.12);

// Failure removes the groove; suggestion rebuilds it deliberately.
addWhoosh(45.55, 0.38, 0.16, 0.5, -0.5, false);
addClap(45.72, 0.24, 0);
addSynth(45.58, 0.7, 46, 0.2, { type: "pulse", attack: 0.002, release: 0.54, detune: 0.0004 });
for (let index = 0; index < 5; index += 1) addGlass(46.45 + index * 0.24, 293.66 * 2 ** (index / 7), 0.075, (index - 2) * 0.2, 0.72);
addImpact(48.15, 0.5, 1.42);
addGlass(48.56, 659.25, 0.1, 0.28, 1.0);
addGlass(48.78, 783.99, 0.08, -0.26, 1.1);

// Coach/League returns as a lighter groove and the brand resolves wide.
for (let beatIndex = 0; beatIndex < 8; beatIndex += 1) {
  const time = 49.15 + beatIndex * BEAT;
  addKick(time, 0.3, 0.36);
  if (beatIndex % 2 === 1) addClap(time, 0.1, beatIndex % 4 === 1 ? -0.18 : 0.18);
  addHat(time + BEAT * 0.5, 0.038, beatIndex % 4 === 3, beatIndex % 2 ? 0.44 : -0.44);
  addBass(time, BEAT * 0.74, [65.41, 73.42, 87.31, 98][beatIndex % 4], 0.09);
}
addRiser(51.2, 2.5, 0.09);
addWideShimmer(50.08, 3.2, 0.058);
addImpact(52.72, 0.7, 0.82);
addImpact(53.38, 0.58, 1.05);
addImpact(54.18, 0.82, 1.28);
[293.66, 440, 587.33, 880].forEach((frequency, index) => addGlass(54.2 + index * 0.025, frequency, 0.12 - index * 0.014, (index - 1.5) * 0.28, 1.8));
addSynth(54.18, 2.7, 36.71, 0.24, { type: "sine", attack: 0.012, release: 2.2, detune: 0.0003 });

// Sidechain the score around kick transients for punch and continuous forward motion.
kickTimes.sort((a, b) => a - b);
let kickCursor = 0;
let previousKick = -10;
for (let sampleIndex = 0; sampleIndex < TOTAL; sampleIndex += 1) {
  const time = sampleIndex / SAMPLE_RATE;
  while (kickCursor < kickTimes.length && kickTimes[kickCursor] <= time) {
    previousKick = kickTimes[kickCursor];
    kickCursor += 1;
  }
  const since = time - previousKick;
  const duck = since >= 0 && since < 0.22 ? 0.68 + 0.32 * smooth(since / 0.22) : 1;
  left[sampleIndex] *= duck;
  right[sampleIndex] *= duck;
}

// Stereo multi-tap room: short early reflections plus a quiet long tail.
const dryLeft = left.slice();
const dryRight = right.slice();
const taps = [
  [0.071, 0.115, 0.22, 0.04],
  [0.137, 0.193, 0.16, -0.08],
  [0.263, 0.347, 0.11, 0.12],
  [0.487, 0.619, 0.07, -0.16],
];
for (const [leftDelay, rightDelay, gain, cross] of taps) {
  const leftSamples = Math.floor(leftDelay * SAMPLE_RATE);
  const rightSamples = Math.floor(rightDelay * SAMPLE_RATE);
  for (let sampleIndex = Math.max(leftSamples, rightSamples); sampleIndex < TOTAL; sampleIndex += 1) {
    left[sampleIndex] += dryLeft[sampleIndex - leftSamples] * gain + dryRight[sampleIndex - rightSamples] * cross;
    right[sampleIndex] += dryRight[sampleIndex - rightSamples] * gain + dryLeft[sampleIndex - leftSamples] * cross;
  }
}

// DC removal, gentle saturation and deterministic peak mastering.
let previousInputL = 0;
let previousInputR = 0;
let previousOutputL = 0;
let previousOutputR = 0;
let peak = 0;
for (let sampleIndex = 0; sampleIndex < TOTAL; sampleIndex += 1) {
  const inputL = left[sampleIndex];
  const inputR = right[sampleIndex];
  const filteredL = inputL - previousInputL + 0.995 * previousOutputL;
  const filteredR = inputR - previousInputR + 0.995 * previousOutputR;
  previousInputL = inputL;
  previousInputR = inputR;
  previousOutputL = filteredL;
  previousOutputR = filteredR;
  left[sampleIndex] = Math.tanh(filteredL * 1.28);
  right[sampleIndex] = Math.tanh(filteredR * 1.28);
  peak = Math.max(peak, Math.abs(left[sampleIndex]), Math.abs(right[sampleIndex]));
}
const masterGain = peak > 0 ? 0.86 / peak : 1;

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
let offset = 44;
for (let sampleIndex = 0; sampleIndex < TOTAL; sampleIndex += 1) {
  output.writeInt16LE(Math.round(clamp(left[sampleIndex] * masterGain) * 32767), offset);
  output.writeInt16LE(Math.round(clamp(right[sampleIndex] * masterGain) * 32767), offset + 2);
  offset += 4;
}
mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, output);
console.log(`Wrote ${OUTPUT} (${DURATION}s, ${BPM} BPM, ${SAMPLE_RATE}Hz stereo)`);
