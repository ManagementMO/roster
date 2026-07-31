/**
 * Roster launch film — easing.
 *
 * Four curves do all the work. Naming them by intent rather than by control
 * points is what keeps eleven scenes feeling like one hand: an object that
 * arrives always arrives on `arrive`, an object that leaves always leaves on
 * `depart`, and nothing in the film uses `linear` except light travelling along
 * a path (where constant speed is physically correct).
 */
import { Easing } from "remotion";

export const ease = {
  /** Objects entering frame. Fast out of the gate, long luxurious settle. */
  arrive: Easing.bezier(0.16, 1, 0.3, 1),
  /** Objects leaving. Reluctant start, decisive exit. */
  depart: Easing.bezier(0.7, 0, 0.84, 0),
  /** Both ends eased. Camera moves, scale changes, opacity crossfades. */
  glide: Easing.bezier(0.62, 0.02, 0.2, 1),
  /** Mechanical snap for locks and state flips. Slight bite at the end. */
  snap: Easing.bezier(0.34, 1.24, 0.4, 1),
  /** Constant. Light packets travelling a ribbon; nothing else. */
  linear: Easing.linear,
  /** Slow, weightless drift for the background field. */
  drift: Easing.bezier(0.44, 0.06, 0.4, 0.96),
} as const;

/**
 * Interpolation defaults every call in the film shares. Clamping on both ends is
 * non-negotiable: an un-clamped `interpolate` is how a card silently flies off
 * screen twenty frames after its scene ended.
 */
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
