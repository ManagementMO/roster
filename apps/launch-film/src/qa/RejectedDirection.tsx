/**
 * The rejected direction, rendered.
 *
 * This repository contained no previously-rendered launch film, so there was no
 * earlier master to diff the new one against. Rather than assert an improvement,
 * this composition RENDERS the visual language the brief ruled out — dark HUD
 * chrome, thin cyan outlines, a glowing central orb, metadata grids, corner
 * brackets, tiny labels — from the same scene data, so the before/after sheet is
 * a like-for-like comparison instead of a claim.
 *
 * It is a reference artefact only. It is never part of the film, and the sheet
 * that uses it labels it as a reconstruction.
 */
import type React from "react";
import { AbsoluteFill } from "remotion";
import { MONO, SANS } from "../design/typography";
import { CANDIDATES, LINEUP } from "../lib/world";
import { STARTERS } from "../productCopy";

const CYAN = "#25E7E0";
const HUD_BG = "#080C12";
const HUD_LINE = "rgba(37,231,224,0.55)";
const HUD_DIM = "rgba(37,231,224,0.18)";

const shellBase: React.CSSProperties = {
  background: `radial-gradient(1200px 800px at 50% 46%, #0E1720 0%, ${HUD_BG} 70%)`,
  fontFamily: SANS,
  color: CYAN,
};

/** The corner brackets and tiny metadata every frame of that direction wore. */
const Chrome: React.FC<{ label: string }> = ({ label }) => (
  <>
    {[
      { top: 40, left: 40, borderTop: `1px solid ${HUD_LINE}`, borderLeft: `1px solid ${HUD_LINE}` },
      { top: 40, right: 40, borderTop: `1px solid ${HUD_LINE}`, borderRight: `1px solid ${HUD_LINE}` },
      { bottom: 40, left: 40, borderBottom: `1px solid ${HUD_LINE}`, borderLeft: `1px solid ${HUD_LINE}` },
      { bottom: 40, right: 40, borderBottom: `1px solid ${HUD_LINE}`, borderRight: `1px solid ${HUD_LINE}` },
    ].map((pos, _i) => (
      <div key={`br-${JSON.stringify(pos)}`} style={{ position: "absolute", width: 42, height: 42, ...pos }} />
    ))}
    <div style={{ position: "absolute", left: 48, top: 96, fontFamily: MONO, fontSize: 13, opacity: 0.75 }}>
      SYS::ROSTER v0.0.1 · NODE_22.13 · LAT 14ms
    </div>
    <div style={{ position: "absolute", right: 48, top: 96, fontFamily: MONO, fontSize: 13, opacity: 0.75 }}>
      {label}
    </div>
    <div style={{ position: "absolute", left: 48, bottom: 96, fontFamily: MONO, fontSize: 13, opacity: 0.75 }}>
      IDX 00184/00200 · Q 0.0 · MEM 1.7GB
    </div>
    {/* the grid */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `linear-gradient(${HUD_DIM} 1px, transparent 1px), linear-gradient(90deg, ${HUD_DIM} 1px, transparent 1px)`,
        backgroundSize: "64px 64px",
        opacity: 0.35,
      }}
    />
  </>
);

/** The glowing central orb the brief specifically named as the thing to kill. */
const Orb: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      position: "absolute",
      left: 960 - size / 2,
      top: 540 - size / 2,
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle at 50% 45%, #BFFFFC 0%, ${CYAN} 34%, rgba(37,231,224,0.18) 66%, rgba(37,231,224,0) 78%)`,
      boxShadow: `0 0 90px rgba(37,231,224,0.6), 0 0 190px rgba(37,231,224,0.35)`,
    }}
  />
);

const HudCard: React.FC<{ x: number; y: number; title: string; sub: string; w?: number }> = ({
  x,
  y,
  title,
  sub,
  w = 220,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      padding: "10px 12px",
      border: `1px solid ${HUD_LINE}`,
      background: "rgba(10,20,28,0.7)",
      borderRadius: 3,
    }}
  >
    <div style={{ fontFamily: MONO, fontSize: 10, opacity: 0.7 }}>ID::{title.toUpperCase()}</div>
    <div style={{ fontSize: 15, marginTop: 3, color: "#DFF9F8" }}>{title}</div>
    <div style={{ fontFamily: MONO, fontSize: 10, opacity: 0.7, marginTop: 3 }}>{sub}</div>
    <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} style={{ height: 3, flex: 1, background: i < 5 ? CYAN : HUD_DIM }} />
      ))}
    </div>
    <div style={{ fontFamily: MONO, fontSize: 9, opacity: 0.6, marginTop: 4 }}>
      w:0.84 · lat:14ms · n:132 · drift:0
    </div>
  </div>
);

export const REJECTED_BEATS = ["overload", "startingFive", "reveal"] as const;

export const RejectedDirection: React.FC<{ beat: number }> = ({ beat }) => {
  const which = REJECTED_BEATS[beat] ?? "overload";

  if (which === "overload") {
    return (
      <AbsoluteFill style={shellBase}>
        <Chrome label="MODE::OVERLOAD" />
        <Orb size={300} />
        {CANDIDATES.map((c, i) => (
          <HudCard
            key={c.id}
            x={130 + (i % 4) * 300}
            y={190 + Math.floor(i / 4) * 560}
            title={c.name}
            sub={c.capability}
          />
        ))}
        <svg aria-hidden="true" style={{ position: "absolute", inset: 0 }} width={1920} height={1080}>
          {CANDIDATES.map((c, i) => (
            <line
              key={`l-${c.id}`}
              x1={240 + (i % 4) * 300}
              y1={240 + Math.floor(i / 4) * 560}
              x2={960}
              y2={540}
              stroke={CYAN}
              strokeWidth={1}
              strokeDasharray="4 6"
              opacity={0.55}
            />
          ))}
        </svg>
        <div style={{ position: "absolute", left: 130, top: 470, fontSize: 40, fontWeight: 700, letterSpacing: "0.02em" }}>
          TOOL OVERLOAD DETECTED
        </div>
      </AbsoluteFill>
    );
  }

  if (which === "startingFive") {
    return (
      <AbsoluteFill style={shellBase}>
        <Chrome label="MODE::DRAFT_COMPLETE" />
        <Orb size={210} />
        {LINEUP.map((slot, i) => {
          const s = STARTERS[i];
          if (!s) return null;
          return (
            <HudCard
              key={s.no}
              x={slot.x - 110}
              y={760}
              title={s.name}
              sub={`STARTER_${s.no} · ${s.capability}`}
            />
          );
        })}
        <svg aria-hidden="true" style={{ position: "absolute", inset: 0 }} width={1920} height={1080}>
          {LINEUP.map((slot, _i) => (
            <line
              key={`ll-${slot.x}`}
              x1={960}
              y1={540}
              x2={slot.x}
              y2={760}
              stroke={CYAN}
              strokeWidth={1}
              strokeDasharray="3 5"
              opacity={0.6}
            />
          ))}
        </svg>
        <div style={{ position: "absolute", left: 0, right: 0, top: 190, textAlign: "center", fontSize: 34, fontWeight: 700 }}>
          [ STARTING FIVE SELECTED ]
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ ...shellBase, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <Chrome label="MODE::IDENTITY" />
      <Orb size={260} />
      <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "0.24em", zIndex: 2, color: "#DFF9F8" }}>ROSTER</div>
      <div style={{ fontFamily: MONO, fontSize: 18, marginTop: 18, opacity: 0.8, zIndex: 2 }}>
        &gt; npx roster init_
      </div>
    </AbsoluteFill>
  );
};
