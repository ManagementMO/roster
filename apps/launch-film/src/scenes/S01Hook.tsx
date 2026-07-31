/**
 * Scene 1 — Hook (0:00–0:03).
 *
 * The thesis, readable in under two seconds. Everything else is subtraction: no
 * product, no UI, no logo yet. A field of anonymous capabilities sits far behind
 * the type at the very edge of perception, and on "ONLY FIVE" it dims while five
 * of them hold their light — so the sentence is *shown* before it is explained.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { accent, alpha } from "../design/colors";
import { CENTER } from "../design/spacing";
import { type as T } from "../design/typography";
import { clamp, ease } from "../motion/easings";
import { HOOK_LINES } from "../productCopy";
import { BackgroundTool } from "../components/ToolObject/ToolObject";
import { FIELD } from "../lib/world";
import { SceneShell } from "./SceneShell";

/**
 * The five that keep their light.
 *
 * They were originally scattered on the mark's own pentagon, which put two of
 * them straight through the headline. A quiet row beneath the sentence says the
 * same thing — five, selected, lit — without ever touching the type.
 */
const FIVE = [0, 1, 2, 3, 4].map((i) => ({ x: CENTER.x + (i - 2) * 78, y: 782 }));

export const S01Hook: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  // The field dims on the second line so the "only five" idea lands visually.
  const fieldFade = interpolate(frame, [0, 26, 84, 116], [0, 0.62, 0.62, 0.16], {
    ...clamp,
    easing: ease.glide,
  });
  const fiveRise = interpolate(frame, [86, 122], [0, 1], { ...clamp, easing: ease.arrive });

  return (
    <SceneShell duration={duration} camera={{ zoom: interpolate(frame, [0, duration], [1.03, 1.0], { ...clamp, easing: ease.glide }), x: 0, y: 0, focus: 0 }}>
      {/* the anonymous field, kept clear of the type block by a radial falloff */}
      <AbsoluteFill>
        {FIELD.map((t, _i) => {
          const dx = (t.x - CENTER.x) / 960;
          const dy = (t.y - CENTER.y) / 540;
          const clearance = Math.min(1, Math.max(0, Math.hypot(dx * 0.62, dy * 1.5) - 0.44) * 1.9);
          if (clearance < 0.04) return null;
          return (
            <BackgroundTool
              key={`hook-field-${t.x.toFixed(1)}-${t.y.toFixed(1)}`}
              x={t.x}
              y={t.y}
              depth={Math.min(0.97, t.depth * 0.6 + 0.34)}
              size={t.size * 0.82}
              presence={fieldFade * clearance}
              drift={Math.sin(frame / 96 + t.phase) * 5}
            />
          );
        })}
      </AbsoluteFill>

      {/* the five that stay lit */}
      <AbsoluteFill>
        {FIVE.map((p, _i) => (
          <div
            key={`hook-five-${p.x}`}
            style={{
              position: "absolute",
              left: p.x - 27,
              top: p.y - 27,
              width: 54,
              height: 54,
              borderRadius: 15,
              opacity: fiveRise * 0.9,
              scale: interpolate(fiveRise, [0, 1], [0.5, 1], { output: "perceptual-scale" }),
              background: `linear-gradient(150deg, ${alpha("#FFFFFF", 0.98)} 0%, ${alpha(accent.blue, 0.2)} 100%)`,
              boxShadow: `0 10px 30px ${alpha(accent.blue, 0.22)}, inset 0 0 0 1.8px ${alpha("#FFFFFF", 0.95)}`,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 15,
                borderRadius: 7,
                background: alpha(accent.blue, 0.5),
              }}
            />
          </div>
        ))}
      </AbsoluteFill>

      {/* the sentence */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          style={{
            ...T.display,
            fontSize: 106,
            textAlign: "center",
            opacity: interpolate(frame, [4, 26], [0, 1], { ...clamp, easing: ease.arrive }),
            translate: `0px ${interpolate(frame, [4, 34], [26, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px`,
            filter: `blur(${interpolate(frame, [4, 24], [12, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px)`,
          }}
        >
          {HOOK_LINES[0]}
        </div>
        <div
          style={{
            ...T.display,
            fontSize: 106,
            textAlign: "center",
            opacity: interpolate(frame, [24, 46], [0, 1], { ...clamp, easing: ease.arrive }),
            translate: `0px ${interpolate(frame, [24, 54], [26, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px`,
            filter: `blur(${interpolate(frame, [24, 44], [12, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px)`,
          }}
        >
          ONLY{" "}
          <span
            style={{
              color: accent.blue,
              opacity: interpolate(frame, [58, 78], [0.55, 1], { ...clamp, easing: ease.arrive }),
            }}
          >
            FIVE
          </span>{" "}
          GET TO START.
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
