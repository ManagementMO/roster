/**
 * Scene 8 — Tool call (0:43–0:47).
 *
 * Three objects, two ribbons, one round trip. The agent calls once; the request
 * travels into the prism, leaves through the aperture the router selected,
 * reaches the capability, and comes back as a result. Deliberately the emptiest
 * frame in the film — the whole point is that the path is unmistakable.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { accent, alpha, ink } from "../design/colors";
import { MONO, type as T } from "../design/typography";
import { Eyebrow, Headline } from "../components/Type/Type";
import { AgentNode } from "../components/Nodes/Nodes";
import { Connection, ConnectionLayer } from "../components/Connection/Connection";
import { coreEdge, RosterCore } from "../components/RosterCore/RosterCore";
import { HeroTool } from "../components/ToolObject/ToolObject";
import { clamp, ease } from "../motion/easings";
import { STARTERS, TOOL_CALL } from "../productCopy";
import { SceneShell } from "./SceneShell";

export const CALL_GEOMETRY = {
  agent: { x: 348, y: 566 },
  core: { x: 960, y: 566 },
  coreSize: 262,
  target: { x: 1566, bottom: 748, width: 300, height: 360 },
  /**
   * The request leaves along the TOP and the result comes back along the
   * BOTTOM, arcing under the prism. Sharing one lane made the two ribbons cross
   * between the agent and the core, which read as a tangle rather than a round
   * trip — direction is the whole point of this shot.
   */
  outY: 494,
  backY: 646,
} as const;

/** Beats, in local frames. */
const T_REQUEST = 26;
const T_ROUTE = 78;
const T_RETURN = 132;

export const S08ToolCall: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const g = CALL_GEOMETRY;

  const reqDraw = interpolate(frame, [T_REQUEST, T_REQUEST + 34], [0, 1], { ...clamp, easing: ease.arrive });
  const routeDraw = interpolate(frame, [T_ROUTE, T_ROUTE + 34], [0, 1], { ...clamp, easing: ease.arrive });
  const retDraw = interpolate(frame, [T_RETURN, T_RETURN + 40], [0, 1], { ...clamp, easing: ease.arrive });

  const reqPacket = frame >= T_REQUEST && frame < T_ROUTE + 20 ? interpolate(frame, [T_REQUEST + 6, T_ROUTE + 4], [0, 1], clamp) : null;
  const routePacket = frame >= T_ROUTE && frame < T_RETURN + 10 ? interpolate(frame, [T_ROUTE + 6, T_RETURN], [0, 1], clamp) : null;
  const retPacket = frame >= T_RETURN ? interpolate(frame, [T_RETURN + 8, T_RETURN + 62], [0, 1], clamp) : null;

  const coreState = frame < T_ROUTE ? "listening" : frame < T_RETURN ? "routing" : "success";

  const zoom = interpolate(frame, [0, duration], [1.0, 1.03], { ...clamp, easing: ease.glide });

  return (
    <SceneShell duration={duration} camera={{ zoom, x: 0, y: 0, focus: 0 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 128,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Eyebrow delay={4} color={accent.blue}>
          {TOOL_CALL.eyebrow}
        </Eyebrow>
        <Headline delay={12} style={{ fontSize: 68, textAlign: "center" }}>
          {TOOL_CALL.headline}
        </Headline>
      </div>

      {/* ribbons behind the glass objects, so the objects occlude them */}
      <ConnectionLayer>
        <Connection
          trace="call-request"
          from={{ x: g.agent.x + 152, y: g.agent.y - 34 }}
          to={coreEdge(g.core, g.coreSize, 288)}
          variant="request"
          weight={1.1}
          bow={-26}
          progress={reqDraw}
          presence={reqDraw}
          packet={reqPacket}
        />
        <Connection
          trace="call-route"
          from={coreEdge(g.core, g.coreSize, 72)}
          to={{ x: g.target.x - g.target.width / 2 - 10, y: g.outY }}
          variant="request"
          weight={1.1}
          bow={-22}
          progress={routeDraw}
          presence={routeDraw}
          packet={routePacket}
        />
        <Connection
          trace="call-return"
          from={{ x: g.target.x - g.target.width / 2 - 10, y: g.backY }}
          to={{ x: g.agent.x + 152, y: g.agent.y + 40 }}
          variant="return"
          weight={1.0}
          bow={-186}
          progress={retDraw}
          presence={retDraw}
          packet={retPacket}
        />
      </ConnectionLayer>

      <AgentNode
        x={g.agent.x}
        y={g.agent.y}
        width={304}
        height={150}
        label={TOOL_CALL.agent}
        presence={interpolate(frame, [0, 22], [0, 1], { ...clamp, easing: ease.arrive })}
        pulse={interpolate(frame, [T_RETURN + 46, T_RETURN + 58, T_RETURN + 90], [0, 0.5, 0], { ...clamp, easing: ease.glide })}
      />

      <RosterCore
        center={g.core}
        size={g.coreSize}
        state={coreState}
        activeBlade={1}
        presence={interpolate(frame, [4, 28], [0, 1], { ...clamp, easing: ease.arrive })}
      />

      <AbsoluteFill>
        <HeroTool
          x={g.target.x}
          bottom={g.target.bottom}
          width={g.target.width}
          height={g.target.height}
          no={STARTERS[0]?.no ?? "01"}
          name={TOOL_CALL.target}
          capability={STARTERS[0]?.capability ?? ""}
          glyph="folder"
          startFrame={8}
          tint={accent.blue}
        />
      </AbsoluteFill>

      {/* the two path labels — set on the ribbons, in mono, nothing else */}
      <PathLabel
        x={700}
        y={412}
        text={TOOL_CALL.request}
        color={accent.blue}
        appear={interpolate(frame, [T_REQUEST + 12, T_REQUEST + 30], [0, 1], { ...clamp, easing: ease.arrive })}
      />
      <PathLabel
        x={960}
        y={846}
        text={TOOL_CALL.result}
        color={accent.cyan}
        appear={interpolate(frame, [T_RETURN + 16, T_RETURN + 36], [0, 1], { ...clamp, easing: ease.arrive })}
      />

      {/* the endpoint's own name, on the geometry */}
      <div
        style={{
          position: "absolute",
          left: g.core.x - 180,
          top: g.core.y - g.coreSize * 0.5 - 52,
          width: 360,
          textAlign: "center",
          ...T.chip,
          fontSize: 24,
          color: accent.blue,
          opacity: interpolate(frame, [22, 44], [0, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        {TOOL_CALL.core}
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 968,
          textAlign: "center",
          ...T.support,
          fontSize: 26,
          color: ink.muted,
          opacity: interpolate(frame, [T_RETURN + 30, T_RETURN + 56], [0, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        {TOOL_CALL.lede}
      </div>
    </SceneShell>
  );
};

const PathLabel: React.FC<{ x: number; y: number; text: string; color: string; appear: number }> = ({
  x,
  y,
  text,
  color,
  appear,
}) => (
  <div
    style={{
      position: "absolute",
      left: x - 150,
      top: y,
      width: 300,
      textAlign: "center",
      fontFamily: MONO,
      fontSize: 25,
      fontWeight: 500,
      color,
      opacity: appear,
      translate: `0px ${((1 - appear) * 10).toFixed(2)}px`,
      textShadow: `0 2px 14px ${alpha("#FFFFFF", 0.9)}`,
    }}
  >
    {text}
  </div>
);
