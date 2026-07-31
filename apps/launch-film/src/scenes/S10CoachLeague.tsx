/**
 * Scene 10 — Coach and League (0:50–0:54).
 *
 * Two claims, four seconds, one focal point at a time: the camera lives in a
 * wide space with the Coach on the left and the League on the right and slides
 * between them, rather than splitting the frame into a dashboard.
 *
 * Both visualisations are deliberately small. The Coach shows what it actually
 * stores — outcome classes accumulating and routing preference reordering — and
 * says out loud that prompts, arguments and results are not stored. The League
 * shows the one Combine result this repository contains (8/8 against a real
 * filesystem server) and stamps it PRE-SEASON, because no named score may
 * publish until a human signs the run.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { accent, alpha, ink } from "../design/colors";
import { MONO, type as T } from "../design/typography";
import { AccentRule, Eyebrow, Headline, riseIn, StateChip } from "../components/Type/Type";
import { glassEdge, material, sheen } from "../design/materials";
import { radius } from "../design/spacing";
import { Glyph, type GlyphName } from "../components/ToolObject/glyphs";
import { clamp, ease } from "../motion/easings";
import { springAt } from "../motion/springs";
import { COACH_LEAGUE } from "../productCopy";
import { SceneShell, TextColumn } from "./SceneShell";

/** Outcome pips per row: true = ok, false = a recorded failure. Fixed data. */
const COACH_ROWS: { name: string; glyph: GlyphName; pips: readonly boolean[]; rank: number }[] = [
  { name: "fetch", glyph: "globe", pips: [true, false, true, false, false, true, false], rank: 2 },
  { name: "filesystem", glyph: "folder", pips: [true, true, true, true, true, true, true], rank: 0 },
  { name: "sqlite", glyph: "database", pips: [true, true, false, true, true, true, true], rank: 1 },
];

const ROW_H = 84;
const ROW_TOP = 542;
const REORDER_AT = 74;

export const S10CoachLeague: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // The slide: Coach centred, then League centred.
  const camX = interpolate(frame, [0, 118, 168, duration], [400, 400, -400, -400], {
    ...clamp,
    easing: ease.glide,
  });
  // Each panel dims as the camera leaves it, so a half-cropped panel never
  // hangs in the edge of frame competing with the one being read.
  const coachFocus = interpolate(frame, [118, 162], [1, 0], { ...clamp, easing: ease.glide });
  const leagueFocus = interpolate(frame, [124, 168], [0, 1], { ...clamp, easing: ease.glide });
  const zoom = interpolate(frame, [0, duration], [1.03, 1.05], { ...clamp, easing: ease.glide });

  const reorder = springAt(frame, fps, "heavy", REORDER_AT);

  return (
    <SceneShell duration={duration} camera={{ zoom, x: camX, y: 0, focus: 0 }}>
      {/* ── The Coach ──────────────────────────────────────────────────── */}
      <AbsoluteFill style={{ opacity: coachFocus }}>
      <TextColumn x={200} y={296} width={660} gap={14}>
        <Eyebrow delay={6} color={accent.violet}>
          {COACH_LEAGUE.coach.eyebrow}
        </Eyebrow>
        <AccentRule delay={12} color={accent.violet} width={88} />
        <Headline delay={18} size="title" style={{ fontSize: 56, marginTop: 4 }}>
          {COACH_LEAGUE.coach.headline}
        </Headline>
        <div style={{ ...T.support, fontSize: 27, maxWidth: 640, marginTop: 6, ...riseIn(frame, 34, 18, 22) }}>
          {COACH_LEAGUE.coach.lede}
        </div>
      </TextColumn>

      <AbsoluteFill>
        {COACH_ROWS.map((row, i) => {
          const targetIndex = i + (row.rank - i) * reorder;
          const appear = interpolate(frame, [40 + i * 8, 66 + i * 8], [0, 1], { ...clamp, easing: ease.arrive });
          return (
            <div
              key={`coach-${row.name}`}
              style={{
                position: "absolute",
                left: 200,
                top: ROW_TOP + targetIndex * ROW_H,
                width: 640,
                height: 68,
                opacity: appear,
                translate: `${((1 - appear) * -22).toFixed(2)}px 0px`,
              }}
            >
              <div style={{ ...material("solidGlass", { r: radius.card, lift: 12 }), position: "absolute", inset: 0 }}>
                <div style={sheen(radius.card, 0.7)} />
              </div>
              <div style={glassEdge(radius.card, 1, 1.6)} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 20px",
                  gap: 14,
                }}
              >
                <Glyph name={row.glyph} size={28} color={ink.base} accent={accent.blue} fill={0.8} />
                <span style={{ ...T.support, fontSize: 26, color: ink.strong, width: 190 }}>{row.name}</span>
                <div style={{ display: "flex", gap: 7, marginLeft: "auto" }}>
                  {row.pips.map((ok, p) => {
                    const at = 52 + i * 6 + p * 6;
                    return (
                      <span
                        key={`pip-${row.name}-${p}`}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          display: "block",
                          background: ok ? alpha(accent.blue, 0.85) : alpha(accent.coral, 0.8),
                          opacity: interpolate(frame, [at, at + 10], [0, 1], { ...clamp, easing: ease.arrive }),
                          scale: interpolate(frame, [at, at + 10], [0.4, 1], { ...clamp, easing: ease.snap }),
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          left: 200,
          top: ROW_TOP + 3 * ROW_H + 14,
          fontFamily: MONO,
          fontSize: 24,
          color: accent.violet,
          opacity: interpolate(frame, [REORDER_AT + 10, REORDER_AT + 34], [0, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        {COACH_LEAGUE.coach.axis}
      </div>
      </AbsoluteFill>

      {/* ── The League ─────────────────────────────────────────────────── */}
      <AbsoluteFill style={{ opacity: leagueFocus }}>
      <TextColumn x={1060} y={296} width={700} gap={14}>
        <Eyebrow delay={118} color={accent.amber}>
          {COACH_LEAGUE.league.eyebrow}
        </Eyebrow>
        <AccentRule delay={126} color={accent.amber} width={88} />
        <Headline delay={132} size="title" style={{ fontSize: 56, marginTop: 4 }}>
          {COACH_LEAGUE.league.headline}
        </Headline>
      </TextColumn>

      <div
        style={{
          position: "absolute",
          left: 1060,
          top: 452,
          width: 680,
          height: 268,
          opacity: interpolate(frame, [146, 178], [0, 1], { ...clamp, easing: ease.arrive }),
          scale: interpolate(frame, [146, 184], [0.95, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        <div style={{ ...material("optical", { r: radius.panel, lift: 34 }), position: "absolute", inset: 0 }}>
          <div style={sheen(radius.panel, 0.9)} />
        </div>
        <div style={glassEdge(radius.panel, 1, 2)} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: "28px 34px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 25, color: ink.muted }}>{COACH_LEAGUE.league.suite}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
            <span
              style={{
                fontFamily: T.display.fontFamily,
                fontSize: 104,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                color: ink.strong,
              }}
            >
              {COACH_LEAGUE.league.result}
            </span>
            <span style={{ ...T.support, fontSize: 26, color: ink.muted }}>{COACH_LEAGUE.league.resultLabel}</span>
          </div>
          <div
            style={{
              height: 3,
              borderRadius: 3,
              background: `linear-gradient(90deg, ${accent.amber} 0%, ${alpha(accent.amber, 0)} 100%)`,
              width: interpolate(frame, [176, 212], [0, 612], { ...clamp, easing: ease.arrive }),
            }}
          />
        </div>
      </div>

      <div style={{ position: "absolute", left: 1060, top: 748 }}>
        <StateChip label={COACH_LEAGUE.league.status} color={accent.amber} delay={182} />
      </div>

      <div
        style={{
          position: "absolute",
          left: 1060,
          top: 818,
          width: 690,
          ...T.support,
          fontSize: 26,
          color: ink.muted,
          opacity: interpolate(frame, [190, 222], [0, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        {COACH_LEAGUE.league.truth}
      </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
