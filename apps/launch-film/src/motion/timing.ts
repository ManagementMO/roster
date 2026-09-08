import { interpolate } from "remotion";
import { EASE } from "./easings";

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

export const enter = (frame: number, from: number, duration: number): number =>
  interpolate(frame, [from, from + duration], [0, 1], {
    easing: EASE.cinematic,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export const exit = (frame: number, from: number, duration: number): number =>
  interpolate(frame, [from, from + duration], [0, 1], {
    easing: EASE.accelerate,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export const pulse = (frame: number, period: number, phase = 0): number =>
  0.5 + 0.5 * Math.sin(((frame + phase) / period) * Math.PI * 2);

export const rangeProgress = (frame: number, from: number, to: number): number =>
  interpolate(frame, [from, to], [0, 1], {
    easing: EASE.inOut,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
