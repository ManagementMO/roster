import type { CSSProperties } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { ToolCardData } from "../data/tools";
import { COLORS } from "../design/colors";
import { GLASS_RADIUS, MATERIALS } from "../design/materials";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";

export type ToolObjectVariant = "background" | "candidate" | "selected" | "hero" | "failed" | "suggested" | "benched";

type ToolObjectProps = {
  readonly tool: ToolCardData;
  readonly variant?: ToolObjectVariant;
  readonly width?: number;
  readonly progress?: number;
  readonly focus?: number;
  readonly starterNumber?: number;
  readonly supporting?: string;
  readonly motionFrame?: number;
  readonly style?: CSSProperties;
};

const glyphPaths: Record<string, readonly string[]> = {
  repository: ["M8 28L20 16L32 28", "M20 16V39", "M10 39H30"],
  filesystem: ["M7 15H18L22 20H35V38H7Z", "M12 26H30"],
  diagnostics: ["M20 7L35 20L20 35L5 20Z", "M13 20H27"],
  browser: ["M7 10H35V36H7Z", "M7 17H35", "M12 13H13"],
  planning: ["M8 33L33 8", "M18 8H33V23"],
};

export const ToolGlyph = ({ category, size = 56, color = COLORS.roster }: { readonly category: string; readonly size?: number; readonly color?: string }) => {
  const paths = glyphPaths[category] ?? ["M8 20H34", "M20 8V34", "M10 10L32 32"];
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" fill="none" aria-hidden="true">
      {paths.map((path) => <path key={path} d={path} stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  );
};

export const ToolObject = ({
  tool,
  variant = "candidate",
  width,
  progress = 1,
  focus = 0,
  starterNumber,
  supporting,
  motionFrame,
  style,
}: ToolObjectProps) => {
  const localFrame = useCurrentFrame();
  const frame = motionFrame ?? localFrame;
  const background = variant === "background";
  const hero = variant === "hero";
  const failed = variant === "failed";
  const suggested = variant === "suggested";
  const benched = variant === "benched";
  const selected = variant === "selected" || hero;
  const objectWidth = width ?? (background ? 150 : hero ? 430 : 286);
  const height = background ? 62 : hero ? objectWidth * 0.62 : objectWidth * 0.52;
  const signal = failed ? COLORS.warning : suggested ? COLORS.gold : selected ? COLORS.roster : COLORS.lineBright;
  const float = Math.sin((frame + tool.id.length * 17) / 72) * (hero ? 4 : 2);
  const shell = hero ? MATERIALS.heroGlass : variant === "candidate" ? MATERIALS.candidateGlass : MATERIALS.quietGlass;
  const scale = interpolate(progress, [0, 1], [0.84, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const content = interpolate(progress, [0.52, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  if (background) {
    return (
      <div
        style={{
          width: objectWidth,
          height,
          borderRadius: height / 2,
          background: "linear-gradient(90deg, rgba(255,255,255,0.62), rgba(225,231,240,0.38))",
          border: "2px solid rgba(255,255,255,0.82)",
          boxShadow: "0 18px 46px rgba(40,48,64,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 20px",
          color: COLORS.textFaint,
          opacity: progress * (benched ? 0.36 : 0.66),
          transform: `translateY(${float}px) scale(${scale})`,
          ...style,
        }}
      >
        <ToolGlyph category={tool.category} size={30} color={COLORS.textFaint} />
        <span style={{ height: 4, borderRadius: 4, flex: 1, backgroundColor: COLORS.line }} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: objectWidth,
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: hero ? GLASS_RADIUS.hero : GLASS_RADIUS.candidate,
        ...shell,
        borderColor: failed ? `${COLORS.warning}9C` : suggested ? `${COLORS.gold}92` : selected ? `${COLORS.roster}72` : COLORS.line,
        opacity: progress * (benched ? 0.45 : 1),
        transform: `translateY(${float}px) scale(${scale})`,
        color: COLORS.text,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at ${22 + focus * 52}% 16%, ${signal}${selected || failed || suggested ? "28" : "10"}, transparent 52%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: hero ? 34 : 24,
          left: hero ? 38 : 28,
          width: hero ? 82 : 60,
          height: hero ? 82 : 60,
          display: "grid",
          placeItems: "center",
          borderRadius: hero ? 24 : 18,
          background: "rgba(255,255,255,0.70)",
          boxShadow: `0 16px 32px ${signal}18, inset 0 1px 1px rgba(255,255,255,1)`,
          opacity: content,
          transform: `translateY(${(1 - content) * 12}px)`,
        }}
      >
        <ToolGlyph category={tool.category} size={hero ? 58 : 42} color={failed ? COLORS.warning : suggested ? COLORS.gold : COLORS.roster} />
      </div>
      {starterNumber ? (
        <div
          style={{
            position: "absolute",
            top: hero ? 40 : 28,
            right: hero ? 40 : 28,
            fontFamily: FONT_MONO,
            fontSize: hero ? 18 : 15,
            letterSpacing: "0.1em",
            color: selected ? COLORS.roster : COLORS.textFaint,
          }}
        >
          {suggested ? "SIXTH MAN" : `STARTER ${String(starterNumber).padStart(2, "0")}`}
        </div>
      ) : null}
      <div style={{ position: "absolute", left: hero ? 40 : 28, right: hero ? 40 : 28, bottom: hero ? 36 : 24, opacity: content }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: hero ? Math.max(34, objectWidth * 0.098) : Math.max(24, objectWidth * 0.091),
            lineHeight: 0.98,
            fontWeight: 680,
            letterSpacing: "-0.042em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {tool.name}
        </div>
        <div
          style={{
            marginTop: hero ? 16 : 10,
            fontFamily: FONT_UI,
            fontSize: hero ? 23 : 18,
            lineHeight: 1.28,
            color: failed ? COLORS.warning : suggested ? COLORS.gold : COLORS.textSecondary,
          }}
        >
          {failed ? "Connection interrupted" : suggested ? "Next-ranked equivalent" : supporting ?? tool.category}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, bottom: 0, width: `${Math.max(0.04, focus) * 100}%`, height: hero ? 7 : 4, background: `linear-gradient(90deg, ${signal}, ${COLORS.warm})`, opacity: selected || failed || suggested ? 0.9 : focus * 0.7 }} />
    </div>
  );
};
