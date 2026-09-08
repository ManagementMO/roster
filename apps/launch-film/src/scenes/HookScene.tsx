import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { PRODUCT_COPY } from "../data/productCopy";
import { COLORS } from "../design/colors";
import { MATERIALS } from "../design/materials";
import { FONT_DISPLAY, FONT_MONO } from "../design/typography";
import { EASE } from "../motion/easings";
import { enter, exit } from "../motion/timing";
import type { SceneProps } from "./types";

const FIELD = Array.from({ length: 40 }, (_, index) => ({
  id: `field-${index}`,
  x: 5 + ((index * 47) % 91),
  y: 8 + ((index * 71) % 82),
  width: 34 + ((index * 29) % 100),
  depth: 0.35 + (index % 7) * 0.09,
}));

const STARTER_MARKS = ["code", "files", "browser", "issues", "skills"];

export const HookScene = ({ frameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const first = enter(frame, 4, 25);
  const firstExit = exit(frame, 70, 18);
  const second = enter(frame, 88, 26);
  const spread = enter(frame, 104, 42);

  return (
    <AbsoluteFill>
      {FIELD.map((item, index) => {
        const settle = enter(frame, 6 + (index % 10) * 2, 22);
        const distance = 1 - firstExit;
        return (
          <div
            key={item.id}
            style={{
              position: "absolute",
              left: `${50 + (item.x - 50) * distance}%`,
              top: `${50 + (item.y - 50) * distance}%`,
              width: item.width * fit,
              height: Math.max(8, 14 * item.depth) * fit,
              borderRadius: 99,
              background: index % 9 === 0
                ? `linear-gradient(90deg, ${COLORS.roster}44, rgba(255,255,255,0.68))`
                : "linear-gradient(90deg, rgba(184,192,204,0.28), rgba(255,255,255,0.62))",
              border: "2px solid rgba(255,255,255,0.72)",
              opacity: settle * item.depth * 0.52 * (1 - firstExit * 0.86),
              filter: `blur(${(1 - item.depth) * 2}px)`,
              transform: `translate(-50%, -50%) scale(${0.82 + settle * 0.18})`,
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          opacity: first * (1 - firstExit),
          transform: `translateY(${(1 - first) * 34 - firstExit * 46}px) scale(${0.94 + first * 0.06 + firstExit * 0.08})`,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 24 * fit, fontWeight: 650, letterSpacing: "0.16em", color: COLORS.textSecondary }}>
            {PRODUCT_COPY.hookLead}
          </div>
          <div style={{ marginTop: 14 * fit, fontFamily: FONT_DISPLAY, fontSize: 188 * fit, fontWeight: 700, lineHeight: 0.84, letterSpacing: "-0.075em", color: COLORS.text }}>
            {PRODUCT_COPY.hookCount}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          opacity: second,
          transform: `translateY(${(1 - second) * 46}px) scale(${0.92 + second * 0.08})`,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 146 * fit, fontWeight: 700, lineHeight: 0.82, letterSpacing: "-0.07em", color: COLORS.text }}>
            ONLY <span style={{ color: COLORS.roster }}>FIVE</span>
          </div>
          <div style={{ marginTop: 22 * fit, fontFamily: FONT_DISPLAY, fontSize: 88 * fit, fontWeight: 700, letterSpacing: "-0.055em", color: COLORS.text }}>
            GET TO START.
          </div>
        </div>
      </div>

      {STARTER_MARKS.map((mark, index) => {
        const x = interpolate(spread, [0, 1], [width * 0.5, width * (0.39 + index * 0.055)], { easing: EASE.impact, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const y = height * 0.82 + Math.abs(index - 2) * 11 * fit;
        return (
          <div
            key={mark}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 82 * fit,
              height: 22 * fit,
              translate: "-50% -50%",
              rotate: `${(index - 2) * 7}deg`,
              borderRadius: 99,
              ...MATERIALS.quietGlass,
              background: `linear-gradient(90deg, rgba(255,255,255,0.94), ${index % 2 === 0 ? COLORS.roster : COLORS.selection}38)`,
              opacity: second * spread,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
