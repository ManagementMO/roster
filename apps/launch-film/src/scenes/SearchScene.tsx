import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { RosterPrism } from "../components/RosterPrism";
import { SceneTitle } from "../components/SceneTitle";
import { ToolUniverse } from "../components/ToolUniverse";
import { PRODUCT_COPY } from "../data/productCopy";
import { COLORS } from "../design/colors";
import { MATERIALS } from "../design/materials";
import { FONT_MONO } from "../design/typography";
import { enter, rangeProgress } from "../motion/timing";
import type { SceneProps } from "./types";

const DIMENSIONS = ["TASK FIT", "RELIABILITY", "LATENCY", "OUTCOME HISTORY"] as const;

export const SearchScene = ({ durationInFrames, frameOffset = 0, worldFrameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const scan = rangeProgress(frame, 44, durationInFrames - 70);
  const active = Math.min(DIMENSIONS.length - 1, Math.floor(scan * DIMENSIONS.length));

  return (
    <AbsoluteFill>
      <ToolUniverse mode="search" durationInFrames={durationInFrames} worldFrameOffset={worldFrameOffset} />
      <div style={{ position: "absolute", left: width * 0.055, top: height * 0.07, zIndex: 220 }}>
        <SceneTitle
          eyebrow="INTENT OBSERVED"
          title={<>TRACE THE<br />CHECKOUT ERROR.</>}
          support={PRODUCT_COPY.task}
          width={520 * fit}
        />
      </div>
      <div style={{ position: "absolute", left: width * 0.105, top: height * 0.76, translate: "-50% -50%", zIndex: 240 }}>
        <RosterPrism size={225 * fit} progress={enter(frame, 8, 34)} state="searching" />
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: height * 0.07,
          translate: "-50% 0",
          display: "flex",
          gap: 14 * fit,
          zIndex: 260,
        }}
      >
        {DIMENSIONS.map((dimension, index) => {
          const visible = enter(frame, 54 + index * 30, 20);
          const focused = active === index;
          return (
            <div
              key={dimension}
              style={{
                minWidth: 190 * fit,
                padding: `${15 * fit}px ${22 * fit}px`,
                borderRadius: 99,
                ...MATERIALS.quietGlass,
                borderColor: focused ? `${COLORS.roster}82` : "rgba(255,255,255,0.88)",
                fontFamily: FONT_MONO,
                fontSize: 18 * fit,
                fontWeight: 650,
                letterSpacing: "0.08em",
                textAlign: "center",
                color: focused ? COLORS.roster : COLORS.textSecondary,
                opacity: visible,
                transform: `translateY(${(1 - visible) * 18}px) scale(${focused ? 1.04 : 0.96})`,
              }}
            >
              {dimension}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
