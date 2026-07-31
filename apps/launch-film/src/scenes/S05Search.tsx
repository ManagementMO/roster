/**
 * Scene 5 — Search (0:23–0:31).
 *
 * `draft(need)`. A plane of light travels through the candidate space; what it
 * passes is evaluated. Candidates that fit the need gain physical substance —
 * they come forward, sharpen, and take the selected spine. Candidates that do
 * not recede into the depth field. The four ranking signals are announced one at
 * a time in large type, so the viewer learns what "ranked" means without reading
 * a single metric.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { accent, ink } from "../design/colors";
import { type as T } from "../design/typography";
import { AccentRule, Eyebrow, riseIn } from "../components/Type/Type";
import { ScanPlane, scanResolve, SignalReadout } from "../components/SearchSystem/SearchSystem";
import { BackgroundTool, CandidateTool } from "../components/ToolObject/ToolObject";
import { CANDIDATES, FIELD_SORTED, SEARCH_SLOTS } from "../lib/world";
import { MONO } from "../design/typography";
import { clamp, ease } from "../motion/easings";
import { SEARCH } from "../productCopy";
import { SceneShell, TextColumn } from "./SceneShell";

/** Two full sweeps: a wide reconnaissance pass, then a decisive one. */
const SWEEP_ONE = { start: 40, end: 200 } as const;
const SWEEP_TWO = { start: 236, end: 400 } as const;

export const S05Search: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const sweep1 = interpolate(frame, [SWEEP_ONE.start, SWEEP_ONE.end], [0, 1], { ...clamp, easing: ease.glide });
  const sweep2 = interpolate(frame, [SWEEP_TWO.start, SWEEP_TWO.end], [0, 1], { ...clamp, easing: ease.glide });
  const sweep1Alive = frame >= SWEEP_ONE.start - 8 && frame <= SWEEP_ONE.end + 10;
  const sweep2Alive = frame >= SWEEP_TWO.start - 8 && frame <= SWEEP_TWO.end + 10;

  const zoom = interpolate(frame, [0, duration], [1.0, 1.045], { ...clamp, easing: ease.glide });
  const camX = interpolate(frame, [0, duration], [30, -34], { ...clamp, easing: ease.glide });

  return (
    <SceneShell duration={duration} camera={{ zoom, x: camX, y: 0, focus: 0 }}>
      {/* the rest of the index, far back */}
      <AbsoluteFill>
        {FIELD_SORTED.map((t, _i) => (
          <BackgroundTool
            key={`se-field-${t.x.toFixed(1)}-${t.y.toFixed(1)}`}
            x={t.x}
            y={t.y}
            depth={Math.min(0.98, t.depth + 0.2)}
            size={t.size}
            presence={0.42 + scanResolve(t.x, sweep1) * 0.16}
            drift={Math.sin(frame / 120 + t.phase) * 6}
          />
        ))}
      </AbsoluteFill>

      {/* the seven candidates under evaluation */}
      <AbsoluteFill>
        {SEARCH_SLOTS.map((slot, i) => {
          const c = CANDIDATES[i];
          if (!c) return null;
          const enter = interpolate(frame - i * 7, [0, 30], [0, 1], { ...clamp, easing: ease.arrive });
          const pass1 = scanResolve(slot.x, sweep1);
          const pass2 = scanResolve(slot.x, sweep2);

          // Substance is *caused* by the scan: starters come forward on the
          // second pass; the rest sink into the depth field.
          const gain = c.starter ? pass2 : 0;
          const lose = c.starter ? 0 : pass2;
          const depth = slot.depth + lose * 0.46 - gain * slot.depth;

          return (
            <CandidateTool
              key={`se-${c.id}`}
              x={slot.x}
              y={slot.y - gain * 12}
              name={c.name}
              capability={c.capability}
              glyph={c.glyph}
              state={gain > 0.55 ? "selected" : pass1 > 0.3 && pass2 < 0.4 ? "focus" : "idle"}
              depth={Math.max(0, depth)}
              width={400}
              presence={enter * (1 - lose * 0.45)}
              float={Math.sin(frame / 96 + i * 1.7) * 4}
            />
          );
        })}
      </AbsoluteFill>

      {sweep1Alive ? <ScanPlane progress={sweep1} intensity={0.8} /> : null}
      {sweep2Alive ? <ScanPlane progress={sweep2} intensity={1} tint={accent.blue} /> : null}

      {/* copy column */}
      <TextColumn x={160} y={168} width={620} gap={14}>
        <Eyebrow delay={8}>{SEARCH.eyebrow}</Eyebrow>
        <AccentRule delay={16} color={accent.violet} width={92} />
        <div
          style={{
            fontFamily: MONO,
            fontSize: 62,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: ink.strong,
            marginTop: 8,
            ...riseIn(frame, 22, 24, 26),
          }}
        >
          {SEARCH.headline}
        </div>
        <div style={{ ...T.lede, fontSize: 32, maxWidth: 560, marginTop: 8, ...riseIn(frame, 40, 20, 24) }}>
          {SEARCH.lede}
        </div>
      </TextColumn>

      <SignalReadout signals={SEARCH.signals} frame={frame} start={92} hold={92} x={160} y={604} />
    </SceneShell>
  );
};
