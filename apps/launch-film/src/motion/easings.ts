import { Easing } from "remotion";

export const EASE = {
  cinematic: Easing.bezier(0.16, 1, 0.3, 1),
  settle: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  sharp: Easing.bezier(0.2, 0.9, 0.25, 1),
  accelerate: Easing.bezier(0.55, 0, 1, 0.45),
  impact: Easing.bezier(0.18, 1.38, 0.38, 1),
} as const;
