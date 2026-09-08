import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { LeagueTable } from "../components/LeagueTable";
import { RosterPrism } from "../components/RosterPrism";
import { COLORS } from "../design/colors";
import { MATERIALS } from "../design/materials";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";
import { enter } from "../motion/timing";
import type { SceneProps } from "./types";

const OUTCOMES = [
  ["SUCCESS", COLORS.success],
  ["FAILURE", COLORS.warning],
  ["LATENCY", COLORS.roster],
  ["DRIFT", COLORS.gold],
] as const;

export const CoachLeagueScene = ({ frameOffset = 0 }: SceneProps) => {
  const local = useCurrentFrame();
  const frame = local + frameOffset;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  const learn = enter(frame, 18, 90);

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: width * 0.065, top: height * 0.10, width: 650 * fit }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 17 * fit, color: COLORS.success, fontWeight: 650, letterSpacing: "0.12em" }}>COACH · LOCAL OUTCOME MEMORY</div>
        <div style={{ marginTop: 12 * fit, fontFamily: FONT_DISPLAY, fontSize: 66 * fit, fontWeight: 700, lineHeight: 0.94, letterSpacing: "-0.056em" }}>
          IT LEARNS WHAT WORKS<br /><span style={{ color: COLORS.success }}>ON YOUR STACK.</span>
        </div>
      </div>

      <div style={{ position: "absolute", left: width * 0.26, top: height * 0.60, translate: "-50% -50%", width: 660 * fit, height: 380 * fit, borderRadius: 44 * fit, ...MATERIALS.heroGlass, opacity: enter(frame, 0, 28) }}>
        <svg width="100%" height="100%" viewBox="0 0 660 380" style={{ position: "absolute", inset: 0 }}>
          <title>Illustrative local outcome trend</title>
          <path d="M80 270 C190 260, 225 160, 330 190 C425 220, 470 92, 585 104" fill="none" stroke={COLORS.line} strokeWidth="10" strokeLinecap="round" />
          <path d="M80 270 C190 260, 225 160, 330 190 C425 220, 470 92, 585 104" fill="none" stroke={COLORS.success} strokeWidth="8" strokeLinecap="round" pathLength={1} strokeDasharray={`${learn} 1`} />
          {OUTCOMES.map(([label, color], index) => {
            const x = 92 + index * 156;
            const y = [266, 185, 198, 104][index] ?? 190;
            return <circle key={label} cx={x} cy={y} r="15" fill="#FFFFFF" stroke={color} strokeWidth="6" opacity={enter(frame, 24 + index * 18, 24)} />;
          })}
        </svg>
        <div style={{ position: "absolute", left: 38 * fit, right: 38 * fit, bottom: 32 * fit, display: "flex", justifyContent: "space-between" }}>
          {OUTCOMES.map(([label, color], index) => (
            <div key={label} style={{ fontFamily: FONT_MONO, fontSize: 15 * fit, fontWeight: 650, color, letterSpacing: "0.08em", opacity: enter(frame, 24 + index * 18, 24) }}>{label}</div>
          ))}
        </div>
        <div style={{ position: "absolute", right: 38 * fit, top: 30 * fit, fontFamily: FONT_UI, fontSize: 22 * fit, color: COLORS.textSecondary }}>
          Routing preference <span style={{ color: COLORS.success, fontWeight: 700 }}>improving</span>
        </div>
        <div style={{ position: "absolute", left: 34 * fit, top: 24 * fit }}><RosterPrism size={110 * fit} state="learning" /></div>
      </div>

      <div style={{ position: "absolute", left: width * 0.73, top: height * 0.56, translate: "-50% -50%", transform: `scale(${0.86 * fit})`, transformOrigin: "50% 50%" }}>
        <LeagueTable startAt={92} />
      </div>
    </AbsoluteFill>
  );
};
