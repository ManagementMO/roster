import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ConnectionRibbon } from "../components/ConnectionRibbon";
import { SceneTitle } from "../components/SceneTitle";
import { ToolUniverse } from "../components/ToolUniverse";
import { COLORS } from "../design/colors";
import { MATERIALS } from "../design/materials";
import { FONT_MONO } from "../design/typography";
import { enter, rangeProgress } from "../motion/timing";
import type { SceneProps } from "./types";

export const ToolOverloadScene = ({ durationInFrames, frameOffset = 0, worldFrameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const tension = rangeProgress(frame, 30, durationInFrames - 24);
  const agent = { x: width * 0.86, y: height * 0.51 };
  const sources = [
    { x: width * 0.04, y: height * 0.22 },
    { x: width * 0.08, y: height * 0.42 },
    { x: width * 0.04, y: height * 0.68 },
    { x: width * 0.22, y: height * 0.86 },
  ];

  return (
    <AbsoluteFill>
      <ToolUniverse mode="overload" durationInFrames={durationInFrames} worldFrameOffset={worldFrameOffset} />
      {sources.map((source, index) => (
        <ConnectionRibbon
          key={index}
          from={source}
          to={agent}
          progress={enter(frame, 34 + index * 14, 64)}
          state="candidate"
          curve={0.3 + index * 0.06}
        />
      ))}

      <div style={{ position: "absolute", left: width * 0.055, top: height * 0.08, zIndex: 200 }}>
        <SceneTitle
          eyebrow="UNFILTERED CAPABILITY SPACE"
          title={<>EVERY TOOL.<br />ALL AT ONCE.</>}
          support="Scale without a starting lineup becomes competition for attention."
          width={560 * fit}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: agent.x,
          top: agent.y,
          translate: "-50% -50%",
          width: 260 * fit,
          height: 170 * fit,
          borderRadius: 36 * fit,
          ...MATERIALS.heroGlass,
          display: "grid",
          placeItems: "center",
          transform: `scale(${0.92 + tension * 0.08})`,
          zIndex: 260,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 18 * fit, color: COLORS.textSecondary, letterSpacing: "0.11em" }}>AGENT</div>
          <div style={{ marginTop: 14 * fit, width: 150 * fit, height: 12 * fit, borderRadius: 99, backgroundColor: COLORS.line }}>
            <div style={{ width: `${35 + tension * 65}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.warning})` }} />
          </div>
          <div style={{ marginTop: 12 * fit, fontFamily: FONT_MONO, fontSize: 15 * fit, color: tension > 0.72 ? COLORS.warning : COLORS.gold }}>
            ATTENTION {Math.round(35 + tension * 65)}%
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
