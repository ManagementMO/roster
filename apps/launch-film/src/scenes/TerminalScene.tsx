import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TerminalGlass } from "../components/TerminalGlass";
import { ToolObject } from "../components/ToolObject";
import { LIST_SCRIPT } from "../data/terminalScript";
import { DETAILED_TOOLS } from "../data/tools";
import { EASE } from "../motion/easings";
import { enter, exit } from "../motion/timing";
import type { SceneProps } from "./types";

const TOKEN_SLOTS = [
  [0.74, 0.24, -5, 0.78],
  [0.87, 0.38, 4, 0.92],
  [0.71, 0.56, -2, 1],
  [0.89, 0.69, 6, 0.76],
  [0.64, 0.78, -7, 0.68],
  [0.96, 0.52, 8, 0.58],
] as const;

export const TerminalScene = ({ durationInFrames, frameOffset = 0, worldFrameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const worldFrame = local + worldFrameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const reveal = enter(frame, 0, 44);
  const push = enter(frame, durationInFrames - 126, 104);
  const terminalExit = exit(frame, durationInFrames - 72, 56);
  const terminalX = interpolate(push, [0, 1], [width * 0.46, width * 0.20], { easing: EASE.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const terminalScale = interpolate(push, [0, 1], [1, 1.18], { easing: EASE.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ perspective: 1800 }}>
      <div
        style={{
          position: "absolute",
          left: terminalX,
          top: height * 0.52,
          translate: "-50% -50%",
          opacity: 1 - terminalExit,
          transform: `rotateY(${interpolate(reveal, [0, 1], [-9, -2])}deg) scale(${terminalScale * fit})`,
          transformOrigin: "50% 50%",
          zIndex: 20,
        }}
      >
        <TerminalGlass script={LIST_SCRIPT} width={1120} height={610} progress={reveal} />
      </div>

      {TOKEN_SLOTS.map((slot, index) => {
        const tool = DETAILED_TOOLS[index];
        if (!tool) return null;
        const token = enter(frame, 174 + index * 18, 36);
        const x = interpolate(token, [0, 1], [width * 0.60, width * slot[0]], { easing: EASE.impact, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const y = interpolate(token, [0, 1], [height * 0.51, height * slot[1]], { easing: EASE.impact, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const scale = slot[3] + push * (0.16 + index * 0.015);
        return (
          <div
            key={tool.id}
            style={{
              position: "absolute",
              left: x,
              top: y,
              translate: "-50% -50%",
              transform: `rotate(${slot[2]}deg) scale(${scale})`,
              zIndex: 30 + index,
              opacity: token,
            }}
          >
            <ToolObject
              tool={tool}
              variant={index === 2 ? "candidate" : "background"}
              width={(index === 2 ? 270 : 170) * fit}
              progress={token}
              focus={index === 2 ? 0.35 : 0}
              motionFrame={worldFrame}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
