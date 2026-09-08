import { interpolate, useVideoConfig } from "remotion";
import { COLORS } from "../design/colors";

type SearchLensProps = {
  readonly progress: number;
  readonly direction?: "horizontal" | "vertical";
  readonly width?: number;
};

export const SearchLens = ({ progress, direction = "horizontal", width: lensWidth = 250 }: SearchLensProps) => {
  const { width, height } = useVideoConfig();
  const horizontal = direction === "horizontal";
  const travel = horizontal
    ? interpolate(progress, [0, 1], [-lensWidth, width + lensWidth], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : interpolate(progress, [0, 1], [-lensWidth, height + lensWidth], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: horizontal ? travel - lensWidth / 2 : 0,
        top: horizontal ? 0 : travel - lensWidth / 2,
        width: horizontal ? lensWidth : width,
        height: horizontal ? height : lensWidth,
        background: horizontal
          ? `linear-gradient(90deg, transparent, ${COLORS.roster}0A 28%, rgba(255,255,255,0.76) 66%, ${COLORS.selection}16 82%, transparent)`
          : `linear-gradient(180deg, transparent, ${COLORS.roster}0A 28%, rgba(255,255,255,0.76) 66%, ${COLORS.selection}16 82%, transparent)`,
        borderRight: horizontal ? `4px solid ${COLORS.roster}B0` : undefined,
        borderBottom: horizontal ? undefined : `4px solid ${COLORS.roster}B0`,
        boxShadow: horizontal ? `34px 0 90px ${COLORS.roster}22` : `0 34px 90px ${COLORS.roster}22`,
        backdropFilter: "blur(5px) saturate(1.18)",
        pointerEvents: "none",
      }}
    />
  );
};
