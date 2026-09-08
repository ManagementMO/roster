import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { StartingFive } from "../components/StartingFive";
import { COLORS } from "../design/colors";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";
import { enter } from "../motion/timing";
import type { SceneProps } from "./types";

export const StartingFiveScene = ({ frameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const title = enter(frame, 0, 28);
  const drift = Math.sin(frame / 118) * 12 * fit;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: height * 0.075,
          translate: "-50% 0",
          textAlign: "center",
          opacity: title,
          transform: `translateY(${(1 - title) * 22}px)`,
          zIndex: 100,
        }}
      >
        <div style={{ fontFamily: FONT_MONO, fontSize: 17 * fit, fontWeight: 650, color: COLORS.roster, letterSpacing: "0.14em" }}>ROTATION LOCKED</div>
        <div style={{ marginTop: 12 * fit, fontFamily: FONT_DISPLAY, fontSize: 76 * fit, lineHeight: 0.9, fontWeight: 700, letterSpacing: "-0.06em" }}>
          THE STARTING FIVE
        </div>
        <div style={{ marginTop: 16 * fit, fontFamily: FONT_UI, fontSize: 24 * fit, color: COLORS.textSecondary }}>
          Task-ready capabilities. One composed lineup.
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${drift}px)`, transformOrigin: "50% 55%" }}>
        <StartingFive introAt={30} />
      </div>
    </AbsoluteFill>
  );
};
