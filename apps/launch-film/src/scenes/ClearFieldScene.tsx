import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ToolUniverse } from "../components/ToolUniverse";
import { COLORS } from "../design/colors";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";
import { rangeProgress } from "../motion/timing";
import type { SceneProps } from "./types";

const DEBRIS = Array.from({ length: 16 }, (_, ordinal) => ({
  id: `debris-${ordinal}`,
  ordinal,
}));

export const ClearFieldScene = ({ durationInFrames, frameOffset = 0, worldFrameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const clear = rangeProgress(frame, 24, durationInFrames - 48);
  const count = Math.round(interpolate(clear, [0, 1], [200, 5]));
  const sweepX = -width * 0.18 + clear * width * 1.36;

  return (
    <AbsoluteFill>
      <ToolUniverse mode="clear" durationInFrames={durationInFrames} worldFrameOffset={worldFrameOffset} />

      <div style={{ position: "absolute", left: width * 0.055, top: height * 0.10, zIndex: 260 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 17 * fit, fontWeight: 650, color: COLORS.roster, letterSpacing: "0.12em" }}>CAPABILITIES IN FOCUS</div>
        <div style={{ marginTop: 8 * fit, fontFamily: FONT_DISPLAY, fontSize: 126 * fit, lineHeight: 0.86, fontWeight: 700, letterSpacing: "-0.07em", color: clear > 0.72 ? COLORS.roster : COLORS.text }}>
          {String(count).padStart(2, "0")}
        </div>
        <div style={{ marginTop: 20 * fit, width: 340 * fit, height: 10 * fit, borderRadius: 99, backgroundColor: COLORS.line }}>
          <div style={{ width: `${clear * 100}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${COLORS.roster}, ${COLORS.selection})` }} />
        </div>
      </div>

      {DEBRIS.map(({ id, ordinal: index }) => {
        const phase = Math.max(0, Math.min(1, clear * 1.38 - index * 0.035));
        const side = index % 2 === 0 ? -1 : 1;
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              left: sweepX - 80 * fit + side * phase * (100 + (index % 5) * 34) * fit,
              top: height * (0.18 + ((index * 43) % 66) / 100) + phase * (70 + (index % 4) * 18) * fit,
              width: (44 + (index % 5) * 22) * fit,
              height: (7 + (index % 3) * 3) * fit,
              borderRadius: 99,
              background: index % 4 === 0 ? `linear-gradient(90deg, ${COLORS.roster}88, rgba(255,255,255,0.58))` : "linear-gradient(90deg, rgba(148,158,172,0.46), rgba(255,255,255,0.72))",
              opacity: phase * (1 - clear * 0.55),
              rotate: `${side * phase * (18 + index * 2)}deg`,
              filter: `blur(${phase * 0.8}px)`,
              zIndex: 250,
            }}
          />
        );
      })}

      <div style={{ position: "absolute", right: width * 0.055, top: height * 0.075, width: 500 * fit, padding: `${24 * fit}px ${28 * fit}px`, borderRadius: 32 * fit, textAlign: "right", background: "rgba(247,246,242,0.88)", boxShadow: "0 24px 68px rgba(23,25,30,0.08)", backdropFilter: "blur(20px)", zIndex: 270, opacity: Math.min(1, clear * 1.7) }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 58 * fit, fontWeight: 700, lineHeight: 0.96, letterSpacing: "-0.052em" }}>
          IRRELEVANT CAPABILITIES<br /><span style={{ color: COLORS.roster }}>RECEDE TO THE BENCH.</span>
        </div>
        <div style={{ marginTop: 18 * fit, fontFamily: FONT_UI, fontSize: 24 * fit, lineHeight: 1.34, color: COLORS.textSecondary }}>
          Connections retract. Surfaces collapse. Strong alternates stay in reach.
        </div>
      </div>
    </AbsoluteFill>
  );
};
