/**
 * The Roster core — a five-aperture routing prism.
 *
 * This replaces the glowing-orb cliché with an object that *means* something:
 * a pentagonal optical housing containing five blades, one per starter. Light
 * enters the housing, the blades open and close to admit it, and it leaves
 * through whichever aperture the router selected. The five-ness is structural,
 * not decorative — you can count the starting five in the mark itself, and the
 * same geometry becomes the wordmark in the final reveal.
 *
 * States are driven by two inputs only: a named `state` and a per-blade
 * luminance array. Scenes never restyle the core; they light it.
 */
import type React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { accent, alpha, ink, mix } from "../../design/colors";
import { defId } from "../../design/effects";
import { bloom } from "../../design/lighting";
import { clamp, ease } from "../../motion/easings";
import { type Point, polygon, roundedPolyPath } from "../../lib/geometry";

export type CoreState =
  | "idle"
  | "listening"
  | "searching"
  | "routing"
  | "success"
  | "learning"
  | "failure"
  | "suggestion";

/** Design-space radius of the housing. Everything else is a ratio of this. */
const R = 150;

/**
 * Blade geometry in design space, blade 0 pointing straight up.
 *
 * Slim and strongly tapered: a wide blade turns the mark into a pinwheel, and a
 * pinwheel is a hazard symbol, not an optical instrument. Narrow light-guides
 * with generous negative space between them read as a five-aperture iris and
 * survive being scaled down to a 26px favicon-sized mark.
 */
function bladePath(index: number): string {
  const inner = 46;
  const outer = 119;
  const innerHalf = 10;
  const outerHalf = 30;
  const raw: Point[] = [
    { x: -innerHalf, y: -inner },
    { x: innerHalf, y: -inner },
    { x: outerHalf, y: -outer },
    { x: -outerHalf, y: -outer },
  ];
  const a = (index * 72 * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const rotated = raw.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
  return roundedPolyPath(rotated, 7);
}

const BLADES = [0, 1, 2, 3, 4].map(bladePath);
const HOUSING = roundedPolyPath(polygon({ x: 0, y: 0 }, R, 5, 0), 28);
const HOUSING_INNER = roundedPolyPath(polygon({ x: 0, y: 0 }, R - 15, 5, 0), 24);
/** The iris ring the blades close onto. */
const IRIS = roundedPolyPath(polygon({ x: 0, y: 0 }, 62, 5, 180), 14);
const GATE = roundedPolyPath(polygon({ x: 0, y: 0 }, 27, 5, 180), 6);

/**
 * Where blade `i` points, in frame coordinates. Scenes attach ribbons here so a
 * connection always meets the prism at an aperture rather than at its outline.
 */
export function coreAperture(center: Point, size: number, index: number): Point {
  const k = size / (R * 2);
  const a = ((index * 72 - 90) * Math.PI) / 180;
  const r = 132 * k;
  return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
}

/** A point on the housing edge at an arbitrary angle (degrees, 0 = up). */
export function coreEdge(center: Point, size: number, angleDeg: number): Point {
  const k = size / (R * 2);
  const a = ((angleDeg - 90) * Math.PI) / 180;
  const r = 142 * k;
  return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
}

export interface RosterCoreProps {
  center: Point;
  /** Full width of the housing in px. */
  size: number;
  state: CoreState;
  /** Per-blade luminance 0→1. Defaults derive from `state`. */
  blades?: readonly number[];
  /** Overall presence for entrances. */
  presence?: number;
  /** Rotation of the whole prism, degrees. */
  rotation?: number;
  /** Which blade the routing/failure state applies to. */
  activeBlade?: number;
  /** 0→1 progress of the sixth (suggested) aperture appearing outside the ring. */
  sixth?: number;
  /** Colour override for the lit state. */
  tint?: string;
}

/** Default blade lighting per state, given the current frame for animated ones. */
function defaultBlades(state: CoreState, frame: number, activeBlade: number): number[] {
  switch (state) {
    case "idle":
      return [0, 1, 2, 3, 4].map((i) => 0.16 + 0.07 * Math.sin((frame / 78) * Math.PI * 2 + i * 1.3));
    case "listening":
      return [0, 1, 2, 3, 4].map((i) => 0.24 + 0.2 * Math.sin((frame / 42) * Math.PI * 2 - i * 0.7));
    case "searching": {
      // A single sweep of light travelling blade to blade, twice a second.
      const head = ((frame / 26) % 5 + 5) % 5;
      return [0, 1, 2, 3, 4].map((i) => {
        const d = Math.min(Math.abs(i - head), 5 - Math.abs(i - head));
        return 0.2 + Math.max(0, 1 - d * 1.15) * 0.72;
      });
    }
    case "routing":
      return [0, 1, 2, 3, 4].map((i) => (i === activeBlade ? 0.98 : 0.22));
    case "success":
      return [0, 1, 2, 3, 4].map(() => 0.86);
    case "learning":
      return [0, 1, 2, 3, 4].map((i) => 0.3 + 0.4 * Math.max(0, Math.sin((frame / 60) * Math.PI * 2 - i * 1.25)));
    case "failure":
      return [0, 1, 2, 3, 4].map((i) => (i === activeBlade ? 0.95 : 0.2));
    case "suggestion":
      return [0, 1, 2, 3, 4].map((i) => (i === activeBlade ? 0.3 : 0.42));
  }
}

export const RosterCore: React.FC<RosterCoreProps> = ({
  center,
  size,
  state,
  blades,
  presence = 1,
  rotation = 0,
  activeBlade = 0,
  sixth = 0,
  tint,
}) => {
  const frame = useCurrentFrame();
  const lum = blades ?? defaultBlades(state, frame, activeBlade);
  const baseTint = tint ?? (state === "failure" ? accent.coral : state === "learning" || state === "suggestion" ? accent.violet : accent.blue);
  const k = size / (R * 2);

  const bloomStrength =
    presence *
    (state === "success" ? 1.1 : state === "routing" ? 0.85 : state === "searching" ? 0.7 : state === "failure" ? 0.8 : 0.45);

  return (
    <div
      style={{
        position: "absolute",
        left: center.x - size / 2,
        top: center.y - size / 2,
        width: size,
        height: size,
        opacity: presence,
        rotate: `${rotation}deg`,
      }}
    >
      {/* the light the object throws into the room */}
      <div
        style={{
          position: "absolute",
          inset: `-${(size * 0.55).toFixed(0)}px`,
          background: bloom(baseTint, size * 1.05, bloomStrength),
          pointerEvents: "none",
        }}
      />

      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <defs>
          <linearGradient id={defId("core-body")} x1="0%" y1="0%" x2="72%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.97" />
            <stop offset="46%" stopColor="#FBFAFC" stopOpacity="0.78" />
            <stop offset="100%" stopColor="#E9E8EE" stopOpacity="0.82" />
          </linearGradient>
          <linearGradient id={defId("core-rim")} x1="10%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="42%" stopColor="#FFFFFF" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#767B88" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id={defId("core-disp")} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accent.cyan} stopOpacity="0.5" />
            <stop offset="50%" stopColor={accent.blue} stopOpacity="0.16" />
            <stop offset="100%" stopColor={accent.violet} stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id={defId("core-gate")} cx="50%" cy="42%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="60%" stopColor={baseTint} stopOpacity="0.5" />
            <stop offset="100%" stopColor={baseTint} stopOpacity="0.08" />
          </radialGradient>
        </defs>

        {/* housing: outer optical solid */}
        <path d={HOUSING} fill={`url(#${defId("core-body")})`} />
        <path d={HOUSING} fill="none" stroke={`url(#${defId("core-disp")})`} strokeWidth={5.5} opacity={0.55} />
        <path d={HOUSING} fill="none" stroke={`url(#${defId("core-rim")})`} strokeWidth={3.2} />
        <path d={HOUSING_INNER} fill="none" stroke={alpha("#FFFFFF", 0.75)} strokeWidth={2.4} />

        {/* the iris the blades close onto */}
        <path d={IRIS} fill={alpha("#FFFFFF", 0.4)} stroke={alpha("#8A8F99", 0.34)} strokeWidth={2} />

        {/* five light-guides */}
        {BLADES.map((d, i) => {
          const l = Math.max(0, Math.min(1, lum[i] ?? 0));
          const bladeColor = state === "failure" && i === activeBlade ? accent.coral : baseTint;
          return (
            <g key={`blade-${d.slice(0, 24)}`}>
              <path d={d} fill={alpha("#FFFFFF", 0.72)} />
              <path d={d} fill={alpha(bladeColor, 0.08 + l * 0.5)} />
              <path
                d={d}
                fill="none"
                stroke={alpha(mix("#FFFFFF", bladeColor, l * 0.85), 0.4 + l * 0.55)}
                strokeWidth={2.4}
              />
            </g>
          );
        })}

        {/* the routing gate at the centre */}
        <path d={GATE} fill={`url(#${defId("core-gate")})`} />
        <path d={GATE} fill="none" stroke={alpha("#FFFFFF", 0.92)} strokeWidth={2.6} />

        {/* learning arc — a slow trace around the housing, only while learning */}
        {state === "learning" ? (
          <circle
            cx={0}
            cy={0}
            r={R + 16}
            fill="none"
            stroke={alpha(accent.violet, 0.75)}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${(2 * Math.PI * (R + 16) * 0.22).toFixed(1)} ${(2 * Math.PI * (R + 16)).toFixed(1)}`}
            transform={`rotate(${(frame * 2.1).toFixed(1)})`}
          />
        ) : null}

        {/* the sixth aperture: outside the housing, dashed until accepted */}
        {sixth > 0.001 ? (
          <g opacity={interpolate(sixth, [0, 0.25], [0, 1], clamp)}>
            <path
              d={`M0,${-R + 4} L0,${-R - 22}`}
              stroke={alpha(accent.violet, 0.75)}
              strokeWidth={3.4}
              strokeLinecap="round"
            />
            <g transform={`translate(0 ${(-R - 50).toFixed(1)})`}>
              <path
                d={roundedPolyPath(polygon({ x: 0, y: 0 }, 28, 5, 0), 6)}
                fill={alpha(accent.violet, 0.1 + sixth * 0.2)}
                stroke={alpha(accent.violet, 0.9)}
                strokeWidth={3}
                strokeDasharray={sixth > 0.92 ? undefined : "9 7"}
              />
            </g>
          </g>
        ) : null}
      </svg>

      {/* specular kick on the upper-left facet — sells the polish */}
      <div
        style={{
          position: "absolute",
          left: size * 0.16,
          top: size * 0.08,
          width: size * 0.34,
          height: size * 0.2,
          borderRadius: "50%",
          background: `linear-gradient(140deg, ${alpha("#FFFFFF", 0.95)} 0%, rgba(255,255,255,0) 72%)`,
          filter: `blur(${(size * 0.03).toFixed(1)}px)`,
          rotate: "-24deg",
          pointerEvents: "none",
          opacity: 0.9,
        }}
      />
      {/* scale-invariant guard: the prism never renders below a legible size */}
      <span style={{ display: "none" }}>{k.toFixed(3)}</span>
    </div>
  );
};

/**
 * The flat wordmark version of the same geometry — no glass, no light, graphite
 * only. Used in the final reveal so the mark the viewer has watched work for
 * fifty seconds resolves into the logo they will see on the repo.
 */
export const RosterMark: React.FC<{ size: number; color?: string; strokeOnly?: number }> = ({
  size,
  color = ink.strong,
  strokeOnly = 0,
}) => {
  // Stroke weights are specified in *rendered* pixels and converted back into
  // design units, so the mark keeps the same optical weight at 26px and at 400px.
  const u = (px: number) => (px * (R * 2)) / size;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}>
      <path
        d={HOUSING}
        fill="none"
        stroke={color}
        strokeWidth={u(Math.max(1.6, size * 0.038))}
        strokeLinejoin="round"
      />
      {BLADES.map((d, _i) => (
        <path
          key={`mark-${d.slice(0, 24)}`}
          d={d}
          fill={alpha(color, interpolate(strokeOnly, [0, 1], [0.88, 0], clamp))}
          stroke={color}
          strokeWidth={interpolate(strokeOnly, [0, 1], [0, u(Math.max(1.4, size * 0.026))], clamp)}
          strokeLinejoin="round"
        />
      ))}
      <path
        d={GATE}
        fill={alpha(color, 0.1)}
        stroke={color}
        strokeWidth={u(Math.max(1.4, size * 0.028))}
        strokeLinejoin="round"
      />
    </svg>
  );
};

/** Eased 0→1 helper scenes use to cross-fade the core between two states. */
export function coreBlend(frame: number, at: number, span = 18): number {
  return interpolate(frame, [at, at + span], [0, 1], { ...clamp, easing: ease.glide });
}
