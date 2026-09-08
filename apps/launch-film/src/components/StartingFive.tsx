import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { STARTING_FIVE } from "../data/tools";
import { COLORS } from "../design/colors";
import { EASE } from "../motion/easings";
import { enter } from "../motion/timing";
import { ConnectionRibbon } from "./ConnectionRibbon";
import { RosterPrism } from "./RosterPrism";
import { ToolObject } from "./ToolObject";

type StartingFiveProps = {
  readonly introAt?: number;
  readonly activeIndex?: number;
  readonly failedIndex?: number;
  readonly compact?: boolean;
  readonly showCore?: boolean;
  readonly center?: readonly [number, number];
};

const SLOTS = [
  [0.09, 0.57, 0.68, -8],
  [0.28, 0.50, 0.82, -4],
  [0.50, 0.43, 1, 0],
  [0.72, 0.50, 0.82, 4],
  [0.91, 0.57, 0.68, 8],
] as const;

export const StartingFive = ({ introAt = 0, activeIndex, failedIndex, compact = false, showCore = true }: StartingFiveProps) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const square = width / height < 1.25;
  const prismPoint = { x: width * 0.5, y: height * (square ? 0.78 : 0.76) };

  return (
    <div style={{ position: "absolute", inset: 0, perspective: 1800 }}>
      {SLOTS.map((slot, index) => {
        const progress = enter(frame, introAt + index * 15, 40);
        return (
          <ConnectionRibbon
            key={`connection-${slot[0]}-${slot[1]}`}
            from={prismPoint}
            to={{ x: slot[0] * width, y: slot[1] * height }}
            progress={progress}
            state={failedIndex === index ? "broken" : activeIndex === index ? "request" : "selected"}
            curve={0.34}
          />
        );
      })}
      {showCore ? (
        <div style={{ position: "absolute", left: prismPoint.x, top: prismPoint.y, translate: "-50% -50%", zIndex: 10 }}>
          <RosterPrism
            size={(compact ? 180 : 230) * fit}
            progress={enter(frame, introAt + 8, 44)}
            state={failedIndex !== undefined ? "failure" : activeIndex !== undefined ? "routing" : "success"}
          />
        </div>
      ) : null}
      {SLOTS.map((slot, index) => {
        const tool = STARTING_FIVE[index];
        if (!tool) return null;
        const progress = enter(frame, introAt + index * 15, 40);
        const startX = index < 2 ? -280 : index > 2 ? 280 : 0;
        const startY = index === 2 ? 240 : 110;
        const travelX = interpolate(progress, [0, 1], [startX * fit, 0], { easing: EASE.impact, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const travelY = interpolate(progress, [0, 1], [startY * fit, 0], { easing: EASE.impact, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const hero = index === 2 && !compact;
        const objectWidth = (hero ? 430 : index === 1 || index === 3 ? 350 : 300) * fit * (square ? 0.78 : 1);
        return (
          <div
            key={tool.id}
            style={{
              position: "absolute",
              left: slot[0] * width,
              top: slot[1] * height,
              translate: `calc(-50% + ${travelX}px) calc(-50% + ${travelY}px)`,
              transform: `perspective(1400px) rotateY(${slot[3] * (1 - progress * 0.35)}deg) scale(${slot[2]})`,
              zIndex: hero ? 60 : index === 1 || index === 3 ? 45 : 30,
              filter: activeIndex === index ? `drop-shadow(0 24px 55px ${COLORS.roster}28)` : undefined,
            }}
          >
            <ToolObject
              tool={tool}
              width={objectWidth}
              progress={progress}
              focus={activeIndex === index ? 1 : 0.62}
              starterNumber={index + 1}
              variant={failedIndex === index ? "failed" : hero ? "hero" : "selected"}
              supporting={index === 2 ? "Primary capability for this task" : undefined}
            />
          </div>
        );
      })}
    </div>
  );
};
