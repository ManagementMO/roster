import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { RosterPrism } from "../components/RosterPrism";
import { PRODUCT_COPY } from "../data/productCopy";
import { COLORS } from "../design/colors";
import { MATERIALS } from "../design/materials";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";
import { EASE } from "../motion/easings";
import { enter } from "../motion/timing";
import type { SceneProps } from "./types";

export const FinalRevealScene = ({ frameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const converge = enter(frame, 0, 54);
  const identity = enter(frame, 36, 34);
  const copy = enter(frame, 66, 26);
  const command = enter(frame, 102, 28);
  const center = { x: width * 0.5, y: height * 0.29 };

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: center.x, top: center.y, width: 620 * fit, height: 620 * fit, translate: "-50% -50%", borderRadius: "50%", background: "radial-gradient(circle, rgba(79,124,255,0.14), rgba(91,203,255,0.07) 42%, transparent 72%)", filter: "blur(18px)", opacity: identity }} />
      {Array.from({ length: 5 }, (_, index) => {
        const angle = (-90 + index * 72) * Math.PI / 180;
        const radius = interpolate(converge, [0, 1], [Math.max(width, height) * 0.56, 104 * fit], { easing: EASE.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const x = center.x + Math.cos(angle) * radius;
        const y = center.y + Math.sin(angle) * radius;
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 112 * fit,
              height: 30 * fit,
              translate: "-50% -50%",
              rotate: `${-90 + index * 72 + 90}deg`,
              borderRadius: 99,
              ...MATERIALS.quietGlass,
              background: `linear-gradient(90deg, rgba(255,255,255,0.92), ${index % 2 === 0 ? COLORS.roster : COLORS.selection}3D)`,
              opacity: 1 - identity * 0.55,
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: center.x, top: center.y, translate: "-50% -50%", opacity: identity, transform: `scale(${0.82 + identity * 0.18})` }}>
        <RosterPrism size={210 * fit} progress={identity} state="success" />
      </div>

      <div style={{ position: "absolute", left: "50%", top: height * 0.43, translate: "-50% 0", textAlign: "center", width: width * 0.9, opacity: copy }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 142 * fit, fontWeight: 700, lineHeight: 0.82, letterSpacing: "-0.075em", color: COLORS.text }}>ROSTER</div>
        <div style={{ marginTop: 32 * fit, fontFamily: FONT_UI, fontSize: 30 * fit, fontWeight: 620, color: COLORS.textSecondary }}>
          Your agent has 200 tools. <span style={{ color: COLORS.roster, fontWeight: 750 }}>Only five get to start.</span>
        </div>
      </div>

      <div style={{ position: "absolute", left: "50%", bottom: height * 0.08, translate: "-50% 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * fit, opacity: command }}>
        <div style={{ padding: `${17 * fit}px ${30 * fit}px`, borderRadius: 99, ...MATERIALS.heroGlass, fontFamily: FONT_MONO, fontSize: 21 * fit, color: COLORS.text }}>
          <span style={{ color: COLORS.roster }}>›</span> {PRODUCT_COPY.launchCommand}
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 15 * fit, color: COLORS.textFaint, letterSpacing: "0.11em" }}>{PRODUCT_COPY.launchQualifier}</div>
      </div>
    </AbsoluteFill>
  );
};
