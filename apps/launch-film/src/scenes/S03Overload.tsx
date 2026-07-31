/**
 * Scene 3 — Overload (0:10–0:17).
 *
 * The problem, stated physically. Six readable capabilities sit in the near
 * field, a hundred-plus anonymous ones recede behind them, and every one of them
 * is pushing schema down into a single agent that has one context window to hold
 * it all. Scale comes from depth, occlusion and bundled traffic — not from
 * drawing two hundred labels nobody can read.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { accent, alpha, ink } from "../design/colors";
import { type as T } from "../design/typography";
import { AccentRule, Eyebrow, Headline, riseIn } from "../components/Type/Type";
import { AgentNode } from "../components/Nodes/Nodes";
import { ConnectionBundle, ConnectionLayer } from "../components/Connection/Connection";
import { BackgroundTool, CandidateTool } from "../components/ToolObject/ToolObject";
import { CANDIDATES, FIELD_SORTED } from "../lib/world";
import { clamp, ease } from "../motion/easings";
import { cascade } from "../motion/stagger";
import { OVERLOAD } from "../productCopy";
import { SceneShell, TextColumn } from "./SceneShell";

/**
 * Five readable foreground tools. They stay entirely clear of the copy column
 * (x < 880, y < 700) and of the agent slab, so no frame in this scene has a
 * text-over-card collision — the density comes from the field behind them.
 */
const NEAR_SLOTS = [
  { x: 1250, y: 218, depth: 0.08 },
  { x: 1556, y: 386, depth: 0.16 },
  { x: 1286, y: 552, depth: 0.02 },
  { x: 1552, y: 718, depth: 0.11 },
  { x: 400, y: 806, depth: 0.06 },
] as const;

const AGENT = { x: 960, y: 862 } as const;

export const S03Overload: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  // Density builds through the scene: the field keeps arriving.
  const density = interpolate(frame, [0, 130], [0.34, 1], { ...clamp, easing: ease.glide });
  const bundleIn = interpolate(frame, [56, 170], [0, 1], { ...clamp, easing: ease.arrive });
  const strain = interpolate(frame, [120, 300], [0, 1], { ...clamp, easing: ease.glide });

  // Camera drifts down and pushes in — pressure toward the agent.
  const zoom = interpolate(frame, [0, duration], [0.97, 1.055], { ...clamp, easing: ease.glide });
  const camY = interpolate(frame, [0, duration], [-26, 22], { ...clamp, easing: ease.glide });

  const bundleSources = FIELD_SORTED.filter((t) => t.depth < 0.6 && t.y < 760).slice(0, 26);

  return (
    <SceneShell duration={duration} camera={{ zoom, x: 0, y: camY, focus: 0 }}>
      {/* far field */}
      <AbsoluteFill>
        {FIELD_SORTED.map((t, i) => {
          const at = cascade(i, FIELD_SORTED.length, 92);
          const arrive = interpolate(frame - at, [0, 26], [0, 1], { ...clamp, easing: ease.arrive });
          return (
            <BackgroundTool
              key={`ov-field-${t.x.toFixed(1)}-${t.y.toFixed(1)}`}
              x={t.x}
              y={t.y}
              depth={t.depth}
              size={t.size}
              presence={arrive * density}
              drift={Math.sin(frame / 108 + t.phase) * 7}
            />
          );
        })}
      </AbsoluteFill>

      {/* bundled traffic pressing down into the agent */}
      <ConnectionLayer>
        <ConnectionBundle
          sources={bundleSources.map((t) => ({ x: t.x, y: t.y }))}
          target={{ x: AGENT.x, y: AGENT.y - 74 }}
          progress={bundleIn}
          presence={bundleIn}
          color={ink.hair}
        />
      </ConnectionLayer>

      {/* the six readable ones */}
      <AbsoluteFill>
        {NEAR_SLOTS.map((slot, i) => {
          const c = CANDIDATES[i];
          if (!c) return null;
          const at = 22 + i * 11;
          const arrive = interpolate(frame - at, [0, 30], [0, 1], { ...clamp, easing: ease.arrive });
          return (
            <CandidateTool
              key={`ov-near-${c.id}`}
              x={slot.x}
              y={slot.y}
              name={c.name}
              capability={c.capability}
              glyph={c.glyph}
              state="idle"
              depth={slot.depth}
              width={400}
              presence={arrive}
              float={Math.sin(frame / 92 + i) * 5}
            />
          );
        })}
      </AbsoluteFill>

      {/* the agent, under load */}
      <AgentNode
        x={AGENT.x}
        y={AGENT.y}
        width={470}
        height={138}
        label="AGENT"
        sublabel="one context window"
        presence={interpolate(frame, [30, 62], [0, 1], { ...clamp, easing: ease.arrive })}
        strain={strain}
      />

      {/* copy */}
      <TextColumn x={160} y={140} width={700} gap={16}>
        <Eyebrow delay={14}>{OVERLOAD.eyebrow}</Eyebrow>
        <AccentRule delay={20} color={accent.amber} width={92} />
        <Headline delay={26} style={{ fontSize: 84, marginTop: 6 }}>
          {OVERLOAD.headline}
        </Headline>
        <div style={{ ...T.support, fontSize: 30, maxWidth: 650, marginTop: 14, ...riseIn(frame, 52, 20, 24) }}>
          {OVERLOAD.stat}
        </div>
        <div style={{ ...T.support, fontSize: 30, maxWidth: 650, color: ink.faint, ...riseIn(frame, 74, 20, 24) }}>
          {OVERLOAD.statTwo}
        </div>
        <div
          style={{
            ...T.chip,
            fontSize: 22,
            color: alpha(ink.faint, 0.9),
            marginTop: 10,
            ...riseIn(frame, 96, 12, 20),
          }}
        >
          {OVERLOAD.cite}
        </div>
      </TextColumn>
    </SceneShell>
  );
};
