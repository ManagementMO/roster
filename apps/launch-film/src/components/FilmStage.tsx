import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../design/colors";
import { LIGHTING } from "../design/lighting";

type FilmStageProps = {
  readonly children: ReactNode;
  readonly accent?: string;
  readonly intensity?: number;
  readonly showGrid?: boolean;
};

export const FilmStage = ({ children, accent = COLORS.roster, intensity = 1 }: FilmStageProps) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const driftX = Math.sin(frame / 290) * width * 0.035;
  const driftY = Math.cos(frame / 340) * height * 0.025;

  return (
    <AbsoluteFill style={{ overflow: "hidden", color: COLORS.text, background: LIGHTING.background }}>
      <div
        style={{
          position: "absolute",
          width: width * 0.72,
          height: width * 0.72,
          left: width * 0.42 + driftX,
          top: -height * 0.58 + driftY,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}24 0%, ${COLORS.warm}12 38%, transparent 70%)`,
          filter: `blur(${34 * intensity}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -width * 0.14 - driftX * 0.35,
          bottom: -height * 0.52,
          width: width * 0.78,
          height: width * 0.58,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.92), rgba(138,99,255,0.09) 38%, transparent 70%)",
          filter: "blur(42px)",
        }}
      />
      <div style={{ position: "absolute", left: width * 0.08, right: width * 0.08, top: height * 0.54, height: 2, background: LIGHTING.horizon, opacity: 0.46 }} />
      {children}
      <AbsoluteFill style={{ pointerEvents: "none", boxShadow: "inset 0 0 150px rgba(60,67,82,0.06)" }} />
    </AbsoluteFill>
  );
};
