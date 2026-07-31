/**
 * Roster launch film — transitions.
 *
 * Scenes are contiguous, not overlapping. The handoff is made of three things
 * happening at once, which together occupy 40–60 frames:
 *
 *   1. the outgoing scene's content departs (lift + soften),
 *   2. a soft white light wipe crosses the frame at the boundary,
 *   3. the incoming scene's content arrives (settle + focus).
 *
 * Because the ground is warm white in every scene, the wipe reads as the room
 * light flaring rather than as an edit — which is the point.
 */
import { interpolate } from "remotion";
import { clamp, ease } from "./easings";

/** Frames the wipe occupies, centred on the boundary. */
export const WIPE_FRAMES = 40;

/** Frames a scene spends arriving and departing. */
export const SCENE_IN = 26;
export const SCENE_OUT = 24;

export interface SceneEnvelope {
  opacity: number;
  scale: number;
  blur: number;
  lift: number;
}

/**
 * The envelope applied to a scene's whole content group. Local `frame` is
 * scene-relative; `duration` is the scene's own length.
 */
export function sceneEnvelope(frame: number, duration: number): SceneEnvelope {
  const opacity = interpolate(
    frame,
    [0, SCENE_IN, duration - SCENE_OUT, duration],
    [0, 1, 1, 0],
    { ...clamp, easing: ease.glide },
  );
  const scale = interpolate(
    frame,
    [0, SCENE_IN, duration - SCENE_OUT, duration],
    [0.986, 1, 1, 1.012],
    { ...clamp, easing: ease.glide },
  );
  const blur = interpolate(
    frame,
    [0, SCENE_IN * 0.8, duration - SCENE_OUT, duration],
    [7, 0, 0, 6],
    { ...clamp, easing: ease.glide },
  );
  const lift = interpolate(
    frame,
    [0, SCENE_IN, duration - SCENE_OUT, duration],
    [16, 0, 0, -12],
    { ...clamp, easing: ease.glide },
  );
  return { opacity, scale, blur, lift };
}

/**
 * Wipe intensity at an absolute frame given the boundary frames. Returns 0 for
 * the long stretches between boundaries so the overlay costs nothing to composite.
 */
export function wipeAt(frame: number, boundaries: readonly number[]): { progress: number; intensity: number } {
  for (const b of boundaries) {
    const start = b - WIPE_FRAMES / 2;
    const end = b + WIPE_FRAMES / 2;
    if (frame >= start && frame <= end) {
      const progress = interpolate(frame, [start, end], [0, 1], { ...clamp, easing: ease.glide });
      const intensity = interpolate(
        frame,
        [start, b - 5, b + 5, end],
        [0, 0.5, 0.5, 0],
        { ...clamp, easing: ease.glide },
      );
      return { progress, intensity };
    }
  }
  return { progress: 0, intensity: 0 };
}

/**
 * Some handoffs are *continuations*, not cuts — the terminal output becoming the
 * tool field, or the lineup collapsing into the brand mark. Those boundaries get
 * a much fainter wipe so the physical continuity stays legible.
 */
export const CONTINUATION_BOUNDARIES: readonly number[] = [600, 2220, 3240];

/** Multiplier applied to a wipe at a continuation boundary. */
export function wipeStrength(frame: number, boundaries: readonly number[]): number {
  const nearest = boundaries.reduce(
    (best, b) => (Math.abs(b - frame) < Math.abs(best - frame) ? b : best),
    boundaries[0] ?? 0,
  );
  return CONTINUATION_BOUNDARIES.includes(nearest) ? 0.34 : 1;
}
