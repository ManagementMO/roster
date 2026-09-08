import { Img, Sequence, staticFile } from "remotion";
import { AbsoluteFill } from "remotion";
import { COLORS } from "../design/colors";
import { FONT_DISPLAY, FONT_MONO } from "../design/typography";
import { RosterLaunchPoster } from "./RosterLaunchPoster";

const PANEL_WIDTH = 820;
const PANEL_HEIGHT = 461;
const SCALE = PANEL_WIDTH / 1920;

export const RosterLaunchBeforeAfter = () => (
  <AbsoluteFill style={{ background: "linear-gradient(135deg, #F7F6F2, #EEF1F6)", color: COLORS.text }}>
    <div style={{ position: "absolute", left: 96, top: 64, fontFamily: FONT_MONO, fontSize: 18, color: COLORS.roster, fontWeight: 650, letterSpacing: "0.12em" }}>ROSTER LAUNCH FILM · VISUAL REDESIGN</div>
    <div style={{ position: "absolute", left: 96, top: 104, fontFamily: FONT_DISPLAY, fontSize: 64, fontWeight: 700, letterSpacing: "-0.055em" }}>From HUD noise to luminous focus.</div>
    {[
      { label: "BEFORE · DARK HUD", x: 96 },
      { label: "AFTER · LUMINOUS GLASS", x: 1004 },
    ].map((panel) => (
      <div key={panel.label} style={{ position: "absolute", left: panel.x, top: 252 }}>
        <div style={{ marginBottom: 18, fontFamily: FONT_MONO, fontSize: 17, fontWeight: 650, color: panel.x < 500 ? COLORS.textFaint : COLORS.roster, letterSpacing: "0.11em" }}>{panel.label}</div>
        <div style={{ position: "relative", width: PANEL_WIDTH, height: PANEL_HEIGHT, overflow: "hidden", borderRadius: 30, border: "3px solid rgba(255,255,255,0.92)", boxShadow: "0 34px 90px rgba(23,25,30,0.16)" }}>
          {panel.x < 500 ? (
            <Img src={staticFile("reference/current-poster.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 1920, height: 1080, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
              <Sequence durationInFrames={1}><RosterLaunchPoster /></Sequence>
            </div>
          )}
        </div>
      </div>
    ))}
    <div style={{ position: "absolute", left: 96, right: 96, bottom: 92, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28 }}>
      {["One focal point per frame", "Hero tools with real visual weight", "A distinctive five-aperture Roster prism"].map((copy, index) => (
        <div key={copy} style={{ padding: "24px 28px", borderRadius: 24, backgroundColor: "rgba(255,255,255,0.72)", border: "2px solid rgba(255,255,255,0.92)", fontFamily: FONT_DISPLAY, fontSize: 25, fontWeight: 650, color: index === 2 ? COLORS.roster : COLORS.text }}>{copy}</div>
      ))}
    </div>
  </AbsoluteFill>
);
