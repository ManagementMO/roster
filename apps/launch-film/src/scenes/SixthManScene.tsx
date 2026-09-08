import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ConnectionRibbon } from "../components/ConnectionRibbon";
import { RosterPrism } from "../components/RosterPrism";
import { ToolObject } from "../components/ToolObject";
import { PRODUCT_COPY } from "../data/productCopy";
import { BENCH_TOOL, STARTING_FIVE } from "../data/tools";
import { COLORS } from "../design/colors";
import { MATERIALS } from "../design/materials";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";
import { EASE } from "../motion/easings";
import { enter } from "../motion/timing";
import type { SceneProps } from "./types";

export const SixthManScene = ({ frameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const failed = STARTING_FIVE[0];
  if (!failed) throw new Error("Starting five is incomplete");
  const fail = enter(frame, 8, 18);
  const suggestion = enter(frame, 40, 34);
  const accepted = enter(frame, 112, 24);
  const rise = interpolate(suggestion, [0, 1], [230 * fit, 0], { easing: EASE.impact, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const failedPoint = { x: width * 0.18, y: height * 0.60 };
  const prismPoint = { x: width * 0.47, y: height * 0.60 };
  const benchPoint = { x: width * 0.79, y: height * 0.60 };

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: "50%", top: height * 0.08, translate: "-50% 0", textAlign: "center", width: width * 0.9 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 17 * fit, fontWeight: 650, color: COLORS.warning, letterSpacing: "0.13em" }}>ELIGIBLE HARD FAILURE</div>
        <div style={{ marginTop: 10 * fit, fontFamily: FONT_DISPLAY, fontSize: 70 * fit, fontWeight: 700, letterSpacing: "-0.058em" }}>SIXTH MAN <span style={{ color: COLORS.gold }}>READY.</span></div>
        <div style={{ marginTop: 14 * fit, fontFamily: FONT_UI, fontSize: 23 * fit, color: COLORS.textSecondary }}>The next-ranked equivalent is suggested—never silently substituted.</div>
      </div>

      <ConnectionRibbon from={failedPoint} to={prismPoint} progress={fail} state="broken" curve={0.24} />
      <ConnectionRibbon from={prismPoint} to={benchPoint} progress={accepted} state="suggested" curve={0.24} />

      <div style={{ position: "absolute", left: failedPoint.x, top: failedPoint.y, translate: "-50% -50%", transform: `rotateY(${fail * 12}deg)`, opacity: 1 - fail * 0.18 }}>
        <ToolObject tool={failed} width={330 * fit} progress={1} variant="failed" starterNumber={1} />
      </div>

      <div style={{ position: "absolute", left: prismPoint.x, top: prismPoint.y, translate: "-50% -50%", zIndex: 70 }}>
        <RosterPrism size={280 * fit} state={accepted > 0.55 ? "routing" : fail > 0.3 ? "suggestion" : "failure"} />
      </div>

      <div style={{ position: "absolute", left: benchPoint.x, top: benchPoint.y, translate: `-50% calc(-50% + ${rise}px)`, zIndex: 72 }}>
        <ToolObject tool={BENCH_TOOL} width={360 * fit} progress={suggestion} focus={accepted} variant={accepted > 0.4 ? "selected" : "suggested"} starterNumber={6} />
        <div style={{ marginTop: 18 * fit, textAlign: "center", fontFamily: FONT_MONO, fontSize: 17 * fit, fontWeight: 650, letterSpacing: "0.09em", color: accepted > 0.4 ? COLORS.success : COLORS.gold }}>
          {accepted > 0.4 ? "AGENT ACCEPTED · PATH OPEN" : PRODUCT_COPY.sixthManState}
        </div>
      </div>

      <div style={{ position: "absolute", left: prismPoint.x, bottom: height * 0.065, translate: "-50% 0", padding: `${14 * fit}px ${26 * fit}px`, borderRadius: 99, ...MATERIALS.quietGlass, fontFamily: FONT_UI, fontSize: 21 * fit, color: accepted > 0.35 ? COLORS.success : COLORS.textSecondary, opacity: suggestion }}>
        {accepted > 0.35 ? "Agent decision received" : "Awaiting agent decision"}
      </div>
    </AbsoluteFill>
  );
};
