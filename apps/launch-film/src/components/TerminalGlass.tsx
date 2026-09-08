import type { CSSProperties } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { TerminalEvent } from "../data/terminalScript";
import { COLORS } from "../design/colors";
import { MATERIALS } from "../design/materials";
import { FONT_MONO, FONT_UI } from "../design/typography";
import { enter } from "../motion/timing";

type TerminalGlassProps = {
  readonly script: readonly TerminalEvent[];
  readonly title?: string;
  readonly progress?: number;
  readonly zoom?: number;
  readonly style?: CSSProperties;
  readonly width?: number;
  readonly height?: number;
};

const eventColor = (type: TerminalEvent["type"]): string => {
  if (type === "success") return COLORS.success;
  if (type === "warning") return COLORS.warning;
  if (type === "type") return COLORS.text;
  return COLORS.textSecondary;
};

export const TerminalGlass = ({
  script,
  title = "roster — local session",
  progress = 1,
  zoom = 1,
  style,
  width = 1120,
  height = 610,
}: TerminalGlassProps) => {
  const frame = useCurrentFrame();
  const command = script.find((event) => event.type === "type");
  const value = command?.type === "type" ? command.text : "";
  const length = command?.type === "type" ? Math.floor(Math.max(0, frame - command.at) / (command.speed ?? 3)) : 0;
  const visible = value.slice(0, length);
  const cursor = Math.floor(frame / 24) % 2 === 0;
  const output = script.filter((event) => event.type !== "type" && event.type !== "clear");

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: 38,
        ...MATERIALS.heroGlass,
        borderColor: "rgba(255,255,255,0.98)",
        transform: `perspective(1600px) rotateX(${(1 - progress) * 9}deg) rotateY(${(1 - progress) * -13}deg) scale(${progress * zoom})`,
        transformOrigin: "50% 58%",
        opacity: progress,
        color: COLORS.text,
        ...style,
      }}
    >
      <div
        style={{
          height: 72,
          display: "flex",
          alignItems: "center",
          padding: "0 30px",
          borderBottom: `2px solid ${COLORS.line}`,
          background: "rgba(255,255,255,0.48)",
        }}
      >
        <div style={{ display: "flex", gap: 11 }}>
          {[COLORS.warning, COLORS.gold, COLORS.success].map((color) => (
            <span key={color} style={{ width: 14, height: 14, borderRadius: 99, backgroundColor: color, opacity: 0.86 }} />
          ))}
        </div>
        <div style={{ position: "absolute", left: "50%", translate: "-50% 0", fontFamily: FONT_UI, fontSize: 18, color: COLORS.textSecondary }}>
          {title}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontFamily: FONT_MONO, fontSize: 14, color: COLORS.success, letterSpacing: "0.08em" }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, backgroundColor: COLORS.success, boxShadow: `0 0 16px ${COLORS.success}66` }} />
          LOCAL
        </div>
      </div>
      <div style={{ position: "absolute", inset: "72px 0 0", padding: "42px 52px", fontFamily: FONT_MONO, fontSize: 25, lineHeight: 1.58, color: COLORS.textSecondary }}>
        <div style={{ color: COLORS.text, minHeight: 42 }}>
          <span style={{ color: COLORS.roster, marginRight: 16 }}>›</span>
          {visible}
          <span style={{ display: "inline-block", width: 13, height: 27, translate: "0 5px", marginLeft: 6, borderRadius: 3, backgroundColor: COLORS.roster, opacity: cursor ? 0.92 : 0.16 }} />
        </div>
        <div style={{ marginTop: 24 }}>
          {output.map((event, index) => {
            const reveal = enter(frame, event.at, event.type === "warning" ? 18 : 12);
            return (
              <div
                key={`${event.at}-${event.text}`}
                style={{
                  minHeight: 42,
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  color: eventColor(event.type),
                  opacity: reveal,
                  transform: `translateX(${(1 - reveal) * -18}px)`,
                }}
              >
                <span style={{ width: 24, color: event.type === "warning" ? COLORS.warning : COLORS.textFaint }}>
                  {event.type === "success" ? "✓" : event.type === "warning" ? "!" : String(index + 1).padStart(2, "0")}
                </span>
                <span style={{ whiteSpace: "pre" }}>{event.text}</span>
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 52, right: 52, bottom: 34, height: 3, borderRadius: 3, background: `linear-gradient(90deg, ${COLORS.roster}, ${COLORS.selection}, transparent)`, opacity: interpolate(frame, [90, 150], [0, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }} />
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(112deg, transparent 26%, rgba(255,255,255,0.56) 48%, transparent 66%)", translate: `${((frame * 3.1) % (width * 1.7)) - width * 0.75}px 0`, opacity: 0.36 }} />
    </div>
  );
};
