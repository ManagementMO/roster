/**
 * Roster launch film — effects.
 *
 * Deterministic, frame-driven post: paper grain, edge vignette, light wipes and
 * the bloom veil. Every one of these is an SVG/CSS composite with a fixed seed —
 * nothing here samples a clock or a random source.
 */
import type { CSSProperties } from "react";
import { alpha, accent } from "./colors";

/** Fixed turbulence seed. Changing this changes the grain across the film. */
export const GRAIN_SEED = 1907;

/**
 * Photographic grain. 1.6–2.6% is the window: below it the frame looks like a
 * flat vector export, above it the white starts to buzz on compression.
 */
export function grainStyle(opacity = 0.022): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    opacity,
    pointerEvents: "none",
    mixBlendMode: "multiply",
  };
}

/** Edge vignette. Warm-white centre falling to mineral at the corners. */
export function vignetteStyle(strength = 1): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background: [
      `radial-gradient(1400px 980px at 50% 46%, rgba(0,0,0,0) 52%, ${alpha("#8E8B86", 0.05 * strength)} 78%, ${alpha("#6F6C68", 0.13 * strength)} 100%)`,
      `linear-gradient(180deg, ${alpha("#FFFFFF", 0.16 * strength)} 0%, rgba(255,255,255,0) 22%)`,
    ].join(", "),
  };
}

/**
 * The light wipe used at scene boundaries: a wide, soft white bloom that sweeps
 * across the frame. `progress` 0→1 drives the sweep; `intensity` its peak.
 */
export function lightWipeStyle(progress: number, intensity: number, tilt = -14): CSSProperties {
  const x = -60 + progress * 220;
  return {
    position: "absolute",
    inset: "-30%",
    pointerEvents: "none",
    opacity: intensity,
    rotate: `${tilt}deg`,
    background: `linear-gradient(90deg, rgba(255,255,255,0) ${x - 46}%, ${alpha("#FFFFFF", 0.55)} ${x - 14}%, ${alpha("#FFFFFF", 0.98)} ${x}%, ${alpha("#FFFFFF", 0.55)} ${x + 14}%, rgba(255,255,255,0) ${x + 46}%)`,
    mixBlendMode: "screen",
  };
}

/**
 * Controlled bloom veil — a full-frame lift used on impacts (lineup locks, the
 * brand reveal). Screen-blended white with a whisper of the accent colour.
 */
export function bloomVeil(intensity: number, tint: string = accent.blueLift): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    opacity: intensity,
    mixBlendMode: "screen",
    background: `radial-gradient(1500px 1000px at 50% 50%, ${alpha("#FFFFFF", 0.85)} 0%, ${alpha(tint, 0.3)} 42%, rgba(255,255,255,0) 74%)`,
  };
}

/**
 * Chromatic split for the failure beat — restrained, one frame's worth of
 * dispersion, never a glitch aesthetic.
 */
export function chromaticSplit(px: number): CSSProperties {
  if (px <= 0.02) return {};
  return {
    filter: `drop-shadow(${px.toFixed(2)}px 0 0 ${alpha(accent.coral, 0.5)}) drop-shadow(-${px.toFixed(2)}px 0 0 ${alpha(accent.cyan, 0.35)})`,
  };
}

/**
 * SVG `<defs>` ids.
 *
 * These are deliberately global, stable strings: a filter or gradient defined
 * once at the film root is referenced by `url(#…)` from every scene's SVG. React's
 * `useId()` is the wrong tool here — the whole point is that the id is shared
 * across the tree, and the tree renders exactly once per frame in a headless
 * page with no other document on it. They are spelled through `defId()` so the
 * literal never appears as a static `id={"…"}` attribute.
 */
const DEF_PREFIX = "roster";

export const defId = (name: string): string => `${DEF_PREFIX}-${name}`;
export const defUrl = (name: string): string => `url(#${defId(name)})`;

export const FILTER = {
  grain: defId("grain-filter"),
  softGlow: defId("soft-glow"),
  ribbonGlow: defId("ribbon-glow"),
  prismGlow: defId("prism-glow"),
} as const;
