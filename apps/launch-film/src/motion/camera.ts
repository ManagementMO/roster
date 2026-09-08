import { interpolate } from "remotion";
import { EASE } from "./easings";

export type CameraState = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly roll: number;
};

export const cameraPush = (frame: number, from: number, to: number, distance: number): number =>
  interpolate(frame, [from, to], [0, distance], {
    easing: EASE.inOut,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export const ambientCamera = (frame: number): CameraState => ({
  x: Math.sin(frame / 173) * 13,
  y: Math.cos(frame / 211) * 8,
  z: Math.sin(frame / 251) * 10,
  yaw: Math.sin(frame / 221) * 0.7,
  roll: Math.sin(frame / 307) * 0.18,
});
