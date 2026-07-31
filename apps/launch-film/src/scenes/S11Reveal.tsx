/**
 * Scene 11 — Final reveal (0:54–0:58).
 *
 * The five starting positions collapse into the five blades of the mark. Then
 * the frame goes almost entirely white and holds: wordmark, tagline, command,
 * and the honest pre-release note, with enough still time to read all four.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { accent, alpha, ink } from "../design/colors";
import { type as T } from "../design/typography";
import { CommandPlate, Convergence, MarkArrival, Wordmark } from "../components/BrandReveal/BrandReveal";
import { bloomVeil } from "../design/effects";
import { LINEUP, LINEUP_FLOOR } from "../lib/world";
import { clamp, ease } from "../motion/easings";
import { REVEAL } from "../productCopy";
import { SceneShell } from "./SceneShell";

const MARK = { x: 960, y: 300 } as const;
const MARK_SIZE = 168;

const T_CONVERGE = 0;
const T_MARK = 72;
const T_WORD = 96;
const T_TAG = 126;
const T_CMD = 148;

export const S11Reveal: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const converge = interpolate(frame, [T_CONVERGE, T_MARK + 12], [0, 1], { ...clamp, easing: ease.glide });
  const zoom = interpolate(frame, [0, 90, duration], [1.06, 1.0, 1.008], { ...clamp, easing: ease.glide });

  // The room brightens as the mark lands, then settles — one controlled bloom.
  const veil = interpolate(frame, [T_MARK - 8, T_MARK + 6, T_MARK + 54], [0, 0.36, 0.06], {
    ...clamp,
    easing: ease.glide,
  });

  const startPoints = LINEUP.map((slot) => ({ x: slot.x, y: LINEUP_FLOOR - slot.height / 2 }));

  return (
    <SceneShell duration={duration} camera={{ zoom, x: 0, y: 0, focus: 0 }}>
      {converge < 0.999 ? (
        <Convergence from={startPoints} to={MARK} progress={converge} radiusPx={MARK_SIZE * 0.42} />
      ) : null}

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-start",
          flexDirection: "column",
          paddingTop: MARK.y - MARK_SIZE / 2,
        }}
      >
        <MarkArrival size={MARK_SIZE} delay={T_MARK} />

        <div style={{ marginTop: 34 }}>
          <Wordmark text={REVEAL.wordmark} frame={frame} start={T_WORD} size={158} />
        </div>

        <div
          style={{
            ...T.lede,
            fontSize: 36,
            color: ink.muted,
            marginTop: 20,
            textAlign: "center",
            opacity: interpolate(frame, [T_TAG, T_TAG + 24], [0, 1], { ...clamp, easing: ease.arrive }),
            translate: `0px ${interpolate(frame, [T_TAG, T_TAG + 28], [16, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px`,
          }}
        >
          {REVEAL.tagline}
        </div>

        <div style={{ marginTop: 52 }}>
          <CommandPlate command={REVEAL.command} note={REVEAL.note} delay={T_CMD} />
        </div>

        <div
          style={{
            ...T.chip,
            fontSize: 22,
            color: alpha(ink.faint, 0.85),
            marginTop: 26,
            opacity: interpolate(frame, [T_CMD + 24, T_CMD + 46], [0, 1], { ...clamp, easing: ease.arrive }),
          }}
        >
          {REVEAL.license}
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={bloomVeil(veil, accent.blueLift)} />
    </SceneShell>
  );
};
