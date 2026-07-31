/**
 * Roster launch film — springs.
 *
 * Three physical characters, used consistently:
 *  · `heavy`   — hero objects. Real mass, one barely-perceptible overshoot.
 *  · `precise` — UI state changes. Critically damped, no overshoot at all.
 *  · `quick`   — small responses. Light, fast, settles inside 12 frames.
 */
import { spring } from "remotion";

export const springs = {
  heavy: { damping: 22, mass: 1.15, stiffness: 92 },
  precise: { damping: 200, mass: 1, stiffness: 140 },
  quick: { damping: 26, mass: 0.5, stiffness: 210 },
  lock: { damping: 17, mass: 0.9, stiffness: 155 },
} as const;

export type SpringName = keyof typeof springs;

/** A 0→1 spring driven by the current frame, delayed by `delay` frames. */
export function springAt(frame: number, fps: number, name: SpringName, delay = 0): number {
  return spring({ frame: frame - delay, fps, config: springs[name], durationInFrames: undefined });
}

/**
 * A spring that maps onto a value range. Kept here rather than inline so the
 * scenes never re-derive the same three configs by hand.
 */
export function springRange(
  frame: number,
  fps: number,
  name: SpringName,
  from: number,
  to: number,
  delay = 0,
): number {
  return from + (to - from) * springAt(frame, fps, name, delay);
}
