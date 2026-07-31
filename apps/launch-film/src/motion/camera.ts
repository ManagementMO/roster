/**
 * Roster launch film — camera.
 *
 * The film is shot on one virtual camera that only ever does four things: push,
 * pull, drift laterally, and rack focus. No shake, no roll, no whip. The camera
 * is a CSS transform applied to a single wrapper per scene, so parallax comes
 * from children declaring a `depth` rather than from bespoke per-element maths.
 */
import type { CSSProperties } from "react";
import { interpolate } from "remotion";
import { clamp, ease } from "./easings";

export interface CameraState {
  /** 1 = neutral framing. >1 pushes in. */
  zoom: number;
  /** Frame-space pan, in px, at the neutral depth plane. */
  x: number;
  y: number;
  /** Focal plane, 0 (near) → 1 (far). Objects away from it defocus. */
  focus: number;
}

export const NEUTRAL: CameraState = { zoom: 1, x: 0, y: 0, focus: 0 };

/**
 * Interpolate the camera along a keyframed move. Keys are `[frame, state]`
 * pairs; between them everything eases on `glide`, which is the only curve the
 * camera is allowed to use.
 */
export function cameraAt(frame: number, keys: readonly (readonly [number, CameraState])[]): CameraState {
  if (keys.length === 0) return NEUTRAL;
  const frames = keys.map((k) => k[0]);
  const pick = (get: (s: CameraState) => number) =>
    interpolate(frame, frames, keys.map((k) => get(k[1])), { ...clamp, easing: ease.glide });
  return {
    zoom: pick((s) => s.zoom),
    x: pick((s) => s.x),
    y: pick((s) => s.y),
    focus: pick((s) => s.focus),
  };
}

/**
 * The wrapper transform. `depth` 0 sits on the focal plane at neutral; higher
 * depths move less (parallax) and scale less, exactly as a longer throw would.
 */
export function cameraStyle(cam: CameraState, depth = 0): CSSProperties {
  const parallax = 1 - depth * 0.62;
  const zoom = 1 + (cam.zoom - 1) * parallax;
  return {
    translate: `${(cam.x * parallax).toFixed(2)}px ${(cam.y * parallax).toFixed(2)}px`,
    scale: zoom,
    transformOrigin: "50% 50%",
    willChange: "transform",
  };
}

/**
 * Rack focus: how much blur an object at `depth` receives when the camera is
 * focused at `cam.focus`. Capped at 14px — past that it stops reading as
 * defocus and starts reading as a bug.
 */
export function rackFocus(cam: CameraState, depth: number, strength = 16): number {
  return Math.min(14, Math.abs(depth - cam.focus) * strength);
}

/**
 * A slow, continuous breathing push used under long static beats so no shot in
 * the film is ever completely dead. Amplitude is deliberately sub-perceptual.
 */
export function breathe(frame: number, period = 340, amount = 0.008): number {
  return 1 + Math.sin((frame / period) * Math.PI * 2) * amount;
}
