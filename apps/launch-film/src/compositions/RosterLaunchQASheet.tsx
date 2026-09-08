import { AbsoluteFill, Sequence } from "remotion";
import { MASTER_DURATION, QA_FRAMES, SCENES } from "../data/timeline";
import { COLORS } from "../design/colors";
import { FONT_DISPLAY, FONT_MONO } from "../design/typography";
import { RosterLaunchMaster } from "./RosterLaunchMaster";

const COLUMNS = 6;
const CELL_WIDTH = 303;
const CELL_HEIGHT = 170;
const GAP = 12;
const LEFT = 21;
const TOP = 78;

export const RosterLaunchQASheet = () => (
  <AbsoluteFill style={{ backgroundColor: COLORS.background, color: COLORS.text }}>
    <div style={{ position: "absolute", left: LEFT, right: LEFT, top: 18, display: "flex", alignItems: "baseline" }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 680, letterSpacing: "-0.045em" }}>
        ROSTER · FULL TIMELINE QA
      </div>
      <div style={{ marginLeft: "auto", fontFamily: FONT_MONO, color: COLORS.roster, fontSize: 11, letterSpacing: "0.14em" }}>
        ENTER · MIDDLE · EXIT / EVERY SCENE
      </div>
    </div>
    {QA_FRAMES.map((item, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const sceneIndex = SCENES.findIndex((scene) => scene.id === item.scene);
      const phaseColor = item.phase === "enter" ? COLORS.selection : item.phase === "middle" ? COLORS.roster : COLORS.gold;
      return (
        <div
          key={`${item.scene}-${item.phase}`}
          style={{
            position: "absolute",
            left: LEFT + column * (CELL_WIDTH + GAP),
            top: TOP + row * (CELL_HEIGHT + 30 + GAP),
            width: CELL_WIDTH,
            height: CELL_HEIGHT + 30,
          }}
        >
          <div style={{ width: CELL_WIDTH, height: CELL_HEIGHT, overflow: "hidden", border: `1px solid ${phaseColor}66`, backgroundColor: COLORS.black }}>
            <div style={{ width: 1920, height: 1080, transform: `scale(${CELL_WIDTH / 1920})`, transformOrigin: "top left" }}>
              <Sequence from={-item.frame} durationInFrames={MASTER_DURATION + item.frame + 1}>
                <RosterLaunchMaster format="wide" audio={false} />
              </Sequence>
            </div>
          </div>
          <div style={{ height: 30, display: "flex", alignItems: "center", fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.08em", color: COLORS.textFaint }}>
            <span style={{ color: phaseColor }}>{String(sceneIndex + 1).padStart(2, "0")}</span>
            <span style={{ marginLeft: 7 }}>{item.scene.toUpperCase()} / {item.phase.toUpperCase()}</span>
            <span style={{ marginLeft: "auto" }}>F{String(item.frame).padStart(4, "0")}</span>
          </div>
        </div>
      );
    })}
  </AbsoluteFill>
);
