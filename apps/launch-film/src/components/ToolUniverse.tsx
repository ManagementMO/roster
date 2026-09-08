import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AMBIENT_TOOLS, DETAILED_TOOLS } from "../data/tools";
import { COLORS } from "../design/colors";
import { EASE } from "../motion/easings";
import { clamp, rangeProgress } from "../motion/timing";
import { ConnectionRibbon } from "./ConnectionRibbon";
import { SearchLens } from "./SearchLens";
import { ToolObject } from "./ToolObject";

export type UniverseMode = "overload" | "search" | "clear";

type ToolUniverseProps = {
  readonly mode: UniverseMode;
  readonly durationInFrames: number;
  readonly center?: readonly [number, number];
  readonly compact?: boolean;
  readonly showLabels?: boolean;
  readonly worldFrameOffset?: number;
  readonly progressFrameOffset?: number;
};

const SLOTS = [
  [0.42, 0.18, 0.74],
  [0.62, 0.20, 0.86],
  [0.82, 0.29, 0.94],
  [0.93, 0.46, 0.70],
  [0.20, 0.69, 0.66],
  [0.44, 0.62, 0.92],
  [0.69, 0.73, 0.76],
  [0.90, 0.77, 0.58],
] as const;

const STARTER_SLOTS = [0.16, 0.33, 0.5, 0.67, 0.84] as const;

export const ToolUniverse = ({
  mode,
  durationInFrames,
  worldFrameOffset = 0,
  progressFrameOffset = 0,
}: ToolUniverseProps) => {
  const localFrame = useCurrentFrame();
  const frame = localFrame + progressFrameOffset;
  const worldFrame = localFrame + worldFrameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const search = rangeProgress(frame, 44, Math.max(120, durationInFrames - 70));
  const clear = rangeProgress(frame, 24, Math.max(120, durationInFrames - 48));
  const scanX = -width * 0.06 + search * width * 1.12;
  const readable = DETAILED_TOOLS.slice(0, 8);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", perspective: 1800 }}>
      {AMBIENT_TOOLS.slice(0, 48).map((tool, index) => {
        const depth = clamp((tool.z + 900) / 1380);
        const x = width * (0.04 + ((tool.x + 980) / 1960) * 0.92) + Math.sin((worldFrame + index * 11) / 110) * 7;
        const y = height * (0.08 + ((tool.y + 520) / 1040) * 0.84) + Math.cos((worldFrame + index * 9) / 128) * 5;
        const reached = mode === "search" ? clamp((scanX - x + 90) / 210) : 1;
        const rejected = mode === "clear" ? clear : 0;
        return (
          <div
            key={tool.id}
            style={{
              position: "absolute",
              left: x + rejected * (index % 2 === 0 ? -240 : 240),
              top: y + rejected * (80 + (index % 5) * 26),
              width: (36 + depth * 90) * fit,
              height: (10 + depth * 12) * fit,
              borderRadius: 99,
              background: index % 9 === 0
                ? `linear-gradient(90deg, ${COLORS.roster}42, rgba(255,255,255,0.48))`
                : "linear-gradient(90deg, rgba(180,188,200,0.28), rgba(255,255,255,0.56))",
              border: "2px solid rgba(255,255,255,0.68)",
              opacity: (0.14 + depth * 0.32) * (mode === "search" ? 0.42 + reached * 0.58 : 1) * (1 - rejected * 0.86),
              filter: `blur(${(1 - depth) * 2.4 + rejected * 2}px)`,
              transform: `scaleX(${1 - rejected * 0.76}) rotate(${(index % 7) - 3}deg)`,
            }}
          />
        );
      })}

      {readable.map((tool, index) => {
        const slot = SLOTS[index];
        if (!slot) return null;
        const reached = mode === "search" ? clamp((scanX - slot[0] * width + 140) / 260) : 1;
        const reject = mode === "clear" && !tool.selected
          ? interpolate(clear, [0.05 + index * 0.035, 0.72 + index * 0.02], [0, 1], {
              easing: EASE.accelerate,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          : 0;
        const starterIndex = DETAILED_TOOLS.filter((item) => item.selected).findIndex((item) => item.id === tool.id);
        const targetX = starterIndex >= 0 ? (STARTER_SLOTS[starterIndex] ?? 0.5) * width : slot[0] * width;
        const targetY = height * 0.55;
        const selectedPull = mode === "clear" && tool.selected ? clear : 0;
        const baseX = slot[0] * width;
        const baseY = slot[1] * height;
        const x = baseX + (targetX - baseX) * selectedPull;
        const y = baseY + (targetY - baseY) * selectedPull;
        const depthScale = slot[2];
        const flyX = reject * (slot[0] < 0.5 ? -width * 0.22 : width * 0.22);
        const flyY = reject * (120 + index * 20);
        const focus = tool.selected ? reached : reached * 0.22;
        return (
          <div
            key={tool.id}
            style={{
              position: "absolute",
              left: x + flyX,
              top: y + flyY,
              translate: "-50% -50%",
              zIndex: Math.round(depthScale * 100),
              opacity: (mode === "overload" ? 0.84 : 0.56 + reached * 0.44) * (1 - reject),
              transform: `rotateY(${(1 - depthScale) * -12 + reject * 74}deg) rotateZ(${(index % 3 - 1) * 2.5}deg) scale(${depthScale * (1 - reject * 0.72)})`,
              filter: `blur(${Math.max(0, (0.82 - depthScale) * 4 + reject * 4)}px)`,
            }}
          >
            <ToolObject
              tool={tool}
              variant={mode === "clear" && tool.selected ? "selected" : "candidate"}
              width={260 * fit}
              progress={1}
              focus={focus}
              motionFrame={worldFrame}
              starterNumber={mode === "clear" && tool.selected ? starterIndex + 1 : undefined}
            />
          </div>
        );
      })}

      {mode !== "overload" ? (
        <ConnectionRibbon
          from={{ x: width * 0.08, y: height * 0.5 }}
          to={{ x: width * 0.92, y: height * 0.5 }}
          progress={mode === "search" ? search : 1 - clear * 0.32}
          state={mode === "search" ? "candidate" : "selected"}
          curve={0.18}
        />
      ) : null}
      {mode === "search" ? <SearchLens progress={search} /> : null}
      {mode === "clear" ? (
        <div
          style={{
            position: "absolute",
            left: -width * 0.18 + clear * width * 1.36,
            top: -height * 0.16,
            width: width * 0.18,
            height: height * 1.34,
            rotate: "-12deg",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.92) 58%, rgba(79,124,255,0.16) 82%, transparent)",
            borderRight: `4px solid ${COLORS.roster}94`,
            boxShadow: `34px 0 90px ${COLORS.roster}18`,
            backdropFilter: "blur(7px)",
          }}
        />
      ) : null}
    </div>
  );
};
