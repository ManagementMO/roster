import { useId } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../design/colors";
import type { Point } from "../utils/geometry";
import { curvedPath } from "../utils/geometry";

export type RibbonState = "dormant" | "candidate" | "selected" | "request" | "result" | "broken" | "suggested";

type ConnectionRibbonProps = {
  readonly from: Point;
  readonly to: Point;
  readonly progress?: number;
  readonly state?: RibbonState;
  readonly curve?: number;
  readonly packet?: number;
};

const ribbonColor = (state: RibbonState): string => {
  if (state === "broken") return COLORS.warning;
  if (state === "suggested") return COLORS.gold;
  if (state === "result") return COLORS.success;
  if (state === "selected" || state === "request") return COLORS.roster;
  return COLORS.lineBright;
};

export const ConnectionRibbon = ({ from, to, progress = 1, state = "dormant", curve = 0.42, packet }: ConnectionRibbonProps) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const id = useId().replaceAll(":", "");
  const color = ribbonColor(state);
  const path = curvedPath(from, to, curve);
  const effectivePacket = packet ?? ((frame % 84) / 84);
  const px = from.x + (to.x - from.x) * effectivePacket;
  const py = from.y + (to.y - from.y) * effectivePacket - Math.sin(effectivePacket * Math.PI) * Math.abs(to.x - from.x) * 0.08;
  const active = ["selected", "request", "result", "suggested"].includes(state);
  const broken = state === "broken";
  const visibleProgress = interpolate(progress, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
      <defs>
        <linearGradient id={`${id}-ribbon`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0.18" />
          <stop offset="0.55" stopColor={color} stopOpacity="0.92" />
          <stop offset="1" stopColor={state === "request" ? COLORS.selection : color} stopOpacity="0.64" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <path d={path} fill="none" stroke={color} strokeWidth={active ? 14 : 10} strokeOpacity={active ? 0.08 : 0.05} strokeLinecap="round" filter={`url(#${id}-soft)`} />
      <path
        d={path}
        fill="none"
        stroke={`url(#${id}-ribbon)`}
        strokeWidth={active ? 6 : 4}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={broken ? `${Math.min(0.34, visibleProgress)} 0.08 0.06 1` : `${visibleProgress} 1`}
      />
      {active && visibleProgress > 0.8 ? (
        <circle cx={px} cy={py} r={state === "request" ? 10 : 8} fill="#FFFFFF" stroke={color} strokeWidth="4" filter={`url(#${id}-soft)`} />
      ) : null}
    </svg>
  );
};
