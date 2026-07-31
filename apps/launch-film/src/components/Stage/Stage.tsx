/**
 * The set.
 *
 * One warm-white room, lit once, that every scene is staged inside. Grain and
 * vignette live here rather than per-scene so the paper never changes texture
 * across an edit — that consistency is most of what makes eleven scenes read as
 * one film.
 */
import type React from "react";
import { AbsoluteFill } from "remotion";
import { FILTER, GRAIN_SEED, grainStyle, vignetteStyle } from "../../design/effects";
import { roomBackground } from "../../design/lighting";

export const Stage: React.FC<{
  children: React.ReactNode;
  /** Dial the vignette back for wide, airy scenes; up for intimate ones. */
  vignette?: number;
  grain?: number;
}> = ({ children, vignette = 1, grain = 0.024 }) => {
  return (
    <AbsoluteFill style={{ background: roomBackground(), overflow: "hidden" }}>
      {children}
      <AbsoluteFill style={vignetteStyle(vignette)} />
      <Grain opacity={grain} />
    </AbsoluteFill>
  );
};

/**
 * Photographic grain from a fixed-seed turbulence. Rendered once and composited
 * in multiply — deterministic, and cheap because the filter never re-evaluates.
 */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.024 }) => (
  <svg
    aria-hidden="true"
    style={grainStyle(opacity)}
    width="1920"
    height="1080"
    viewBox="0 0 1920 1080"
    preserveAspectRatio="none"
  >
    <filter id={FILTER.grain} x="0" y="0" width="100%" height="100%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.82"
        numOctaves={3}
        stitchTiles="stitch"
        seed={GRAIN_SEED}
        result="noise"
      />
      <feColorMatrix
        in="noise"
        type="matrix"
        values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.6 0"
      />
    </filter>
    <rect width="1920" height="1080" filter={`url(#${FILTER.grain})`} />
  </svg>
);

/**
 * Shared SVG defs — the two soft glows the whole film draws with. Declared once
 * at the film root so every scene's SVG can reference them by id.
 */
export const StageDefs: React.FC = () => (
  <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
    <defs>
      <filter id={FILTER.softGlow} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="9" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={FILTER.ribbonGlow} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="5" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={FILTER.prismGlow} x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation="17" />
      </filter>
    </defs>
  </svg>
);
