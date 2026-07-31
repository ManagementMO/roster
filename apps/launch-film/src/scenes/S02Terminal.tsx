/**
 * Scene 2 — Terminal (0:03–0:10).
 *
 * The only place in the film that prints the launch command. It types
 * `roster init`, the Day-0 receipt prints, and then the receipt physically
 * becomes the tool universe: each output line lifts off the glass and breaks
 * into capability chips that fly outward past the camera. That transformation is
 * the film's first promise — what you are about to watch is what that command
 * actually found on your machine.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { accent, alpha } from "../design/colors";
import { Terminal, TERMINAL_BOX } from "../components/Terminal/Terminal";
import { CENTER } from "../design/spacing";
import { clamp, ease } from "../motion/easings";
import { makeRng, seedFrom } from "../lib/rng";
import { TERMINAL } from "../productCopy";
import { SceneShell } from "./SceneShell";

const TYPE_START = 34;
const OUTPUT_START = 108;
/** Frame at which the receipt begins turning into objects. */
const LIFTOFF = 326;

interface Chip {
  x0: number;
  y0: number;
  angle: number;
  distance: number;
  size: number;
  delay: number;
  line: number;
  spin: number;
}

/** Deterministic chips seeded from the receipt's own geometry. */
function buildChips(): Chip[] {
  const rng = makeRng(seedFrom("terminal-liftoff"));
  const chips: Chip[] = [];
  const lineCount = TERMINAL.lines.length + 1;
  for (let line = 0; line < lineCount; line++) {
    const perLine = 7;
    for (let i = 0; i < perLine; i++) {
      const x0 = TERMINAL_BOX.x + 90 + i * 148 + rng() * 34;
      const y0 = TERMINAL_BOX.y + 232 + line * 38;
      const dx = x0 - CENTER.x;
      const dy = y0 - CENTER.y;
      chips.push({
        x0,
        y0,
        angle: Math.atan2(dy, dx) + (rng() - 0.5) * 0.7,
        distance: 760 + rng() * 900,
        size: 26 + rng() * 26,
        delay: line * 5 + i * 2 + rng() * 6,
        line,
        spin: (rng() - 0.5) * 90,
      });
    }
  }
  return chips;
}

const CHIPS = buildChips();

export const S02Terminal: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  // The panel arrives, holds, and then leaves WITH its own output — otherwise
  // the last second of the scene is an empty sheet of glass.
  const presence = interpolate(
    frame,
    [0, 30, LIFTOFF, LIFTOFF + 64],
    [0, 1, 1, 0],
    { ...clamp, easing: ease.glide },
  );
  const recede = interpolate(frame, [LIFTOFF, LIFTOFF + 64], [1, 0.88], {
    ...clamp,
    easing: ease.glide,
  });
  const dissolve = interpolate(frame, [LIFTOFF, LIFTOFF + 64], [0, 1], { ...clamp, easing: ease.glide });

  // Camera: a slow push during the type, a pull back as the receipt becomes objects.
  const zoom = interpolate(
    frame,
    [0, 150, LIFTOFF, duration],
    [1.06, 1.015, 1.0, 0.93],
    { ...clamp, easing: ease.glide },
  );

  /** Lines fade individually as their chips leave. */
  const lineOpacity = (index: number) => {
    const at = LIFTOFF + Math.max(0, index + 1) * 5;
    return interpolate(frame, [at, at + 20], [1, 0], { ...clamp, easing: ease.glide });
  };

  return (
    <SceneShell duration={duration} camera={{ zoom, x: 0, y: 0, focus: 0 }}>
      <AbsoluteFill>
        <Terminal
          command={TERMINAL.command}
          frame={frame}
          typeStart={TYPE_START}
          outputStart={OUTPUT_START}
          title={TERMINAL.receiptTitle}
          lines={TERMINAL.lines}
          closing={TERMINAL.closing}
          disclaimer={TERMINAL.disclaimer}
          presence={presence}
          dissolve={dissolve}
          lineOpacity={lineOpacity}
          style={{ scale: recede }}
        />
      </AbsoluteFill>

      {/* the receipt becoming the universe */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {CHIPS.map((c, _i) => {
          const t = interpolate(frame, [LIFTOFF + c.delay, LIFTOFF + c.delay + 96], [0, 1], {
            ...clamp,
            easing: ease.arrive,
          });
          if (t <= 0.001) return null;
          const travel = t * c.distance;
          const x = c.x0 + Math.cos(c.angle) * travel;
          const y = c.y0 + Math.sin(c.angle) * travel * 0.72;
          const s = interpolate(t, [0, 0.2, 1], [0.3, 1, 1.65]);
          const fade = interpolate(t, [0, 0.1, 0.72, 1], [0, 1, 0.92, 0], clamp);
          return (
            <div
              key={`chip-${c.line}-${c.x0.toFixed(1)}-${c.delay.toFixed(2)}`}
              style={{
                position: "absolute",
                left: x - c.size / 2,
                top: y - c.size / 2,
                width: c.size,
                height: c.size,
                borderRadius: c.size * 0.26,
                opacity: fade,
                scale: s,
                rotate: `${(c.spin * t).toFixed(2)}deg`,
                filter: t > 0.6 ? `blur(${((t - 0.6) * 11).toFixed(2)}px)` : undefined,
                background: `linear-gradient(150deg, ${alpha("#FFFFFF", 0.96)} 0%, ${alpha(c.line % 3 === 0 ? accent.blue : "#E9E8EC", 0.32)} 100%)`,
                boxShadow: `0 6px 20px ${alpha("#2A2D33", 0.12)}, inset 0 0 0 1.5px ${alpha("#FFFFFF", 0.92)}`,
              }}
            />
          );
        })}
      </AbsoluteFill>
    </SceneShell>
  );
};
