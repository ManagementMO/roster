/**
 * Scene 4 — Roster initialization (0:17–0:23).
 *
 * The resolution of the previous frame's mess. The bundled traffic contracts,
 * the prism materialises where the bundle used to converge, and everything
 * re-forms as clean ribbons into one endpoint plus a single connection down to
 * the agent. This is the "N entries become one" beat, and it has to feel like
 * relief — so the field defocuses, the ribbons thicken, and the frame gets quiet.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { accent, ink } from "../design/colors";
import { type as T } from "../design/typography";
import { AccentRule, Eyebrow, Headline, Lede, riseIn } from "../components/Type/Type";
import { AgentNode } from "../components/Nodes/Nodes";
import { Connection, ConnectionBundle, ConnectionLayer } from "../components/Connection/Connection";
import { coreAperture, RosterCore } from "../components/RosterCore/RosterCore";
import { BackgroundTool } from "../components/ToolObject/ToolObject";
import { FIELD_SORTED } from "../lib/world";
import { clamp, ease } from "../motion/easings";
import { INITIALIZE } from "../productCopy";
import { SceneShell, TextColumn } from "./SceneShell";

const CORE = { x: 1214, y: 462 } as const;
const CORE_SIZE = 268;
const AGENT = { x: 1214, y: 842 } as const;

/** Where the five clean ribbons come in from, once the bundle has resolved. */
const INLETS = [
  { x: 2060, y: -60 },
  { x: 2140, y: 300 },
  { x: 2180, y: 620 },
  { x: 2120, y: 940 },
  { x: 1860, y: 1220 },
] as const;

export const S04Initialize: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  /** The bundle collapses; clean ribbons take over. */
  const collapse = interpolate(frame, [10, 96], [1, 0], { ...clamp, easing: ease.glide });
  const coreIn = interpolate(frame, [56, 108], [0, 1], { ...clamp, easing: ease.arrive });
  const cleanIn = interpolate(frame, [92, 168], [0, 1], { ...clamp, easing: ease.arrive });
  const agentLink = interpolate(frame, [156, 214], [0, 1], { ...clamp, easing: ease.arrive });

  const zoom = interpolate(frame, [0, duration], [1.05, 0.995], { ...clamp, easing: ease.glide });
  const camX = interpolate(frame, [0, duration], [40, -6], { ...clamp, easing: ease.glide });

  const bundleSources = FIELD_SORTED.filter((t) => t.depth < 0.62).slice(0, 30);

  return (
    <SceneShell duration={duration} camera={{ zoom, x: camX, y: 0, focus: 0 }}>
      {/* the field, now defocused — it stops being the subject */}
      <AbsoluteFill>
        {FIELD_SORTED.map((t, _i) => (
          <BackgroundTool
            key={`init-field-${t.x.toFixed(1)}-${t.y.toFixed(1)}`}
            x={t.x}
            y={t.y}
            depth={Math.min(0.97, t.depth + interpolate(frame, [0, 150], [0, 0.24], { ...clamp, easing: ease.glide }))}
            size={t.size}
            presence={interpolate(frame, [0, 140], [1, 0.5], { ...clamp, easing: ease.glide })}
            drift={Math.sin(frame / 108 + t.phase) * 6}
          />
        ))}
      </AbsoluteFill>

      {/* old tangle contracting */}
      <ConnectionLayer>
        <ConnectionBundle
          sources={bundleSources.map((t) => ({ x: t.x, y: t.y }))}
          target={CORE}
          progress={1}
          presence={collapse}
          color={ink.hair}
        />
      </ConnectionLayer>

      {/* clean inbound ribbons + the single agent link */}
      <ConnectionLayer>
        {INLETS.map((p, i) => (
          <Connection
            key={`inlet-${p.x}-${p.y}`}
            trace={`inlet-${i}`}
            from={p}
            to={coreAperture(CORE, CORE_SIZE, [1, 2, 3, 0, 4][i] ?? i)}
            variant="selected"
            bow={((i % 3) - 1) * 26}
            weight={0.85}
            progress={interpolate(cleanIn, [i * 0.09, 0.62 + i * 0.09], [0, 1], clamp)}
            presence={cleanIn}
          />
        ))}
        <Connection
          trace="agent-link"
          from={{ x: CORE.x, y: CORE.y + CORE_SIZE * 0.44 }}
          to={{ x: AGENT.x, y: AGENT.y - 74 }}
          variant="request"
          weight={1.25}
          progress={agentLink}
          presence={agentLink}
          packet={agentLink > 0.98 ? ((frame - 214) % 70) / 70 : null}
        />
      </ConnectionLayer>

      <RosterCore
        center={CORE}
        size={CORE_SIZE}
        state={frame < 150 ? "listening" : "idle"}
        presence={coreIn}
        rotation={interpolate(coreIn, [0, 1], [-26, 0])}
      />

      <AgentNode
        x={AGENT.x}
        y={AGENT.y}
        width={430}
        height={128}
        label="AGENT"
        sublabel="one MCP entry"
        presence={interpolate(frame, [140, 180], [0, 1], { ...clamp, easing: ease.arrive })}
      />

      {/* the core's own label, set on the geometry rather than in a card */}
      <div
        style={{
          position: "absolute",
          left: CORE.x - 200,
          top: CORE.y - CORE_SIZE * 0.5 - 54,
          width: 400,
          textAlign: "center",
          ...T.chip,
          fontSize: 24,
          color: accent.blue,
          ...riseIn(frame, 120, 12, 18),
        }}
      >
        ROSTER · LOCAL
      </div>

      <TextColumn x={160} y={368} width={620} gap={16}>
        <Eyebrow delay={30}>{INITIALIZE.eyebrow}</Eyebrow>
        <AccentRule delay={38} color={accent.blue} width={92} />
        <Headline delay={46} style={{ fontSize: 80, marginTop: 6 }}>
          {INITIALIZE.headline}
        </Headline>
        <Lede delay={70} maxWidth={600} style={{ fontSize: 32, marginTop: 10 }}>
          {INITIALIZE.lede}
        </Lede>
        <div
          style={{
            ...T.chip,
            fontSize: 23,
            color: ink.faint,
            marginTop: 18,
            ...riseIn(frame, 100, 14, 20),
          }}
        >
          {INITIALIZE.proof}
        </div>
      </TextColumn>
    </SceneShell>
  );
};
