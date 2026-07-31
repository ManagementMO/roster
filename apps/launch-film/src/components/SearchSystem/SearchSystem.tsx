/**
 * The search system.
 *
 * `draft(need)` is the moment the product becomes intelligible, so it gets a
 * physical metaphor rather than a spinner: a plane of light travels through the
 * space, and whatever it passes gains or loses substance. The four ranking
 * signals are announced one at a time in large type — one idea per moment —
 * instead of being crammed into a metadata panel nobody can read.
 *
 * An `EvaluationRing` (a thin arc completing around each candidate's glyph) lived
 * here through the first pass and was deleted: on the rendered frames it was the
 * closest thing in the film to HUD chrome, and the scan plane plus the card state
 * changes already say "this is being evaluated".
 */
import type React from "react";
import { interpolate } from "remotion";
import { accent, alpha, ink } from "../../design/colors";
import { MONO, type as T } from "../../design/typography";
import { clamp, ease } from "../../motion/easings";

/**
 * The scan plane. A soft light sheet with a bright leading edge, skewed slightly
 * so it reads as a plane in space rather than a bar on the screen.
 */
export const ScanPlane: React.FC<{
  /** 0→1 across the frame, left to right. */
  progress: number;
  /** Overall strength. */
  intensity?: number;
  tint?: string;
}> = ({ progress, intensity = 1, tint = accent.violet }) => {
  const x = interpolate(progress, [0, 1], [-260, 2180], clamp);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: intensity }}>
      {/* the volume of light the plane carries with it */}
      <div
        style={{
          position: "absolute",
          left: x - 320,
          top: -160,
          width: 640,
          height: 1400,
          transform: "skewX(-6deg)",
          background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${alpha(tint, 0.06)} 38%, ${alpha("#FFFFFF", 0.5)} 78%, ${alpha(tint, 0.16)} 100%)`,
          mixBlendMode: "screen",
          filter: "blur(14px)",
        }}
      />
      {/* the leading edge — the only hard line in the effect */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: -160,
          width: 5,
          height: 1400,
          transform: "skewX(-6deg)",
          background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, ${alpha("#FFFFFF", 0.95)} 22%, ${alpha(tint, 0.9)} 52%, ${alpha("#FFFFFF", 0.9)} 78%, rgba(255,255,255,0) 100%)`,
          boxShadow: `0 0 34px ${alpha(tint, 0.6)}, 0 0 90px ${alpha(tint, 0.28)}`,
        }}
      />
    </div>
  );
};

/**
 * How much a point at `x` has been "resolved" by a scan plane at `progress`.
 * 0 before the plane arrives, 1 once it has passed. Objects use this to gain
 * substance — the plane is causal, not decorative.
 */
export function scanResolve(x: number, progress: number, softness = 190): number {
  const planeX = interpolate(progress, [0, 1], [-260, 2180], clamp);
  return interpolate(planeX - x, [-softness, softness], [0, 1], clamp);
}

export interface Signal {
  key: string;
  label: string;
  detail: string;
}

/**
 * The signal readout: one criterion at a time, set large, with a filling bar of
 * *evidence* rather than a progress bar — it grows to the width of the label and
 * stops, so it never implies a percentage the product does not measure.
 */
export const SignalReadout: React.FC<{
  signals: readonly Signal[];
  /** Local frame. */
  frame: number;
  /** Frame the first signal appears. */
  start: number;
  /** Frames each signal holds. */
  hold: number;
  x: number;
  y: number;
}> = ({ signals, frame, start, hold, x, y }) => {
  const index = Math.max(0, Math.min(signals.length - 1, Math.floor((frame - start) / hold)));
  const local = frame - start - index * hold;
  const current = signals[index];
  if (!current || frame < start) return null;

  const inOp = interpolate(local, [0, 14], [0, 1], { ...clamp, easing: ease.arrive });
  const outOp = interpolate(local, [hold - 12, hold], [1, 0], { ...clamp, easing: ease.glide });
  const opacity = Math.min(inOp, outOp);

  return (
    <div style={{ position: "absolute", left: x, top: y, width: 720 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          opacity,
          translate: `0px ${interpolate(local, [0, 16], [16, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px`,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 24,
            fontWeight: 700,
            color: accent.violet,
            letterSpacing: "0.12em",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span style={{ ...T.title, fontSize: 52, color: ink.strong }}>{current.label}</span>
      </div>
      <div
        style={{
          height: 3,
          borderRadius: 3,
          marginTop: 14,
          background: `linear-gradient(90deg, ${accent.violet} 0%, ${alpha(accent.violet, 0)} 100%)`,
          width: interpolate(local, [4, 26], [0, 420], { ...clamp, easing: ease.arrive }),
          opacity,
        }}
      />
      <div
        style={{
          ...T.support,
          fontSize: 26,
          marginTop: 16,
          maxWidth: 620,
          opacity: opacity * interpolate(local, [10, 26], [0, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        {current.detail}
      </div>
    </div>
  );
};
