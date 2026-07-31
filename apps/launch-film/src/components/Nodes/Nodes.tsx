/**
 * The two other physical objects in the film's world: the agent, and the bench.
 *
 * Both are deliberately *not* card-shaped. The agent is a wide horizontal slab
 * (a context window has a width problem, so its object does too) and the bench is
 * a low plinth. Keeping them geometrically distinct from tool cards is what lets
 * a still frame be read without labels.
 */
import type React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { accent, alpha, ink } from "../../design/colors";
import { glassEdge, material, sheen } from "../../design/materials";
import { radius } from "../../design/spacing";
import { MONO, type as T } from "../../design/typography";
import { clamp, ease } from "../../motion/easings";

export interface AgentNodeProps {
  x: number;
  y: number;
  width?: number;
  height?: number;
  label?: string;
  sublabel?: string;
  /** 0→1 entrance. */
  presence?: number;
  /** 0→1 strain — how overloaded the agent looks. Drives an amber-to-coral rim. */
  strain?: number;
  /** Brief acknowledgement flash, 0→1. */
  pulse?: number;
}

export const AgentNode: React.FC<AgentNodeProps> = ({
  x,
  y,
  width = 460,
  height = 136,
  label = "AGENT",
  sublabel,
  presence = 1,
  strain = 0,
  pulse = 0,
}) => {
  const rim = strain > 0.02 ? alpha(accent.amber, 0.2 + strain * 0.5) : alpha("#FFFFFF", 0.9);
  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y - height / 2,
        width,
        height,
        opacity: presence,
        scale: interpolate(presence, [0, 1], [0.94, 1]),
      }}
    >
      <div style={{ ...material("optical", { r: radius.panel, lift: 34 }), position: "absolute", inset: 0 }}>
        <div style={sheen(radius.panel, 0.9)} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: radius.panel,
            opacity: pulse,
            mixBlendMode: "screen",
            background: `linear-gradient(150deg, ${alpha("#FFFFFF", 0.9)} 0%, ${alpha(accent.blue, 0.5)} 60%, rgba(255,255,255,0) 100%)`,
          }}
        />
      </div>
      <div style={{ ...glassEdge(radius.panel, 1, 2), background: `linear-gradient(148deg, ${rim} 0%, ${alpha("#7C818E", 0.3)} 100%)` }} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <AgentGlyph size={34} strain={strain} />
          <span style={{ ...T.chip, fontSize: 26, color: ink.strong, letterSpacing: "0.2em" }}>{label}</span>
        </div>
        {sublabel ? (
          <span style={{ fontFamily: MONO, fontSize: 22, color: ink.faint }}>{sublabel}</span>
        ) : null}
      </div>
    </div>
  );
};

/** The agent's own mark: a squared bracket pair around a solid centre. */
const AgentGlyph: React.FC<{ size: number; strain: number }> = ({ size, strain }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48">
    <path
      d="M17 9h-6a3 3 0 0 0-3 3v24a3 3 0 0 0 3 3h6M31 9h6a3 3 0 0 1 3 3v24a3 3 0 0 1-3 3h-6"
      fill="none"
      stroke={ink.base}
      strokeWidth={2.8}
      strokeLinecap="round"
    />
    <rect
      x="19"
      y="19"
      width="10"
      height="10"
      rx="3"
      fill={strain > 0.3 ? accent.amber : accent.blue}
      opacity={0.9}
    />
  </svg>
);

/**
 * The bench: where cut capabilities go. A low plinth, not a bin — nothing is
 * deleted, so the object has to look like storage rather than disposal.
 */
export const BenchShelf: React.FC<{
  x: number;
  y: number;
  width?: number;
  height?: number;
  label: string;
  presence?: number;
  /** How many fragments have landed, 0→1, which warms the surface slightly. */
  load?: number;
}> = ({ x, y, width = 1160, height = 128, label, presence = 1, load = 0 }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y - height / 2,
        width,
        height,
        opacity: presence,
      }}
    >
      <div
        style={{
          ...material("solidGlass", { r: radius.panel, lift: 18 }),
          position: "absolute",
          inset: 0,
        }}
      >
        <div style={sheen(radius.panel, 0.8)} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: radius.panel,
            opacity: load * 0.5,
            background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, ${alpha(ink.hair, 0.22)} 100%)`,
          }}
        />
      </div>
      <div style={glassEdge(radius.panel, 1, 1.8)} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...T.chip,
          fontSize: 24,
          color: ink.faint,
          opacity: interpolate(frame, [0, 20], [0, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        {label}
      </div>
    </div>
  );
};

/**
 * A schema token — what a rejected card's labels fragment into. Small slivers of
 * mono type on hairline chips, so the fragmentation reads as "this became data
 * again", not "this shattered".
 */
export const SchemaToken: React.FC<{
  x: number;
  y: number;
  text: string;
  opacity: number;
  rotation?: number;
  scale?: number;
}> = ({ x, y, text, opacity, rotation = 0, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      opacity,
      rotate: `${rotation.toFixed(2)}deg`,
      scale,
      fontFamily: MONO,
      fontSize: 21,
      color: ink.muted,
      background: alpha("#FFFFFF", 0.94),
      border: `2px solid ${alpha(ink.hair, 0.85)}`,
      borderRadius: 6,
      padding: "5px 11px",
      whiteSpace: "nowrap",
      boxShadow: `0 4px 14px ${alpha("#2A2D33", 0.08)}`,
    }}
  >
    {text}
  </div>
);
