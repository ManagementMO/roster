/**
 * Scene 6 — Clearing (0:31–0:37).
 *
 * The rejection is *authored*, not faded. Each cut capability goes through four
 * physical stages, staggered so the viewer watches the whole transformation
 * happen once and then sees it echoed twice:
 *
 *   1. the connection to Roster retracts upward and tears,
 *   2. the glass body drains and the silhouette becomes wireframe,
 *   3. the human labels fragment into the schema tokens they really are,
 *   4. the fragments fall to the bench, where they stay indexed.
 *
 * Nothing is destroyed on screen, because nothing is destroyed in the product:
 * a benched capability can be drafted again the moment the task changes.
 *
 * The copy lives along the bottom rather than the top, which leaves the whole
 * upper half clear for the retracting connections — the beat that has to be
 * legible first.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { accent, alpha, ink } from "../design/colors";
import { type as T } from "../design/typography";
import { AccentRule, Eyebrow, Headline } from "../components/Type/Type";
import { BenchShelf, SchemaToken } from "../components/Nodes/Nodes";
import { Connection, ConnectionLayer } from "../components/Connection/Connection";
import { CandidateTool } from "../components/ToolObject/ToolObject";
import { BENCH_CANDIDATES } from "../lib/world";
import { makeRng, seedFrom } from "../lib/rng";
import { clamp, ease } from "../motion/easings";
import { CLEARING } from "../productCopy";
import { SceneShell, TextColumn } from "./SceneShell";

const CUT_SLOTS = [
  { x: 460, y: 340 },
  { x: 960, y: 340 },
  { x: 1460, y: 340 },
] as const;

const BENCH = { x: 960, y: 626, width: 1340, height: 138 } as const;

/** Real MCP tool-definition keys — the labels fragment into what they came from. */
const TOKEN_TEXT = ["name", "description", "inputSchema", "type", "required", "annotations"] as const;

/** Per-card stage offsets. The first cut is fully readable before the others start. */
const CARD_DELAY = [0, 30, 60] as const;

const STAGE = { retract: 4, wire: 40, fragment: 86, fall: 124 } as const;

interface Token {
  text: string;
  ox: number;
  oy: number;
  /** Absolute x this token files itself at on the shelf. */
  landX: number;
  landRow: 0 | 1;
  rot: number;
  delay: number;
}

/**
 * Landing positions are assigned from a GLOBAL index across all eighteen
 * tokens — nine columns, two rows — rather than per card. Per-card landing
 * stacked three cards' worth of tokens into three narrow columns, which read as
 * a pile-up rather than as a bench with things filed on it.
 */
const SHELF_COL_X = 336;
const SHELF_COL_GAP = 136;

function buildTokens(cardIndex: number): Token[] {
  const rng = makeRng(seedFrom(`clearing-tokens-${cardIndex}`));
  return TOKEN_TEXT.map((text, i) => {
    const global = cardIndex * TOKEN_TEXT.length + i;
    return {
      text,
      ox: -212 + (i % 3) * 162 + rng() * 16,
      oy: -24 + Math.floor(i / 3) * 38 + rng() * 8,
      landX: SHELF_COL_X + (global % 9) * SHELF_COL_GAP,
      landRow: (global < 9 ? 0 : 1) as 0 | 1,
      rot: (rng() - 0.5) * 20,
      delay: i * 5 + rng() * 9,
    };
  });
}

const TOKENS = [0, 1, 2].map(buildTokens);

export const S06Clearing: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const zoom = interpolate(frame, [0, duration], [1.03, 1.0], { ...clamp, easing: ease.glide });
  const camY = interpolate(frame, [0, duration], [-18, 20], { ...clamp, easing: ease.glide });
  const benchLoad = interpolate(frame, [170, 300], [0, 1], { ...clamp, easing: ease.glide });

  return (
    <SceneShell duration={duration} camera={{ zoom, x: 0, y: camY, focus: 0 }}>
      {/* stage 1 — the connections retract and tear */}
      <ConnectionLayer>
        {CUT_SLOTS.map((slot, i) => {
          const d = CARD_DELAY[i] ?? 0;
          const retract = interpolate(frame, [d + STAGE.retract, d + STAGE.retract + 44], [0, 1], {
            ...clamp,
            easing: ease.depart,
          });
          const broke = frame > d + STAGE.retract + 8;
          return (
            <Connection
              key={`cut-link-${slot.x}`}
              trace={`cut-link-${i}`}
              from={{ x: slot.x + (i - 1) * 120, y: -110 }}
              to={{ x: slot.x, y: slot.y - 74 }}
              variant={broke ? "broken" : "selected"}
              weight={1}
              progress={1}
              retract={retract}
              presence={interpolate(retract, [0, 0.88, 1], [1, 0.8, 0], clamp)}
            />
          );
        })}
      </ConnectionLayer>

      {/* stages 2 + 3 — the bodies wireframe, the labels fragment */}
      <AbsoluteFill>
        {CUT_SLOTS.map((slot, i) => {
          const c = BENCH_CANDIDATES[i];
          const d = CARD_DELAY[i] ?? 0;
          if (!c) return null;
          const dissolve = interpolate(frame, [d + STAGE.wire, d + STAGE.wire + 34], [0, 1], {
            ...clamp,
            easing: ease.glide,
          });
          // The shell does not vanish — it settles onto the bench as a ghost, so
          // the last second of the scene still has mass where the eye is looking.
          const shellFade = interpolate(frame, [d + STAGE.fall + 24, d + STAGE.fall + 92], [1, 0.42], {
            ...clamp,
            easing: ease.glide,
          });
          const sink = interpolate(frame, [d + STAGE.fall, d + STAGE.fall + 96], [0, 150], {
            ...clamp,
            easing: ease.arrive,
          });
          return (
            <CandidateTool
              key={`cut-${c.id}`}
              x={slot.x}
              y={slot.y}
              name={c.name}
              capability={c.capability}
              glyph={c.glyph}
              state="rejected"
              width={400}
              dissolve={dissolve}
              presence={shellFade}
              float={sink}
            />
          );
        })}
      </AbsoluteFill>

      {/* stage 3 + 4 — the schema tokens, falling to the bench */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {CUT_SLOTS.map((slot, i) =>
          (TOKENS[i] ?? []).map((tk, _j) => {
            const d = (CARD_DELAY[i] ?? 0) + STAGE.fragment + tk.delay;
            const appear = interpolate(frame, [d, d + 14], [0, 1], { ...clamp, easing: ease.arrive });
            if (appear <= 0.001) return null;
            const fallStart = d + 26;
            const fall = interpolate(frame, [fallStart, fallStart + 78], [0, 1], {
              ...clamp,
              easing: ease.arrive,
            });
            const targetY = BENCH.y - 28 + tk.landRow * 40;
            const targetX = tk.landX;
            const startX = slot.x + tk.ox;
            const startY = slot.y + tk.oy;
            const x = startX + (targetX - startX) * fall;
            const y = startY + (targetY - startY) * fall;
            const fade = appear * interpolate(fall, [0, 0.84, 1], [1, 1, 0.78], clamp);
            return (
              <SchemaToken
                key={`tok-${slot.x}-${tk.text}`}
                x={x}
                y={y}
                text={tk.text}
                opacity={fade}
                rotation={tk.rot * (1 - fall)}
                scale={interpolate(fall, [0, 1], [1, 0.86])}
              />
            );
          }),
        )}
      </AbsoluteFill>

      {/* the bench label sits ABOVE the shelf, so landing tokens never cover it */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: BENCH.y + BENCH.height / 2 + 18,
          textAlign: "center",
          ...T.chip,
          fontSize: 24,
          color: ink.faint,
          opacity: interpolate(frame, [268, 300], [0, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        BENCH · STILL INDEXED · CAN BE DRAFTED AGAIN
      </div>

      <BenchShelf
        x={BENCH.x}
        y={BENCH.y}
        width={BENCH.width}
        height={BENCH.height}
        label=""
        presence={interpolate(frame, [64, 108], [0, 1], { ...clamp, easing: ease.arrive })}
        load={benchLoad}
      />

      {/* copy: headline left, the reassurance right, on one bottom baseline */}
      <TextColumn x={160} y={822} width={960} gap={12}>
        <Eyebrow delay={6} color={alpha(ink.faint, 0.95)}>
          {CLEARING.eyebrow}
        </Eyebrow>
        <AccentRule delay={12} color={accent.blue} width={88} />
        <Headline delay={18} size="title" style={{ fontSize: 62, marginTop: 2 }}>
          {CLEARING.headline}
        </Headline>
      </TextColumn>

      <div
        style={{
          position: "absolute",
          left: 1190,
          top: 856,
          width: 570,
          ...T.support,
          fontSize: 26,
          color: ink.muted,
          opacity: interpolate(frame, [150, 186], [0, 1], { ...clamp, easing: ease.arrive }),
        }}
      >
        {CLEARING.lede}
      </div>
    </SceneShell>
  );
};
