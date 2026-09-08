import type { ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../design/colors";
import { FONT_DISPLAY, FONT_MONO } from "../design/typography";
import { curvedPath, type Point } from "../utils/geometry";

type FlowNodeProps = {
  readonly point: Point;
  readonly label: string;
  readonly detail: string;
  readonly accent?: string;
  readonly children?: ReactNode;
  readonly scale?: number;
};

export const FlowNode = ({
  point,
  label,
  detail,
  accent = COLORS.selection,
  children,
  scale = 1,
}: FlowNodeProps) => (
  <div
    style={{
      position: "absolute",
      left: point.x,
      top: point.y,
      translate: "-50% -50%",
      width: 210 * scale,
      minHeight: 124 * scale,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: 9 * scale,
      color: COLORS.text,
      background: `linear-gradient(145deg, ${COLORS.surfaceBright}F4, ${COLORS.background}F7)`,
      border: `1px solid ${accent}66`,
      clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))",
      boxShadow: `0 0 36px ${accent}14`,
    }}
  >
    {children}
    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 27 * scale, fontWeight: 650, letterSpacing: "-0.03em" }}>{label}</div>
    <div style={{ fontFamily: FONT_MONO, fontSize: 11 * scale, color: accent, letterSpacing: "0.12em" }}>{detail}</div>
  </div>
);

type ConnectionFlowProps = {
  readonly points: readonly Point[];
  readonly startAt?: number;
  readonly step?: number;
  readonly color?: string;
  readonly returnColor?: string;
  readonly returnAt?: number;
};

export const ConnectionFlow = ({
  points,
  startAt = 0,
  step = 34,
  color = COLORS.roster,
  returnColor = COLORS.selection,
  returnAt,
}: ConnectionFlowProps) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const segments = points.slice(0, -1).map((point, index) => ({ from: point, to: points[index + 1] as Point }));
  const returnProgress = returnAt === undefined
    ? 0
    : interpolate(frame, [returnAt, returnAt + Math.max(38, step * segments.length)], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {segments.map((segment, index) => {
        const progress = interpolate(frame, [startAt + index * step, startAt + index * step + step], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const path = curvedPath(segment.from, segment.to, 0.42);
        return (
          <g key={`${segment.from.x}-${segment.to.x}`}>
            <path d={path} fill="none" stroke={COLORS.lineBright} strokeWidth={2} strokeOpacity={0.4} />
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={4}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${progress} 1`}
              filter={`drop-shadow(0 0 8px ${color})`}
            />
            {returnAt !== undefined ? (
              <path
                d={curvedPath(segment.to, segment.from, 0.42)}
                fill="none"
                stroke={returnColor}
                strokeWidth={3}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${Math.max(0, returnProgress - index / segments.length)} 1`}
                filter={`drop-shadow(0 0 7px ${returnColor})`}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
};
