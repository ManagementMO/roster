import { useId } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../design/colors";
import { FONT_MONO } from "../design/typography";
import { pulse } from "../motion/timing";

export type PrismState =
  | "idle"
  | "listening"
  | "searching"
  | "routing"
  | "success"
  | "learning"
  | "failure"
  | "suggestion";

type RosterPrismProps = {
  readonly size?: number;
  readonly state?: PrismState;
  readonly progress?: number;
  readonly label?: string;
  readonly showLabel?: boolean;
};

const colorForState = (state: PrismState): string => {
  if (state === "failure") return COLORS.warning;
  if (state === "success" || state === "learning") return COLORS.success;
  if (state === "suggestion") return COLORS.gold;
  if (state === "searching") return COLORS.selection;
  return COLORS.roster;
};

export const RosterPrism = ({
  size = 260,
  state = "idle",
  progress = 1,
  label,
  showLabel = Boolean(label),
}: RosterPrismProps) => {
  const frame = useCurrentFrame();
  const id = useId().replaceAll(":", "");
  const signal = colorForState(state);
  const breathe = pulse(frame, state === "searching" ? 72 : 128);
  const spin = frame * (state === "searching" ? 0.22 : state === "routing" ? 0.12 : 0.035);
  const open = interpolate(progress, [0, 1], [0.68, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        opacity: progress,
        transform: `perspective(${size * 5}px) rotateX(${6 - progress * 6}deg) rotateY(${(1 - progress) * -12}deg) scale(${open})`,
        filter: `drop-shadow(0 ${size * 0.12}px ${size * 0.18}px rgba(50,66,98,0.18))`,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.98" />
            <stop offset="0.45" stopColor={signal} stopOpacity="0.24" />
            <stop offset="1" stopColor="#8A63FF" stopOpacity={state === "failure" ? 0.04 : 0.28} />
          </linearGradient>
          <radialGradient id={`${id}-optic`}>
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="0.48" stopColor="#EEF4FF" />
            <stop offset="1" stopColor={signal} stopOpacity="0.56" />
          </radialGradient>
          <filter id={`${id}-glow`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation={state === "failure" ? 2.4 : 3.6 + breathe * 1.8} result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="50" cy="50" r={25 + breathe * 1.8} fill={signal} opacity={0.05 + breathe * 0.035} filter={`url(#${id}-glow)`} />
        {Array.from({ length: 5 }, (_, index) => {
          const angle = -90 + index * 72 + spin;
          const radius = state === "listening" ? 15 + breathe * 2 : 18;
          const x = 50 + Math.cos((angle * Math.PI) / 180) * radius;
          const y = 50 + Math.sin((angle * Math.PI) / 180) * radius;
          return (
            <rect
              key={index}
              x={x - 7}
              y={y - 18}
              width="14"
              height="36"
              rx="7"
              fill={`url(#${id}-glass)`}
              stroke="#FFFFFF"
              strokeOpacity="0.94"
              strokeWidth="1.1"
              transform={`rotate(${angle + 90} ${x} ${y})`}
              filter={`url(#${id}-glow)`}
              opacity={state === "failure" && index > 2 ? 0.46 : 0.92}
            />
          );
        })}
        <circle cx="50" cy="50" r="11" fill={`url(#${id}-optic)`} stroke="#FFFFFF" strokeWidth="1.2" filter={`url(#${id}-glow)`} />
        <circle cx="50" cy="50" r={3.5 + breathe * 0.8} fill="#FFFFFF" opacity="0.98" />
      </svg>
      {showLabel ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "calc(100% + 18px)",
            translate: "-50% 0",
            fontFamily: FONT_MONO,
            fontSize: Math.max(16, size * 0.055),
            fontWeight: 650,
            letterSpacing: "0.11em",
            color: signal,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};
