/**
 * Scene 9 — The Sixth Man (0:47–0:50).
 *
 * The most important truth in the film. A starter hard-fails, its path tears,
 * and Roster raises the next-ranked equivalent — as a SUGGESTION. The suggested
 * ribbon stays dashed and the card reads AWAITING AGENT until the agent visibly
 * accepts; only then does the ribbon become solid and the card read ACCEPTED.
 *
 * That is exactly what the shipped router does: `sixthManSuggestion()` attaches
 * `_roster.suggested_alternate` to the failed result and records it. It never
 * calls the alternate. Automatic substitution is an OPEN owner decision
 * (STATUS-FOR-MO P8) and is not portrayed here.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { accent, alpha, ink } from "../design/colors";
import { MONO, type as T } from "../design/typography";
import { Eyebrow, StateChip } from "../components/Type/Type";
import { AgentNode } from "../components/Nodes/Nodes";
import { Connection, ConnectionLayer } from "../components/Connection/Connection";
import { coreEdge, RosterCore } from "../components/RosterCore/RosterCore";
import { CandidateTool, HeroTool } from "../components/ToolObject/ToolObject";
import { chromaticSplit } from "../design/effects";
import { clamp, ease } from "../motion/easings";
import { SIXTH_MAN } from "../productCopy";
import { SceneShell } from "./SceneShell";

const AGENT = { x: 340, y: 540 } as const;
const CORE = { x: 900, y: 540, size: 250 } as const;
/** The starter that fails: kept large, so its failure is the loudest thing here. */
const FAILED = { x: 1540, bottom: 826, width: 300, height: 336 } as const;
/** The alternate Roster raises, above and behind the failure. */
const SUGGESTED = { x: 1500, y: 250 } as const;

const T_FAIL = 8;
const T_SUGGEST = 50;
const T_ACCEPT = 114;

export const S09SixthMan: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const retract = interpolate(frame, [T_FAIL + 6, T_FAIL + 46], [0, 1], { ...clamp, easing: ease.depart });
  const suggest = interpolate(frame, [T_SUGGEST, T_SUGGEST + 34], [0, 1], { ...clamp, easing: ease.arrive });
  const accept = interpolate(frame, [T_ACCEPT, T_ACCEPT + 26], [0, 1], { ...clamp, easing: ease.arrive });
  const accepted = accept > 0.5;

  const zoom = interpolate(frame, [0, duration], [1.0, 1.035], { ...clamp, easing: ease.glide });

  return (
    <SceneShell duration={duration} camera={{ zoom, x: 0, y: 0, focus: 0 }}>
      <Eyebrow
        delay={2}
        color={accent.coral}
        style={{ position: "absolute", left: 160, top: 132 }}
      >
        {SIXTH_MAN.eyebrow}
      </Eyebrow>

      <ConnectionLayer>
        {/* the agent's own link stays up — nothing about the agent failed */}
        <Connection
          trace="six-agent"
          from={{ x: AGENT.x + 152, y: AGENT.y }}
          to={coreEdge(CORE, CORE.size, 270)}
          variant="selected"
          weight={1}
          progress={1}
        />
        {/* the failed path, tearing */}
        <Connection
          trace="six-broken"
          from={coreEdge(CORE, CORE.size, 106)}
          to={{ x: FAILED.x - FAILED.width / 2 - 10, y: FAILED.bottom - FAILED.height * 0.55 }}
          variant="broken"
          weight={1.2}
          progress={1}
          retract={retract}
          presence={interpolate(retract, [0, 0.9, 1], [1, 0.9, 0.45], clamp)}
        />
        {/* the suggestion: dashed until accepted, then a solid selected ribbon */}
        {suggest > 0.001 ? (
          <Connection
            trace="six-suggested"
            from={coreEdge(CORE, CORE.size, 52)}
            to={{ x: SUGGESTED.x - 210, y: SUGGESTED.y }}
            variant={accepted ? "selected" : "suggested"}
            weight={accepted ? 1.05 : 0.95}
            progress={suggest}
            presence={suggest}
            packet={accept > 0.9 ? ((frame - T_ACCEPT - 26) % 46) / 46 : null}
          />
        ) : null}
      </ConnectionLayer>

      <AgentNode
        x={AGENT.x}
        y={AGENT.y}
        width={304}
        height={150}
        label="AGENT"
        presence={1}
        pulse={interpolate(frame, [T_ACCEPT - 10, T_ACCEPT + 2, T_ACCEPT + 34], [0, 0.55, 0], { ...clamp, easing: ease.glide })}
      />

      <RosterCore
        center={CORE}
        size={CORE.size}
        state={frame < T_SUGGEST ? "failure" : "suggestion"}
        activeBlade={1}
        presence={1}
        sixth={suggest * (accepted ? 1 : 0.72)}
      />

      {/* the failed starter, benched but never deleted */}
      <AbsoluteFill style={chromaticSplit(interpolate(frame, [T_FAIL, T_FAIL + 8, T_FAIL + 26], [0, 3, 0], clamp))}>
        <HeroTool
          x={FAILED.x}
          bottom={FAILED.bottom}
          width={FAILED.width}
          height={FAILED.height}
          no="03"
          name={SIXTH_MAN.failedName}
          capability={SIXTH_MAN.alternateCapability}
          glyph="globe"
          startFrame={-40}
          tint={accent.coral}
          presence={interpolate(frame, [T_SUGGEST + 16, T_SUGGEST + 64], [1, 0.55], { ...clamp, easing: ease.glide })}
        />
      </AbsoluteFill>

      <div style={{ position: "absolute", left: FAILED.x - 92, top: FAILED.bottom + 26 }}>
        <StateChip label="HARD FAIL" color={accent.coral} delay={T_FAIL} />
      </div>

      {/* the suggested alternate rising */}
      {suggest > 0.001 ? (
        <AbsoluteFill
          style={{
            opacity: suggest,
            translate: `0px ${interpolate(suggest, [0, 1], [56, 0]).toFixed(2)}px`,
          }}
        >
          <CandidateTool
            x={SUGGESTED.x}
            y={SUGGESTED.y}
            name={SIXTH_MAN.alternateName}
            capability={SIXTH_MAN.alternateCapability}
            glyph="download"
            state={accepted ? "selected" : "suggested"}
            width={400}
          />
          <div style={{ position: "absolute", left: SUGGESTED.x - 118, top: SUGGESTED.y + 92 }}>
            <StateChip
              label={accepted ? SIXTH_MAN.acceptedLabel : SIXTH_MAN.awaitingLabel}
              color={accepted ? accent.blue : accent.violet}
              delay={T_SUGGEST + 12}
            />
          </div>
        </AbsoluteFill>
      ) : null}

      {/* the payload the router actually attaches, then the law in plain words */}
      <div
        style={{
          position: "absolute",
          left: 160,
          top: 754,
          fontFamily: MONO,
          fontSize: 25,
          color: accent.violet,
          opacity: interpolate(frame, [T_SUGGEST + 8, T_SUGGEST + 32], [0, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        {SIXTH_MAN.payload}
      </div>
      <div
        style={{
          position: "absolute",
          left: 160,
          top: 800,
          width: 820,
          ...T.support,
          fontSize: 28,
          color: ink.muted,
          opacity: interpolate(frame, [T_SUGGEST + 20, T_SUGGEST + 46], [0, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        {SIXTH_MAN.truth}
      </div>

      {/* one restrained coral flash on the failure, then gone */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          mixBlendMode: "multiply",
          opacity: interpolate(frame, [T_FAIL, T_FAIL + 6, T_FAIL + 30], [0, 0.15, 0], { ...clamp, easing: ease.glide }),
          background: `radial-gradient(1200px 900px at ${FAILED.x}px ${FAILED.bottom - 180}px, ${alpha(accent.coral, 0.5)} 0%, rgba(255,255,255,0) 70%)`,
        }}
      />
    </SceneShell>
  );
};
