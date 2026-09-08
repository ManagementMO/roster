import { AbsoluteFill, Sequence } from "remotion";
import { CONTACT_FRAMES, MASTER_DURATION, SCENES } from "../data/timeline";
import { COLORS } from "../design/colors";
import { FONT_DISPLAY, FONT_MONO } from "../design/typography";
import { RosterLaunchMaster } from "./RosterLaunchMaster";

const COLUMNS = 4;
const CELL_WIDTH = 456;
const CELL_HEIGHT = 257;
const GAP = 16;
const TOP = 96;
const LEFT = 24;

export const RosterLaunchContactSheet = () => (
  <AbsoluteFill style={{ backgroundColor: COLORS.background, color: COLORS.text }}>
    <div
      style={{
        position: "absolute",
        left: LEFT,
        right: LEFT,
        top: 20,
        display: "flex",
        alignItems: "baseline",
      }}
    >
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 38, fontWeight: 680, letterSpacing: "-0.045em" }}>
        ROSTER LAUNCH FILM · CONTACT SHEET
      </div>
      <div style={{ marginLeft: "auto", fontFamily: FONT_MONO, color: COLORS.roster, fontSize: 12, letterSpacing: "0.14em" }}>
        12 REPRESENTATIVE FRAMES · 57 SECONDS · 60 FPS
      </div>
    </div>
    {CONTACT_FRAMES.map((frame, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const scene = [...SCENES].reverse().find((item) => frame >= item.from) ?? SCENES[0];
      return (
        <div
          key={frame}
          style={{
            position: "absolute",
            left: LEFT + column * (CELL_WIDTH + GAP),
            top: TOP + row * (CELL_HEIGHT + 33 + GAP),
            width: CELL_WIDTH,
            height: CELL_HEIGHT + 33,
          }}
        >
          <div
            style={{
              width: CELL_WIDTH,
              height: CELL_HEIGHT,
              overflow: "hidden",
              position: "relative",
              border: `1px solid ${index === CONTACT_FRAMES.length - 1 ? COLORS.roster : COLORS.lineBright}`,
              backgroundColor: COLORS.black,
            }}
          >
            <div
              style={{
                width: 1920,
                height: 1080,
                transform: `scale(${CELL_WIDTH / 1920})`,
                transformOrigin: "top left",
              }}
            >
              <Sequence from={-frame} durationInFrames={MASTER_DURATION + frame + 1}>
                <RosterLaunchMaster format="wide" audio={false} />
              </Sequence>
            </div>
          </div>
          <div
            style={{
              height: 33,
              display: "flex",
              alignItems: "center",
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: COLORS.textFaint,
              letterSpacing: "0.08em",
            }}
          >
            <span style={{ color: index === CONTACT_FRAMES.length - 1 ? COLORS.roster : COLORS.selection }}>
              F{String(frame).padStart(4, "0")}
            </span>
            <span style={{ marginLeft: 10 }}>{scene?.label.toUpperCase()}</span>
          </div>
        </div>
      );
    })}
  </AbsoluteFill>
);
