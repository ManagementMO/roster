import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ConnectionRibbon } from "../components/ConnectionRibbon";
import { RosterPrism } from "../components/RosterPrism";
import { ToolObject } from "../components/ToolObject";
import { STARTING_FIVE } from "../data/tools";
import { COLORS } from "../design/colors";
import { MATERIALS } from "../design/materials";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";
import { enter } from "../motion/timing";
import type { SceneProps } from "./types";

export const ToolCallScene = ({ frameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const activeTool = STARTING_FIVE[0];
  if (!activeTool) throw new Error("Starting five is incomplete");
  const agentPoint = { x: width * 0.11, y: height * 0.57 };
  const prismPoint = { x: width * 0.37, y: height * 0.57 };
  const toolPoint = { x: width * 0.65, y: height * 0.57 };
  const resultPoint = { x: width * 0.89, y: height * 0.57 };
  const request = enter(frame, 18, 52);
  const route = enter(frame, 62, 54);
  const result = enter(frame, 122, 52);
  const recorded = enter(frame, 176, 26);

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: "50%", top: height * 0.09, translate: "-50% 0", width: width * 0.9, textAlign: "center" }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 17 * fit, color: COLORS.roster, fontWeight: 650, letterSpacing: "0.13em" }}>ROTATION / EXECUTING</div>
        <div style={{ marginTop: 10 * fit, fontFamily: FONT_DISPLAY, fontSize: 70 * fit, fontWeight: 700, letterSpacing: "-0.058em" }}>ONE CLEAN CALL PATH.</div>
      </div>

      <ConnectionRibbon from={agentPoint} to={prismPoint} progress={request} state="request" curve={0.22} />
      <ConnectionRibbon from={prismPoint} to={toolPoint} progress={route} state="request" curve={0.22} />
      <ConnectionRibbon from={toolPoint} to={resultPoint} progress={result} state="result" curve={0.22} />

      <div style={{ position: "absolute", left: agentPoint.x, top: agentPoint.y, translate: "-50% -50%", width: 220 * fit, height: 150 * fit, borderRadius: 36 * fit, ...MATERIALS.heroGlass, display: "grid", placeItems: "center", opacity: enter(frame, 0, 20) }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 38 * fit, fontWeight: 700 }}>AGENT</div>
          <div style={{ marginTop: 8 * fit, fontFamily: FONT_MONO, fontSize: 14 * fit, color: COLORS.textSecondary, letterSpacing: "0.09em" }}>REQUEST</div>
        </div>
      </div>

      <div style={{ position: "absolute", left: prismPoint.x, top: prismPoint.y, translate: "-50% -50%", zIndex: 50 }}>
        <RosterPrism size={250 * fit} progress={enter(frame, 16, 36)} state={result > 0.7 ? "success" : "routing"} />
      </div>

      <div style={{ position: "absolute", left: toolPoint.x, top: toolPoint.y, translate: "-50% -50%", zIndex: 55 }}>
        <ToolObject tool={activeTool} width={340 * fit} progress={route} focus={1} starterNumber={1} variant="selected" supporting="Repository search" />
      </div>

      <div style={{ position: "absolute", left: resultPoint.x, top: resultPoint.y, translate: "-50% -50%", width: 210 * fit, height: 150 * fit, borderRadius: 36 * fit, ...MATERIALS.heroGlass, display: "grid", placeItems: "center", opacity: result, borderColor: `${COLORS.success}66` }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 38 * fit, fontWeight: 700 }}>RESULT</div>
          <div style={{ marginTop: 8 * fit, fontFamily: FONT_MONO, fontSize: 14 * fit, color: COLORS.success, letterSpacing: "0.09em" }}>SUCCESS</div>
        </div>
      </div>

      <div style={{ position: "absolute", left: "50%", bottom: height * 0.075, translate: "-50% 0", padding: `${15 * fit}px ${28 * fit}px`, borderRadius: 99, ...MATERIALS.quietGlass, fontFamily: FONT_UI, fontSize: 22 * fit, color: COLORS.textSecondary, opacity: recorded }}>
        <span style={{ color: COLORS.success, fontWeight: 700 }}>SUCCESS</span> · latency and outcome recorded locally
      </div>
    </AbsoluteFill>
  );
};
