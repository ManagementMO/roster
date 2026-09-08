import { AbsoluteFill, useVideoConfig } from "remotion";
import { ConnectionRibbon } from "../components/ConnectionRibbon";
import { FilmStage } from "../components/FilmStage";
import { RosterPrism } from "../components/RosterPrism";
import { ToolObject } from "../components/ToolObject";
import { PRODUCT_COPY } from "../data/productCopy";
import { STARTING_FIVE } from "../data/tools";
import { COLORS } from "../design/colors";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";

const SLOTS = [0.10, 0.30, 0.50, 0.70, 0.90] as const;

export const RosterLaunchPoster = () => {
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const prism = { x: width * 0.80, y: height * 0.25 };
  return (
    <FilmStage intensity={1.05}>
      <AbsoluteFill>
        <div style={{ position: "absolute", left: width * 0.065, top: height * 0.08, width: width * 0.58 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 18 * fit, color: COLORS.roster, fontWeight: 650, letterSpacing: "0.13em" }}>ROSTER · LOCAL-FIRST MCP ROUTING</div>
          <div style={{ marginTop: 20 * fit, fontFamily: FONT_DISPLAY, fontSize: 92 * fit, fontWeight: 700, lineHeight: 0.9, letterSpacing: "-0.065em" }}>
            YOUR AGENT HAS<br /><span style={{ color: COLORS.selection }}>200 TOOLS.</span><br />ONLY <span style={{ color: COLORS.roster }}>FIVE</span> GET TO START.
          </div>
          <div style={{ marginTop: 24 * fit, fontFamily: FONT_UI, fontSize: 24 * fit, color: COLORS.textSecondary }}>One endpoint. A task-ready rotation. Local outcome memory.</div>
        </div>
        <div style={{ position: "absolute", left: prism.x, top: prism.y, translate: "-50% -50%" }}>
          <RosterPrism size={300 * fit} state="success" />
        </div>
        {SLOTS.map((x, index) => {
          const tool = STARTING_FIVE[index];
          if (!tool) return null;
          const cardPoint = { x: x * width, y: height * (index === 2 ? 0.76 : 0.80) };
          return (
            <div key={tool.id}>
              <ConnectionRibbon from={prism} to={cardPoint} progress={1} state="selected" curve={0.34} />
              <div style={{ position: "absolute", left: cardPoint.x, top: cardPoint.y, translate: "-50% -50%", transform: `scale(${index === 2 ? 0.92 : index === 1 || index === 3 ? 0.78 : 0.68})`, zIndex: 30 + (2 - Math.abs(2 - index)) }}>
                <ToolObject tool={tool} width={(index === 2 ? 430 : 360) * fit} variant={index === 2 ? "hero" : "selected"} focus={0.8} starterNumber={index + 1} />
              </div>
            </div>
          );
        })}
        <div style={{ position: "absolute", right: width * 0.055, bottom: height * 0.035, fontFamily: FONT_MONO, fontSize: 15 * fit, color: COLORS.textFaint, letterSpacing: "0.1em" }}>{PRODUCT_COPY.launchQualifier}</div>
      </AbsoluteFill>
    </FilmStage>
  );
};
