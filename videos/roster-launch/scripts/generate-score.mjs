import {mkdir, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const SAMPLE_RATE = 48_000;
const DURATION = 54;
const CHANNELS = 2;
const FRAME_COUNT = SAMPLE_RATE * DURATION;
const TAU = Math.PI * 2;
const left = new Float32Array(FRAME_COUNT);
const right = new Float32Array(FRAME_COUNT);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (value) => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

let noiseState = 0x524f5354;
const seededNoise = () => {
  noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
  return (noiseState / 0xffffffff) * 2 - 1;
};

const writeStereo = (index, value, pan = 0) => {
  if (index < 0 || index >= FRAME_COUNT) return;
  const safePan = clamp(pan, -1, 1);
  const angle = (safePan + 1) * Math.PI * 0.25;
  left[index] += value * Math.cos(angle);
  right[index] += value * Math.sin(angle);
};

const addTone = ({start, duration, frequency, amplitude, pan = 0, attack = 0.02, release = 0.2, harmonics = [1]}) => {
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const samples = Math.floor(duration * SAMPLE_RATE);
  for (let i = 0; i < samples; i += 1) {
    const time = i / SAMPLE_RATE;
    const attackEnvelope = smoothstep(time / Math.max(attack, 0.001));
    const releaseEnvelope = smoothstep((duration - time) / Math.max(release, 0.001));
    const envelope = attackEnvelope * releaseEnvelope;
    let sample = 0;
    for (let harmonicIndex = 0; harmonicIndex < harmonics.length; harmonicIndex += 1) {
      const harmonic = harmonics[harmonicIndex];
      sample += Math.sin(TAU * frequency * harmonic * time) / (harmonicIndex + 1);
    }
    writeStereo(startIndex + i, sample * amplitude * envelope, pan);
  }
};

const addPluck = ({start, frequency, amplitude = 0.15, pan = 0, duration = 0.42}) => {
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const samples = Math.floor(duration * SAMPLE_RATE);
  for (let i = 0; i < samples; i += 1) {
    const time = i / SAMPLE_RATE;
    const envelope = (1 - Math.exp(-time * 95)) * Math.exp(-time * 8.6);
    const pitch = frequency * (1 + 0.018 * Math.exp(-time * 18));
    const body = Math.sin(TAU * pitch * time) + 0.35 * Math.sin(TAU * pitch * 2.01 * time);
    const tactile = i < SAMPLE_RATE * 0.018 ? seededNoise() * Math.exp(-time * 110) * 0.34 : 0;
    writeStereo(startIndex + i, (body * 0.58 + tactile) * amplitude * envelope, pan);
  }
};

const addImpact = ({start, amplitude = 0.42, pan = 0, duration = 0.7}) => {
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const samples = Math.floor(duration * SAMPLE_RATE);
  for (let i = 0; i < samples; i += 1) {
    const time = i / SAMPLE_RATE;
    const envelope = Math.exp(-time * 7.3);
    const pitch = 82 * Math.exp(-time * 2.7) + 38;
    const sub = Math.sin(TAU * pitch * time) * envelope;
    const knock = seededNoise() * Math.exp(-time * 47) * 0.25;
    writeStereo(startIndex + i, (sub * 0.95 + knock) * amplitude, pan);
  }
};

const addTick = ({start, amplitude = 0.1, pan = 0, bright = 1}) => {
  const duration = 0.07;
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const samples = Math.floor(duration * SAMPLE_RATE);
  let previous = 0;
  for (let i = 0; i < samples; i += 1) {
    const time = i / SAMPLE_RATE;
    const current = seededNoise();
    const highPassed = current - previous * 0.82;
    previous = current;
    const envelope = Math.exp(-time * (70 + bright * 30));
    writeStereo(startIndex + i, highPassed * amplitude * envelope, pan);
  }
};

const addWhoosh = ({start, duration = 0.72, amplitude = 0.12, panFrom = -0.6, panTo = 0.6, reverse = false}) => {
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const samples = Math.floor(duration * SAMPLE_RATE);
  let low = 0;
  for (let i = 0; i < samples; i += 1) {
    const time = i / SAMPLE_RATE;
    const progress = time / duration;
    const shaped = Math.sin(Math.PI * progress) ** 1.5;
    const cutoff = reverse ? 0.015 + (1 - progress) * 0.2 : 0.015 + progress * 0.2;
    low += (seededNoise() - low) * cutoff;
    const airy = seededNoise() * (0.18 + progress * 0.25);
    const sample = (low * 1.5 + airy * 0.22) * shaped * amplitude;
    const pan = panFrom + (panTo - panFrom) * progress;
    writeStereo(startIndex + i, sample, pan);
  }
};

const addGlitch = ({start, duration = 0.24, amplitude = 0.19}) => {
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const samples = Math.floor(duration * SAMPLE_RATE);
  let held = 0;
  for (let i = 0; i < samples; i += 1) {
    const time = i / SAMPLE_RATE;
    if (i % 37 === 0) held = seededNoise();
    const gate = Math.floor(time * 48) % 3 === 0 ? 1 : 0.18;
    const envelope = Math.sin(Math.PI * (time / duration));
    writeStereo(startIndex + i, held * gate * envelope * amplitude, i % 2 === 0 ? -0.2 : 0.2);
  }
};

// A soft harmonic floor keeps the piece cohesive without becoming generic corporate music.
const harmonicSections = [
  [0, 10, [55, 82.41, 110]],
  [10, 23, [55, 73.42, 110]],
  [23, 36, [55, 82.41, 123.47]],
  [36, 46, [61.74, 92.5, 123.47]],
  [46, 54, [55, 82.41, 146.83]],
];
for (const [start, end, chord] of harmonicSections) {
  for (let voice = 0; voice < chord.length; voice += 1) {
    addTone({
      start,
      duration: end - start,
      frequency: chord[voice],
      amplitude: voice === 0 ? 0.047 : 0.022,
      pan: (voice - 1) * 0.34,
      attack: 0.55,
      release: 0.75,
      harmonics: voice === 0 ? [1, 2] : [1],
    });
  }
}

const beat = 60 / 126;
const notes = [220, 246.94, 293.66, 329.63, 293.66, 246.94, 220, 196];
for (let index = 0; index < Math.floor(DURATION / beat); index += 1) {
  const start = index * beat;
  const sceneEnergy = start < 4 ? 0.72 : start < 10 ? 0.88 : start < 23 ? 0.72 : start < 36 ? 1 : start < 46 ? 0.86 : 0.78;
  if (index % 2 === 0 || (start >= 23 && start < 36)) {
    addPluck({
      start,
      frequency: notes[index % notes.length],
      amplitude: 0.105 * sceneEnergy,
      pan: ((index % 5) - 2) * 0.19,
      duration: index % 4 === 0 ? 0.48 : 0.32,
    });
  }
  if (index % 2 === 1 && start >= 10 && start < 50) {
    addTick({start: start + beat * 0.5, amplitude: 0.038 * sceneEnergy, pan: index % 4 < 2 ? -0.38 : 0.38, bright: 0.5});
  }
}

const impacts = [0.32, 2.12, 4, 10, 16, 23, 29, 30.05, 30.82, 31.59, 32.36, 33.13, 36, 41, 44.15, 46, 50, 51.1];
for (let index = 0; index < impacts.length; index += 1) {
  addImpact({start: impacts[index], amplitude: index === 0 || impacts[index] === 29 || impacts[index] === 50 ? 0.46 : 0.25, pan: ((index % 3) - 1) * 0.16});
}

const seams = [3.72, 9.7, 15.7, 22.7, 28.65, 35.72, 40.72, 45.72, 49.65];
for (let index = 0; index < seams.length; index += 1) {
  addWhoosh({start: seams[index], duration: index === 4 || index === 8 ? 0.72 : 0.52, amplitude: index === 4 || index === 8 ? 0.15 : 0.085, panFrom: 0.55, panTo: -0.55});
}

for (let time = 4.55; time < 7.25; time += 0.135) {
  addTick({start: time, amplitude: 0.045, pan: ((Math.floor(time * 100) % 7) - 3) / 8, bright: 1.4});
}

for (let time = 16.3; time < 22.35; time += 0.72) {
  addWhoosh({start: time, duration: 0.48, amplitude: 0.05, panFrom: 0.7, panTo: -0.7, reverse: Math.floor(time) % 2 === 0});
}

addGlitch({start: 41.86, duration: 0.28, amplitude: 0.18});
addImpact({start: 44.35, amplitude: 0.31, pan: 0.25});
addWhoosh({start: 49.78, duration: 1.05, amplitude: 0.18, panFrom: -0.1, panTo: 0.1});

// The identity resolves into a clean, warm major-sixth chord and holds.
for (const [frequency, pan, amplitude] of [[220, -0.25, 0.055], [277.18, 0.2, 0.043], [329.63, -0.05, 0.038], [440, 0.32, 0.027]]) {
  addTone({start: 50.25, duration: 3.65, frequency, amplitude, pan, attack: 0.14, release: 1.3, harmonics: [1, 2]});
}

// Gentle master curve, transparent limiting, and intentional head/tail fades.
let peak = 0;
for (let i = 0; i < FRAME_COUNT; i += 1) {
  const time = i / SAMPLE_RATE;
  const fadeIn = smoothstep(time / 0.18);
  const fadeOut = smoothstep((DURATION - time) / 0.42);
  left[i] = Math.tanh(left[i] * 1.55) * fadeIn * fadeOut;
  right[i] = Math.tanh(right[i] * 1.55) * fadeIn * fadeOut;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const gain = peak > 0 ? 0.89 / peak : 1;

const bytesPerSample = 2;
const dataSize = FRAME_COUNT * CHANNELS * bytesPerSample;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(CHANNELS, 22);
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28);
buffer.writeUInt16LE(CHANNELS * bytesPerSample, 32);
buffer.writeUInt16LE(bytesPerSample * 8, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(dataSize, 40);

for (let i = 0; i < FRAME_COUNT; i += 1) {
  const offset = 44 + i * 4;
  buffer.writeInt16LE(Math.round(clamp(left[i] * gain, -1, 1) * 32767), offset);
  buffer.writeInt16LE(Math.round(clamp(right[i] * gain, -1, 1) * 32767), offset + 2);
}

const scriptPath = fileURLToPath(import.meta.url);
const outputPath = resolve(dirname(scriptPath), "../assets/audio/roster-score.wav");
await mkdir(dirname(outputPath), {recursive: true});
await writeFile(outputPath, buffer);
console.log(`Wrote ${outputPath} (${DURATION}s, ${SAMPLE_RATE} Hz stereo, peak ${peak.toFixed(3)})`);
