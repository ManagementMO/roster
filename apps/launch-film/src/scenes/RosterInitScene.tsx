import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ConnectionRibbon } from "../components/ConnectionRibbon";
import { RosterPrism } from "../components/RosterPrism";
import { SceneTitle } from "../components/SceneTitle";
import { TerminalGlass } from "../components/TerminalGlass";
import { INIT_SCRIPT } from "../data/terminalScript";
import { COLORS } from "../design/colors";
import { MATERIALS } from "../design/materials";
import { FONT_DISPLAY, FONT_MONO } from "../design/typography";
import { enter } from "../motion/timing";
import type { SceneProps } from "./types";

export const RosterInitScene = ({ frameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const terminal = enter(frame, 0, 38);
  const form = enter(frame, 46, 58);
  const route = enter(frame, 150, 72);
  const prismPoint = { x: width * 0.64, y: height * 0.56 };
  const agentPoint = { x: width * 0.89, y: height * 0.56 };
  const sources = [0.26, 0.36, 0.48, 0.66, 0.76];

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: width * 0.055, top: height * 0.08 }}>
        <SceneTitle eyebrow="LOCAL INITIALIZATION" title={<>MANY IN.<br /><span style={{ color: COLORS.roster }}>ONE OUT.</span></>} width={520 * fit} />
      </div>

      <div style={{ position: "absolute", left: width * 0.28, top: height * 0.61, translate: "-50% -50%", transform: `scale(${0.66 * fit})`, transformOrigin: "50% 50%", zIndex: 40 }}>
        <TerminalGlass script={INIT_SCRIPT} width={760} height={500} progress={terminal} title="roster — initialize locally" />
      </div>

      {sources.map((y, index) => (
        <ConnectionRibbon
          key={y}
          from={{ x: width * 0.45, y: height * y }}
          to={prismPoint}
          progress={enter(frame, 36 + index * 10, 58)}
          state="candidate"
          curve={0.28 + index * 0.035}
        />
      ))}
      <ConnectionRibbon from={prismPoint} to={agentPoint} progress={route} state="selected" curve={0.18} />

      <div style={{ position: "absolute", left: prismPoint.x, top: prismPoint.y, translate: "-50% -50%", zIndex: 80 }}>
        <RosterPrism size={310 * fit} progress={form} state={route > 0.4 ? "routing" : "listening"} />
      </div>

      <div
        style={{
          position: "absolute",
          left: agentPoint.x,
          top: agentPoint.y,
          translate: "-50% -50%",
          width: 170 * fit,
          height: 170 * fit,
          borderRadius: 48 * fit,
          ...MATERIALS.heroGlass,
          display: "grid",
          placeItems: "center",
          opacity: route,
          transform: `scale(${0.84 + route * 0.16})`,
          zIndex: 90,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 36 * fit, fontWeight: 700 }}>AGENT</div>
          <div style={{ marginTop: 8 * fit, fontFamily: FONT_MONO, fontSize: 14 * fit, color: COLORS.success, letterSpacing: "0.09em" }}>ONE ENDPOINT</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
