/**
 * Audio cue table.
 *
 * The score is synthesised offline by `scripts/generate-audio.mjs`, which
 * imports this exact table — so picture and sound cannot drift. Every frame
 * number here is derived from `motion/timing.ts`, never typed twice.
 *
 * Frames → seconds at 60 fps.
 */
import { FPS, scene } from "../motion/timing";

export type CueKind =
  | "ambient"
  | "type"
  | "tension"
  | "shift"
  | "scan"
  | "fragment"
  | "impact"
  | "request"
  | "return"
  | "failure"
  | "sixth"
  | "identity";

export interface Cue {
  kind: CueKind;
  /** Absolute frame. */
  frame: number;
  /** Length in frames, for sustained cues. */
  length?: number;
  /** 0→1 relative level before normalisation. */
  gain?: number;
  /** Pitch handle in semitones relative to the cue's own root. */
  detune?: number;
}

const terminal = scene("terminal");
const overload = scene("overload");
const initialize = scene("initialize");
const search = scene("search");
const clearing = scene("clearing");
const five = scene("startingFive");
const call = scene("toolCall");
const sixth = scene("sixthMan");
const coach = scene("coachLeague");
const reveal = scene("reveal");

/** Terminal typing: one tick per typed character, matching FRAMES_PER_CHAR=2.4. */
const typingCues: Cue[] = Array.from({ length: 11 }, (_, i) => ({
  kind: "type" as const,
  frame: terminal.from + 34 + Math.round(i * 2.4),
  gain: 0.5 + (i % 3) * 0.08,
  detune: (i % 5) - 2,
}));

/** Receipt lines printing — a softer, lower tick per line. */
const receiptCues: Cue[] = Array.from({ length: 8 }, (_, i) => ({
  kind: "type" as const,
  frame: terminal.from + 118 + i * 7,
  gain: 0.3,
  detune: -7 + (i % 3),
}));

/** The five lineup locks. Mirrors START_AT in S07StartingFive. */
const LINEUP_LOCK_ORDER = [2, 1, 0, 3, 4];
const lineupCues: Cue[] = LINEUP_LOCK_ORDER.map((_, order) => ({
  kind: "impact" as const,
  frame: five.from + 44 + order * 26 + 28,
  gain: 0.72 + order * 0.045,
  detune: [0, -5, -7, 4, 7][order] ?? 0,
}));

export const CUES: readonly Cue[] = [
  // A single quiet bed under the whole film.
  { kind: "ambient", frame: 0, length: 3480, gain: 0.3 },

  // 2 · terminal
  ...typingCues,
  ...receiptCues,
  { kind: "shift", frame: terminal.from + 326, gain: 0.4, detune: 5 },

  // 3 · overload — tension builds under the field
  { kind: "tension", frame: overload.from - 20, length: 440, gain: 0.55 },

  // 4 · initialization — the clean resolve
  { kind: "shift", frame: initialize.from + 56, gain: 0.85 },
  { kind: "impact", frame: initialize.from + 100, gain: 0.5, detune: -12 },

  // 5 · search — two sweeps
  { kind: "scan", frame: search.from + 40, length: 160, gain: 0.6 },
  { kind: "scan", frame: search.from + 236, length: 164, gain: 0.72, detune: 5 },
  { kind: "type", frame: search.from + 92, gain: 0.34, detune: 7 },
  { kind: "type", frame: search.from + 184, gain: 0.34, detune: 9 },
  { kind: "type", frame: search.from + 276, gain: 0.34, detune: 11 },
  { kind: "type", frame: search.from + 368, gain: 0.34, detune: 12 },

  // 6 · clearing — three rejections
  { kind: "fragment", frame: clearing.from + 0, gain: 0.6 },
  { kind: "fragment", frame: clearing.from + 26, gain: 0.55, detune: -3 },
  { kind: "fragment", frame: clearing.from + 52, gain: 0.5, detune: -6 },

  // 7 · the lineup
  ...lineupCues,

  // 8 · the round trip
  { kind: "request", frame: call.from + 26, gain: 0.6 },
  { kind: "request", frame: call.from + 78, gain: 0.55, detune: 4 },
  { kind: "return", frame: call.from + 132, gain: 0.65 },

  // 9 · the Sixth Man
  { kind: "failure", frame: sixth.from + 10, gain: 0.62 },
  { kind: "sixth", frame: sixth.from + 54, gain: 0.6 },
  { kind: "impact", frame: sixth.from + 118, gain: 0.45, detune: 7 },

  // 10 · coach + league
  { kind: "type", frame: coach.from + 78, gain: 0.35, detune: 3 },
  { kind: "shift", frame: coach.from + 122, gain: 0.4, detune: -3 },

  // 11 · the identity
  { kind: "identity", frame: reveal.from + 72, gain: 1 },
];

/** Total score length in seconds, with a short tail past the last frame. */
export const SCORE_SECONDS = 3480 / FPS + 0.6;
export const SAMPLE_RATE = 44100;
export const SCORE_FILE = "audio/roster-launch-score.wav";
