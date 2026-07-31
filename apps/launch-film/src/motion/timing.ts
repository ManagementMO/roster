/**
 * Roster launch film — the timeline.
 *
 * One table owns every scene boundary in the film. Scenes read their own length
 * from here, the audio score reads its cue frames from here, and the QA tooling
 * derives its still frames from here — so a timing change is a one-line change
 * and can never desynchronise picture from sound.
 *
 * 60 fps · 3,480 frames · 58.00 s.
 */

export const FPS = 60;

/** The motion grammar. Durations in frames; every animation picks one band. */
export const BEAT = {
  /** Small UI response: a state flip, a label swap, a chip settling. */
  ui: 12,
  /** Local reveal: one line of copy, one card face, one label. */
  reveal: 20,
  /** Hero entrance: a Starting Five card arriving and locking. */
  hero: 34,
  /** Camera move: a push, a lateral drift, a rack focus. */
  camera: 96,
  /** Scene transition: the full handoff, wipe included. */
  transition: 54,
} as const;

export interface SceneSpec {
  id: string;
  /** Human title used in the shotlist, contact sheet and QA sheet. */
  title: string;
  /** Absolute start frame in the film. */
  from: number;
  /** Length in frames. */
  duration: number;
}

/** Ordered scene table. `from` values are absolute and contiguous. */
export const SCENES = [
  { id: "hook", title: "Hook", from: 0, duration: 180 },
  { id: "terminal", title: "Terminal", from: 180, duration: 420 },
  { id: "overload", title: "Overload", from: 600, duration: 420 },
  { id: "initialize", title: "Roster initialization", from: 1020, duration: 360 },
  { id: "search", title: "Search", from: 1380, duration: 480 },
  { id: "clearing", title: "Clearing", from: 1860, duration: 360 },
  { id: "startingFive", title: "Starting Five", from: 2220, duration: 360 },
  { id: "toolCall", title: "Tool call", from: 2580, duration: 240 },
  { id: "sixthMan", title: "Sixth Man", from: 2820, duration: 180 },
  { id: "coachLeague", title: "Coach and League", from: 3000, duration: 240 },
  { id: "reveal", title: "Final reveal", from: 3240, duration: 240 },
] as const satisfies readonly SceneSpec[];

export type SceneId = (typeof SCENES)[number]["id"];

export const DURATION_IN_FRAMES = SCENES.reduce((n, s) => Math.max(n, s.from + s.duration), 0);

/** Look a scene up by id. Throws rather than returning undefined — a missing
 *  scene id is always a typo, and a silent `undefined` would render a blank. */
export function scene(id: SceneId): SceneSpec {
  const found = SCENES.find((s) => s.id === id);
  if (!found) throw new Error(`unknown scene: ${id}`);
  return found;
}

/** Absolute frame `f` expressed relative to scene `id`. */
export function localFrame(id: SceneId, f: number): number {
  return f - scene(id).from;
}

/** Boundary frames between scenes — where the light wipes fire. */
export const BOUNDARIES: number[] = SCENES.slice(1).map((s) => s.from);

/** Entry / midpoint / exit frames for a scene, used by the stills + QA passes. */
export function sampleFrames(id: SceneId): { entry: number; mid: number; exit: number } {
  const s = scene(id);
  return {
    entry: s.from + Math.round(s.duration * 0.18),
    mid: s.from + Math.round(s.duration * 0.5),
    exit: s.from + Math.round(s.duration * 0.86),
  };
}

/** The poster frame: the brand mark fully resolved with the command visible. */
export const POSTER_FRAME = 3440;

/** The teaser cut: hook + lineup lock + reveal, retimed in `Teaser`. */
export const TEASER = {
  segments: [
    { from: 0, duration: 170 },
    { from: 2280, duration: 250 },
    { from: 3250, duration: 220 },
  ],
} as const;

export const TEASER_DURATION = TEASER.segments.reduce((n, s) => n + s.duration, 0);
