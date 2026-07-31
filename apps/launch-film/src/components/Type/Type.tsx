/**
 * Editorial type components.
 *
 * Scenes never write font declarations. They ask for an `<Eyebrow>` or a
 * `<Headline>` and get the one from the scale, which is how the film keeps a
 * single typographic voice across eleven very different compositions.
 */
import type React from "react";
import type { CSSProperties } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { alpha, ink } from "../../design/colors";
import { type as T, trackedCentering } from "../../design/typography";
import { clamp, ease } from "../../motion/easings";

/** A reveal that lifts and un-blurs. The film's default way to bring copy in. */
export function riseIn(frame: number, delay: number, distance = 26, span = 24): CSSProperties {
  const f = frame - delay;
  return {
    opacity: interpolate(f, [0, span], [0, 1], { ...clamp, easing: ease.arrive }),
    translate: `0px ${interpolate(f, [0, span], [distance, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px`,
    filter: `blur(${interpolate(f, [0, span * 0.7], [7, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px)`,
  };
}

export const Eyebrow: React.FC<{
  children: React.ReactNode;
  delay?: number;
  color?: string;
  style?: CSSProperties;
}> = ({ children, delay = 0, color, style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        ...T.eyebrow,
        ...(color ? { color } : {}),
        ...trackedCentering("0.20em"),
        ...riseIn(frame, delay, 16, 20),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Headline: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: "display" | "headline" | "title";
  style?: CSSProperties;
}> = ({ children, delay = 0, size = "headline", style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ ...T[size], ...riseIn(frame, delay, 30, 28), ...style }}>{children}</div>
  );
};

export const Lede: React.FC<{
  children: React.ReactNode;
  delay?: number;
  maxWidth?: number;
  style?: CSSProperties;
}> = ({ children, delay = 0, maxWidth = 760, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ ...T.lede, maxWidth, ...riseIn(frame, delay, 22, 24), ...style }}>{children}</div>
  );
};

/**
 * The eyebrow's companion: a short accent rule that anchors a text block to the
 * grid. Two pixels, never one — a hairline vanishes at preview scale.
 */
export const AccentRule: React.FC<{ delay?: number; color?: string; width?: number }> = ({
  delay = 0,
  color = ink.hair,
  width = 78,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        height: 3,
        borderRadius: 3,
        background: `linear-gradient(90deg, ${color} 0%, ${alpha(color, 0)} 100%)`,
        width: interpolate(frame - delay, [0, 26], [0, width], { ...clamp, easing: ease.arrive }),
        opacity: interpolate(frame - delay, [0, 12], [0, 1], clamp),
      }}
    />
  );
};

/**
 * A small all-caps status chip. Decorative by design — it repeats a state the
 * frame already shows geometrically, so it is never the only carrier of meaning.
 */
export const StateChip: React.FC<{
  label: string;
  color: string;
  delay?: number;
  style?: CSSProperties;
}> = ({ label, color, delay = 0, style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        ...T.chip,
        color,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 16px 9px 14px",
        borderRadius: 999,
        background: alpha(color, 0.09),
        boxShadow: `inset 0 0 0 2px ${alpha(color, 0.34)}`,
        ...riseIn(frame, delay, 10, 14),
        ...style,
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: 9, background: color, display: "block" }} />
      {label}
    </div>
  );
};
