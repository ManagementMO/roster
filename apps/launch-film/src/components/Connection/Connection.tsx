/**
 * Connections.
 *
 * Roster routes calls, so the film has to draw routing. It draws it as tapered
 * glass ribbons — filled paths, never strokes — because a stroked bezier reads
 * as a network diagram and a tapered ribbon reads as flow. Ribbons are wide
 * where they leave the prism and narrow where they meet a card, which gives the
 * frame a direction to read even with the sound off.
 *
 * There are exactly six variants and no dotted lines outside `suggested`, where
 * the dash is load-bearing: it is what says "not connected yet".
 */
import type React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { accent, alpha, ink } from "../../design/colors";
import { defUrl } from "../../design/effects";
import { clamp, ease } from "../../motion/easings";
import { centerline, cubic, cubicTangent, type Point, radialCurve, ribbonPath } from "../../lib/geometry";

export type ConnectionVariant =
  | "dormant"
  | "selected"
  | "request"
  | "return"
  | "broken"
  | "suggested";

const VARIANT: Record<
  ConnectionVariant,
  { from: string; to: string; width: number; opacity: number; glow: boolean }
> = {
  dormant: { from: ink.hair, to: ink.hair, width: 7, opacity: 0.34, glow: false },
  selected: { from: accent.blue, to: accent.violet, width: 18, opacity: 0.92, glow: true },
  request: { from: accent.blue, to: accent.blueLift, width: 24, opacity: 0.95, glow: true },
  return: { from: accent.cyan, to: accent.cyanLift, width: 22, opacity: 0.92, glow: true },
  broken: { from: accent.coral, to: accent.coralLift, width: 20, opacity: 0.95, glow: true },
  suggested: { from: accent.violet, to: accent.violetLift, width: 15, opacity: 0.6, glow: false },
};

export interface ConnectionProps {
  from: Point;
  to: Point;
  variant: ConnectionVariant;
  /** 0→1 draw-on. The ribbon grows from `from` toward `to`. */
  progress?: number;
  /** How far the curve bows off the straight line — keeps neighbours separate. */
  bow?: number;
  /** Width multiplier; scenes scale ribbons with the objects they connect. */
  weight?: number;
  /** Key material for this connection's own gradient id. Named `trace` rather
   *  than `id` because it is not a DOM id — it seeds one. */
  trace: string;
  /** 0→1 position of a travelling light packet, or null for none. */
  packet?: number | null;
  /** For `broken`: 0→1 retraction of the far half back toward the source. */
  retract?: number;
  /** Scene-level opacity. */
  presence?: number;
}

export const Connection: React.FC<ConnectionProps> = ({
  from,
  to,
  variant,
  progress = 1,
  bow = 0,
  weight = 1,
  trace,
  packet = null,
  retract = 0,
  presence = 1,
}) => {
  const v = VARIANT[variant];
  const curve = radialCurve(from, to, 0.42, bow);

  // A broken connection keeps its near half and pulls the far half home.
  const effectiveProgress = variant === "broken" ? progress * (1 - retract * 0.62) : progress;

  // Taper: full weight leaving the source, 45% arriving. `request` bulges in the
  // middle so the direction of travel is legible even in a still frame.
  const widthAt = (t: number) => {
    const base = v.width * weight * 0.5;
    if (variant === "request") return base * (1 - t * 0.42) * (1 + Math.sin(t * Math.PI) * 0.3);
    if (variant === "return") return base * (0.58 + t * 0.42) * (1 + Math.sin(t * Math.PI) * 0.22);
    return base * (1 - t * 0.5);
  };

  const d = ribbonPath(curve, widthAt, effectiveProgress);
  if (!d) return null;

  const gradId = `conn-${trace}`;
  const packetPoint = packet === null ? null : cubic(curve[0], curve[1], curve[2], curve[3], Math.max(0, Math.min(1, packet)) * effectiveProgress);

  return (
    <g opacity={presence}>
      <defs>
        <linearGradient id={gradId} x1={from.x} y1={from.y} x2={to.x} y2={to.y} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={v.from} stopOpacity={v.opacity} />
          <stop offset="62%" stopColor={v.to} stopOpacity={v.opacity * 0.86} />
          <stop offset="100%" stopColor={v.to} stopOpacity={v.opacity * 0.5} />
        </linearGradient>
      </defs>

      {v.glow ? <path d={d} fill={alpha(v.from, 0.3)} filter={defUrl("ribbon-glow")} /> : null}
      <path
        d={d}
        fill={`url(#${gradId})`}
        strokeDasharray={variant === "suggested" ? "16 12" : undefined}
        stroke={variant === "suggested" ? alpha(v.from, 0.85) : undefined}
        strokeWidth={variant === "suggested" ? 2.4 : undefined}
      />
      {/* the bright optical highlight along the ribbon's upper edge */}
      <path
        d={centerline(curve, effectiveProgress)}
        fill="none"
        stroke={alpha("#FFFFFF", variant === "dormant" ? 0.24 : 0.46)}
        strokeWidth={Math.max(1.6, v.width * weight * 0.1)}
        strokeLinecap="round"
      />

      {/* the jagged break where a failed call tore the path */}
      {variant === "broken" && retract > 0.02 ? (
        <BreakMark curve={curve} at={effectiveProgress} scale={weight} />
      ) : null}

      {packetPoint ? (
        <g filter={defUrl("soft-glow")}>
          <circle cx={packetPoint.x} cy={packetPoint.y} r={v.width * weight * 0.62} fill={alpha("#FFFFFF", 0.98)} />
          <circle cx={packetPoint.x} cy={packetPoint.y} r={v.width * weight * 1.05} fill={alpha(v.to, 0.4)} />
        </g>
      ) : null}
    </g>
  );
};

/**
 * The torn end of a broken ribbon.
 *
 * The tear runs ACROSS the path, not along it — a zigzag along the direction of
 * travel reads as an arrowhead, which is the opposite of the meaning. Two small
 * shards fly off past the break so the frame says "this snapped" rather than
 * "this stops here".
 */
const BreakMark: React.FC<{ curve: readonly [Point, Point, Point, Point]; at: number; scale: number }> = ({
  curve,
  at,
  scale,
}) => {
  const p = cubic(curve[0], curve[1], curve[2], curve[3], at);
  const tan = cubicTangent(curve[0], curve[1], curve[2], curve[3], at);
  const len = Math.hypot(tan.x, tan.y) || 1;
  const tx = tan.x / len;
  const ty = tan.y / len;
  const nx = -ty;
  const ny = tx;
  const half = 15 * scale;
  const jag = 6 * scale;
  const pointAt = (u: number, v: number) => `${(p.x + nx * u + tx * v).toFixed(2)},${(p.y + ny * u + ty * v).toFixed(2)}`;
  return (
    <g opacity={0.98}>
      <path
        d={`M${pointAt(-half, -jag)} L${pointAt(-half * 0.4, jag * 0.6)} L${pointAt(half * 0.2, -jag * 0.8)} L${pointAt(half, jag * 0.5)}`}
        fill="none"
        stroke={accent.coral}
        strokeWidth={3.6 * scale}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={p.x + tx * 26 * scale + nx * 12 * scale} cy={p.y + ty * 26 * scale + ny * 12 * scale} r={4.4 * scale} fill={accent.coral} opacity={0.8} />
      <circle cx={p.x + tx * 42 * scale - nx * 9 * scale} cy={p.y + ty * 42 * scale - ny * 9 * scale} r={3 * scale} fill={accent.coral} opacity={0.6} />
    </g>
  );
};

/**
 * The SVG surface connections live on. Kept as its own component so scenes can
 * put ribbons behind or in front of glass by ordering two layers, which is how
 * the film gets occlusion without a 3D engine.
 */
export const ConnectionLayer: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <svg
    aria-hidden="true"
    width={1920}
    height={1080}
    viewBox="0 0 1920 1080"
    style={{ position: "absolute", inset: 0, overflow: "visible", ...style }}
  >
    {children}
  </svg>
);

/**
 * Bundled traffic: many faint ribbons converging on one point, drawn as a single
 * translucent mass. This is how the overload scene says "hundreds of connections"
 * without drawing hundreds of readable lines.
 */
export const ConnectionBundle: React.FC<{
  sources: readonly Point[];
  target: Point;
  progress?: number;
  presence?: number;
  color?: string;
}> = ({ sources, target, progress = 1, presence = 1, color = ink.hair }) => {
  const frame = useCurrentFrame();
  return (
    <g opacity={presence * 0.62} filter={defUrl("ribbon-glow")}>
      {sources.map((s, i) => {
        const bow = ((i % 7) - 3) * 26;
        const curve = radialCurve(s, target, 0.4, bow);
        const phase = interpolate(
          (frame + i * 13) % 150,
          [0, 40, 110, 150],
          [0.18, 0.4, 0.4, 0.18],
          { ...clamp, easing: ease.glide },
        );
        return (
          <path
            key={`bundle-${i}-${s.x.toFixed(0)}-${s.y.toFixed(0)}`}
            d={ribbonPath(curve, (t) => (6.2 - t * 3.2) * (0.6 + phase), progress, 22)}
            fill={alpha(color, 0.2 + phase * 0.16)}
          />
        );
      })}
    </g>
  );
};
