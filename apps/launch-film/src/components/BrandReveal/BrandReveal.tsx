/**
 * The brand reveal.
 *
 * The last shot has to earn the mark, so the mark is not introduced here — it is
 * *arrived at*. The five hero cards collapse into five points, the five points
 * become the five blades of the prism the viewer has been watching route calls
 * for fifty seconds, and the prism sits beside the wordmark. Then the frame goes
 * quiet and holds long enough to read the command.
 */
import type React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { accent, alpha, ink } from "../../design/colors";
import { glassEdge, material } from "../../design/materials";
import { radius } from "../../design/spacing";
import { MONO, type as T } from "../../design/typography";
import { defUrl } from "../../design/effects";
import { clamp, ease } from "../../motion/easings";
import { springAt } from "../../motion/springs";
import { RosterMark } from "../RosterCore/RosterCore";

/**
 * The wordmark. Letters resolve individually on a tight cascade with a small
 * upward settle — never a per-letter bounce, which would undercut the tone.
 */
export const Wordmark: React.FC<{ text: string; frame: number; start: number; size?: number }> = ({
  text,
  frame,
  start,
  size = 176,
}) => (
  <div style={{ display: "flex", alignItems: "baseline" }}>
    {text.split("").map((ch, i) => {
      const at = start + i * 4;
      return (
        <span
          key={`wm-${text.slice(0, i + 1)}`}
          style={{
            fontFamily: T.display.fontFamily,
            fontSize: size,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            color: ink.strong,
            display: "inline-block",
            opacity: interpolate(frame, [at, at + 16], [0, 1], { ...clamp, easing: ease.arrive }),
            translate: `0px ${interpolate(frame, [at, at + 22], [30, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px`,
            filter: `blur(${interpolate(frame, [at, at + 14], [10, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px)`,
          }}
        >
          {ch}
        </span>
      );
    })}
  </div>
);

/**
 * The command plate: the one place in the film that prints the launch command.
 * It sits on its own glass chip with an honest pre-release note beneath, because
 * the package is not published and a launch film that implies otherwise is a lie.
 */
export const CommandPlate: React.FC<{
  command: string;
  note: string;
  delay?: number;
}> = ({ command, note, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = springAt(frame, fps, "precise", delay);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <div
        style={{
          ...material("solidGlass", { r: radius.card, lift: 26 }),
          padding: "22px 40px",
          display: "inline-flex",
          alignItems: "center",
          gap: 18,
          opacity: s,
          scale: interpolate(s, [0, 1], [0.94, 1]),
          translate: `0px ${interpolate(s, [0, 1], [18, 0]).toFixed(2)}px`,
        }}
      >
        <div style={glassEdge(radius.card, 1, 1.8)} />
        <span style={{ fontFamily: MONO, fontSize: 34, color: accent.blue, fontWeight: 700 }}>❯</span>
        <span style={{ ...T.command, fontSize: 38 }}>{command}</span>
      </div>
      <div
        style={{
          ...T.chip,
          fontSize: 22,
          color: ink.faint,
          opacity: interpolate(frame, [delay + 18, delay + 40], [0, 0.92], { ...clamp, easing: ease.arrive }),
        }}
      >
        {note}
      </div>
    </div>
  );
};

/**
 * The convergence: five points travelling from the lineup positions into the
 * five blade tips of the mark. Drawn as light trails so the collapse reads as
 * one motion rather than five card animations.
 */
export const Convergence: React.FC<{
  from: readonly { x: number; y: number }[];
  to: { x: number; y: number };
  progress: number;
  radiusPx: number;
}> = ({ from, to, progress, radiusPx }) => (
  <svg
    aria-hidden="true"
    width={1920}
    height={1080}
    viewBox="0 0 1920 1080"
    style={{ position: "absolute", inset: 0, overflow: "visible" }}
  >
    {from.map((p, i) => {
      const a = ((i * 72 - 90) * Math.PI) / 180;
      const target = { x: to.x + Math.cos(a) * radiusPx, y: to.y + Math.sin(a) * radiusPx };
      // Heavily-overlapped stagger on `glide`, with the fade held almost to
      // arrival. An `arrive` curve with a tight stagger made the trails saturate
      // and vanish within ~35 frames, so the scene's first third was empty paper
      // and only two of the five were ever on screen at once. All five now read
      // as one convergence.
      const t = interpolate(progress, [i * 0.05, 0.8 + i * 0.05], [0, 1], { ...clamp, easing: ease.glide });
      const cx = p.x + (target.x - p.x) * t;
      const cy = p.y + (target.y - p.y) * t;
      const tailT = Math.max(0, t - 0.3);
      const tx = p.x + (target.x - p.x) * tailT;
      const ty = p.y + (target.y - p.y) * tailT;
      const fade = interpolate(t, [0, 0.06, 0.97, 1], [0, 1, 1, 0], clamp);
      return (
        <g key={`conv-${p.x.toFixed(1)}-${p.y.toFixed(1)}`} opacity={fade}>
          <line
            x1={tx}
            y1={ty}
            x2={cx}
            y2={cy}
            stroke={alpha(accent.blue, 0.72)}
            strokeWidth={11}
            strokeLinecap="round"
          />
          {/* the head is BLUE, not white — a white dot disappears on warm-white paper */}
          <circle cx={cx} cy={cy} r={20} fill={alpha(accent.blue, 0.3)} filter={defUrl("soft-glow")} />
          <circle cx={cx} cy={cy} r={11} fill={accent.blue} />
          <circle cx={cx - 3} cy={cy - 3} r={4.2} fill={alpha("#FFFFFF", 0.95)} />
        </g>
      );
    })}
  </svg>
);

/** The mark, arriving with a single settle. Kept separate so scenes can time it. */
export const MarkArrival: React.FC<{ size: number; delay?: number }> = ({ size, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = springAt(frame, fps, "heavy", delay);
  return (
    <div
      style={{
        opacity: interpolate(frame - delay, [0, 12], [0, 1], { ...clamp, easing: ease.arrive }),
        scale: interpolate(s, [0, 1], [0.7, 1], { output: "perceptual-scale" }),
        rotate: `${interpolate(s, [0, 1], [-22, 0]).toFixed(2)}deg`,
      }}
    >
      <RosterMark size={size} color={ink.strong} />
    </div>
  );
};
