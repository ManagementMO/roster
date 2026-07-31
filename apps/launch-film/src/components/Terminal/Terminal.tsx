/**
 * The terminal.
 *
 * A single sheet of optical glass with a machine talking on it — not a macOS
 * window chrome pastiche, and not a dark theme. Warm-white body, graphite mono,
 * one hairline rail. The command it types comes from `productCopy.LAUNCH_COMMAND`
 * and appears exactly once in the whole film.
 */
import type React from "react";
import type { CSSProperties } from "react";
import { interpolate } from "remotion";
import { accent, alpha, ink } from "../../design/colors";
import { glassEdge, material, sheen, well } from "../../design/materials";
import { radius } from "../../design/spacing";
import { MONO, type as T } from "../../design/typography";
import { clamp, ease } from "../../motion/easings";
import { RosterMark } from "../RosterCore/RosterCore";

export const TERMINAL_BOX = { x: 366, y: 236, width: 1188, height: 608 } as const;

/** Frames per typed character. 2.4 reads as a fast confident human. */
export const FRAMES_PER_CHAR = 2.4;

export interface TerminalProps {
  /** The typed command. */
  command: string;
  /** Local frame within the terminal beat. */
  frame: number;
  /** Frame at which typing starts. */
  typeStart: number;
  /** Frame at which the receipt begins printing. */
  outputStart: number;
  /** Receipt header, body lines and closing line. */
  title: string;
  lines: readonly string[];
  closing: string;
  disclaimer: string;
  /** 0→1 entrance. */
  presence?: number;
  /** 0→1 dissolve as the output becomes the tool field. */
  dissolve?: number;
  /** Per-line opacity override, so the scene can lift lines off individually. */
  lineOpacity?: (index: number) => number;
  style?: CSSProperties;
}

export const Terminal: React.FC<TerminalProps> = ({
  command,
  frame,
  typeStart,
  outputStart,
  title,
  lines,
  closing,
  disclaimer,
  presence = 1,
  dissolve = 0,
  lineOpacity,
  style,
}) => {
  const typed = Math.max(0, Math.min(command.length, Math.floor((frame - typeStart) / FRAMES_PER_CHAR)));
  const typingDone = frame >= typeStart + command.length * FRAMES_PER_CHAR;
  // Blink at 2 Hz while waiting, solid while typing, gone once output starts.
  const cursorOn = frame < outputStart - 6 && (!typingDone || Math.floor(frame / 15) % 2 === 0);

  const bodyLift = interpolate(presence, [0, 1], [26, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: TERMINAL_BOX.x,
        top: TERMINAL_BOX.y,
        width: TERMINAL_BOX.width,
        height: TERMINAL_BOX.height,
        opacity: presence,
        translate: `0px ${bodyLift.toFixed(2)}px`,
        ...style,
      }}
    >
      <div style={{ ...material("optical", { r: radius.panel, lift: 54, spectral: 1.1 }), position: "absolute", inset: 0 }}>
        <div style={sheen(radius.panel, 1)} />
      </div>
      <div style={glassEdge(radius.panel, 1, 2)} />

      {/* top rail */}
      <div
        style={{
          position: "absolute",
          left: 30,
          right: 30,
          top: 26,
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 14,
          borderBottom: `2px solid ${alpha(ink.hair, 0.4)}`,
        }}
      >
        <RosterMark size={26} color={alpha(ink.base, 0.75)} />
        <span style={{ ...T.chip, fontSize: 22, color: ink.faint }}>LOCAL SHELL</span>
      </div>

      {/* the well the machine speaks into */}
      <div
        style={{
          ...well(radius.card),
          position: "absolute",
          left: 30,
          right: 30,
          top: 88,
          bottom: 30,
          padding: "26px 30px",
          overflow: "hidden",
          opacity: 1 - dissolve * 0.35,
        }}
      >
        {/* the command line */}
        <div style={{ ...T.code, display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ color: accent.blue, fontWeight: 700 }}>~</span>
          <span style={{ color: ink.faint }}>❯</span>
          <span style={{ color: ink.strong, fontWeight: 500 }}>{command.slice(0, typed)}</span>
          <span
            style={{
              display: "inline-block",
              width: 15,
              height: 30,
              marginLeft: -6,
              background: cursorOn ? accent.blue : "transparent",
              borderRadius: 2,
              translate: "0px 4px",
            }}
          />
        </div>

        {/* the receipt */}
        <div style={{ marginTop: 22, opacity: interpolate(frame, [outputStart, outputStart + 10], [0, 1], clamp) }}>
          <ReceiptRule />
          <div
            style={{
              ...T.code,
              fontSize: 26,
              fontWeight: 700,
              color: ink.strong,
              letterSpacing: "0.04em",
              margin: "10px 0 8px",
              opacity: lineOpacity ? lineOpacity(-1) : 1,
            }}
          >
            {title}
          </div>
          <ReceiptRule />
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 2 }}>
            {lines.map((line, i) => {
              const at = outputStart + 10 + i * 7;
              const inOpacity = interpolate(frame, [at, at + 9], [0, 1], { ...clamp, easing: ease.arrive });
              const indented = line.startsWith(" ");
              return (
                <div
                  key={`line-${line.length}-${i}`}
                  style={{
                    fontFamily: MONO,
                    fontSize: 24,
                    lineHeight: 1.5,
                    color: indented ? ink.faint : ink.base,
                    opacity: inOpacity * (lineOpacity ? lineOpacity(i) : 1),
                    translate: `0px ${interpolate(frame, [at, at + 9], [7, 0], { ...clamp, easing: ease.arrive }).toFixed(2)}px`,
                    whiteSpace: "pre",
                  }}
                >
                  {line || " "}
                </div>
              );
            })}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 24,
              color: accent.blue,
              marginTop: 18,
              fontWeight: 500,
              opacity:
                interpolate(frame, [outputStart + 10 + lines.length * 7, outputStart + 24 + lines.length * 7], [0, 1], {
                  ...clamp,
                  easing: ease.arrive,
                }) * (lineOpacity ? lineOpacity(lines.length) : 1),
            }}
          >
            {closing}
          </div>
        </div>
      </div>

      {/* honesty label, outside the well so it reads as film caption not output */}
      <div
        style={{
          position: "absolute",
          left: 32,
          bottom: -44,
          ...T.chip,
          fontSize: 22,
          color: ink.faint,
          opacity: interpolate(frame, [outputStart + 18, outputStart + 42], [0, 0.9], { ...clamp, easing: ease.arrive }),
        }}
      >
        {disclaimer}
      </div>
    </div>
  );
};

const ReceiptRule: React.FC = () => (
  <div style={{ height: 2, background: alpha(ink.hair, 0.5), borderRadius: 2, width: "100%" }} />
);
