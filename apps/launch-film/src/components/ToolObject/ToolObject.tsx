/**
 * Tool objects — the film's three classes of "a thing your agent could call".
 *
 * The classes exist to solve the scale problem honestly. A frame that has to say
 * "hundreds of tools" cannot draw hundreds of readable cards; a frame that has
 * to say "these five" cannot draw them as anonymous chips. So:
 *
 *   BackgroundTool — abstract, unlabelled, depth-blurred. Communicates volume.
 *   CandidateTool  — one glyph, one name, one capability. Communicates evaluation.
 *   HeroTool       — large, deep, lit. Communicates selection.
 *
 * No class carries a metadata grid, a progress bar, a corner label or a score.
 */
import type React from "react";
import type { CSSProperties } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { accent, alpha, ink } from "../../design/colors";
import { depthOfField, elevation } from "../../design/lighting";
import { glassEdge, material, sheen, wireframe } from "../../design/materials";
import { radius } from "../../design/spacing";
import { type as T } from "../../design/typography";
import { clamp, ease } from "../../motion/easings";
import { springAt } from "../../motion/springs";
import { HERO_STAGE } from "../../motion/stagger";
import { Glyph, type GlyphName } from "./glyphs";

/* ────────────────────────────── background ────────────────────────────── */

export interface BackgroundToolProps {
  x: number;
  y: number;
  /** 0 (near) → 1 (far). Drives size, blur and opacity together. */
  depth: number;
  /** Base size before depth scaling. */
  size?: number;
  /** Extra opacity multiplier for scene-level fades. */
  presence?: number;
  /** Slow drift phase so the field is never frozen. */
  drift?: number;
}

/**
 * An anonymous capability in the field. A soft glass chip with a single interior
 * mark — enough to read as "a tool" at a glance, deliberately not enough to read
 * as a specific one.
 */
export const BackgroundTool: React.FC<BackgroundToolProps> = ({
  x,
  y,
  depth,
  size = 46,
  presence = 1,
  drift = 0,
}) => {
  const dof = depthOfField(depth);
  const s = size * dof.scale;
  return (
    <div
      style={{
        position: "absolute",
        left: x - s / 2,
        top: y - s / 2 + drift,
        width: s,
        height: s,
        borderRadius: Math.max(5, s * 0.26),
        opacity: dof.opacity * presence,
        filter: dof.blur > 0.2 ? `blur(${dof.blur.toFixed(2)}px)` : undefined,
        background: `linear-gradient(152deg, ${alpha("#FFFFFF", 0.92)} 0%, ${alpha("#E9E8EC", 0.72)} 100%)`,
        boxShadow: `0 ${(2 + (1 - depth) * 8).toFixed(1)}px ${(8 + (1 - depth) * 22).toFixed(1)}px ${alpha("#2A2D33", 0.09)}, inset 0 0 0 1.4px ${alpha("#FFFFFF", 0.9)}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "26%",
          top: "40%",
          width: "48%",
          height: Math.max(2, s * 0.075),
          borderRadius: 4,
          background: alpha(ink.hair, 0.7),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "26%",
          top: "62%",
          width: "30%",
          height: Math.max(2, s * 0.075),
          borderRadius: 4,
          background: alpha(ink.hair, 0.45),
        }}
      />
    </div>
  );
};

/* ────────────────────────────── candidate ─────────────────────────────── */

export type CandidateState =
  | "idle"
  | "focus"
  | "selected"
  | "rejected"
  | "failed"
  | "suggested"
  | "benched";

export interface CandidateToolProps {
  x: number;
  y: number;
  name: string;
  capability: string;
  glyph: GlyphName;
  state: CandidateState;
  /** 0 → nothing drawn, 1 → fully present. Drives the entrance. */
  presence?: number;
  /** How far the object sits from the camera; only mild here (0 → 0.35). */
  depth?: number;
  width?: number;
  /** Local override so a scene can nudge one card without a new component. */
  style?: CSSProperties;
  /** Rejection progress: 0 solid glass → 1 fully wireframed. */
  dissolve?: number;
  /** Slight y offset used by scene-level float. */
  float?: number;
}

const STATE_ACCENT: Record<CandidateState, string> = {
  idle: ink.hair,
  focus: accent.blue,
  selected: accent.blue,
  rejected: ink.hair,
  failed: accent.coral,
  suggested: accent.violet,
  benched: ink.hair,
};

export const CANDIDATE_SIZE = { width: 400, height: 132 } as const;

export const CandidateTool: React.FC<CandidateToolProps> = ({
  x,
  y,
  name,
  capability,
  glyph,
  state,
  presence = 1,
  depth = 0,
  width = CANDIDATE_SIZE.width,
  style,
  dissolve = 0,
  float = 0,
}) => {
  const dof = depthOfField(depth);
  const tint = STATE_ACCENT[state];
  const height = CANDIDATE_SIZE.height;
  const lit = state === "focus" || state === "selected" || state === "suggested";
  const dimmed = state === "rejected" || state === "benched";

  const bodyOpacity = presence * (dimmed ? 0.6 : 1) * dof.opacity;
  const lift = lit ? 30 : 14;

  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y - height / 2 + float,
        width,
        height,
        opacity: bodyOpacity,
        scale: dof.scale * (lit ? 1.03 : 1),
        filter: dof.blur > 0.2 ? `blur(${dof.blur.toFixed(2)}px)` : undefined,
        ...style,
      }}
    >
      {/* solid glass body, cross-faded out as the card wireframes */}
      <div
        style={{
          ...material("solidGlass", { r: radius.card, lift, presence: 1 - dissolve }),
          position: "absolute",
          inset: 0,
          opacity: 1 - dissolve,
        }}
      >
        <div style={sheen(radius.card, 0.9)} />
        <div style={glassEdge(radius.card, 1, 1.8)} />
      </div>

      {/* wireframe skin, cross-faded in — the silhouette survives, the body does
          not. The interior rules are what make the stage read as "this became a
          schema again" rather than as a card that simply lost its fill. */}
      {dissolve > 0.001 ? (
        <div style={{ ...wireframe(radius.card, dissolve), position: "absolute", inset: 0, opacity: dissolve }}>
          <div
            style={{
              position: "absolute",
              left: 30,
              top: height / 2 - 30,
              width: 60,
              height: 60,
              borderRadius: 15,
              boxShadow: `inset 0 0 0 2px ${alpha(ink.hair, 0.9)}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 110,
              top: height / 2 - 22,
              width: width * 0.42,
              height: 2.4,
              background: alpha(ink.hair, 0.9),
              borderRadius: 2,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 110,
              top: height / 2 + 12,
              width: width * 0.6,
              height: 2.4,
              background: alpha(ink.hair, 0.65),
              borderRadius: 2,
            }}
          />
        </div>
      ) : null}

      {/* the selected/failed/suggested accent — a left spine, never a border */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 14,
          bottom: 14,
          width: lit || state === "failed" ? 5 : 0,
          borderRadius: 5,
          background: `linear-gradient(180deg, ${tint} 0%, ${alpha(tint, 0.35)} 100%)`,
          opacity: 1 - dissolve,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "0 26px 0 30px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          opacity: 1 - dissolve * 1.35,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 15,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: lit
              ? `linear-gradient(150deg, ${alpha(tint, 0.16)} 0%, ${alpha(tint, 0.05)} 100%)`
              : `linear-gradient(150deg, ${alpha("#FFFFFF", 0.9)} 0%, ${alpha("#EDECEF", 0.8)} 100%)`,
            boxShadow: `inset 0 0 0 1.6px ${alpha(lit ? tint : ink.hair, lit ? 0.32 : 0.4)}`,
          }}
        >
          <Glyph name={glyph} size={34} color={lit ? tint : ink.base} accent={tint} fill={lit ? 1 : 0.5} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              ...T.support,
              fontSize: 28,
              fontWeight: 600,
              color: state === "failed" ? accent.coral : ink.strong,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </div>
          <div
            style={{
              ...T.support,
              fontSize: 24,
              color: ink.muted,
              marginTop: 4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {capability}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────── hero ─────────────────────────────────── */

export interface HeroToolProps {
  /** Centre x of the card. */
  x: number;
  /** Bottom edge y — heroes stand on a shared floor line, like a team photo. */
  bottom: number;
  width: number;
  height: number;
  no: string;
  name: string;
  capability: string;
  glyph: GlyphName;
  /** Absolute frame at which this card begins its entrance. */
  startFrame: number;
  /** Frame the card locks (rotation reaches 0). Drives the impact flash. */
  tint?: string;
  /** Scene-level presence multiplier. */
  presence?: number;
}

export const HERO_ENTRANCE_FRAMES = 34;

/**
 * A Starting Five card. Enters rotated away from camera, swings to face it, and
 * locks — shell first, then glyph, title, capability, in the film's fixed hero
 * staging order. The rotation is what makes the lineup satisfying; it turns five
 * reveals into five *arrivals*.
 */
export const HeroTool: React.FC<HeroToolProps> = ({
  x,
  bottom,
  width,
  height,
  no,
  name,
  capability,
  glyph,
  startFrame,
  tint = accent.blue,
  presence = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const shell = springAt(frame, fps, "lock", startFrame);
  const rotateY = interpolate(shell, [0, 1], [-74, 0]);
  const depth = interpolate(shell, [0, 1], [-320, 0]);
  const rise = interpolate(shell, [0, 1], [64, 0]);
  const shellOpacity = interpolate(local, [0, 12], [0, 1], { ...clamp, easing: ease.arrive });

  // The lock flash: a brief spectral bloom at the moment rotation settles.
  const lockFlash = interpolate(local, [26, 32, 46], [0, 0.5, 0], { ...clamp, easing: ease.glide });

  const part = (delay: number, span = 18) =>
    interpolate(local, [delay, delay + span], [0, 1], { ...clamp, easing: ease.arrive });

  const glyphIn = part(HERO_STAGE.glyph);
  const titleIn = part(HERO_STAGE.title);
  const supportIn = part(HERO_STAGE.support);

  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: bottom - height,
        width,
        height,
        perspective: 1600,
        opacity: presence,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          translate: `0px ${rise.toFixed(2)}px ${depth.toFixed(2)}px`,
          rotate: `y ${rotateY.toFixed(2)}deg`,
          opacity: shellOpacity,
        }}
      >
        {/* body */}
        <div
          style={{
            ...material("optical", { r: radius.hero, lift: 46, spectral: 1.15 }),
            position: "absolute",
            inset: 0,
            overflow: "hidden",
          }}
        >
          <div style={sheen(radius.hero, 1)} />
          {/* the tint wash: a single cool gradient from the base, no card chrome */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(0deg, ${alpha(tint, 0.11)} 0%, ${alpha(tint, 0.015)} 36%, rgba(0,0,0,0) 62%)`,
            }}
          />
          {/* lock flash */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: lockFlash,
              mixBlendMode: "screen",
              background: `linear-gradient(150deg, ${alpha("#FFFFFF", 0.9)} 0%, ${alpha(tint, 0.45)} 46%, rgba(255,255,255,0) 78%)`,
            }}
          />
        </div>
        <div style={glassEdge(radius.hero, 1, 2)} />

        {/* content */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: "34px 26px 30px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              ...T.starterNo,
              fontSize: 22,
              color: alpha(tint, 0.95),
              opacity: titleIn,
              translate: `0px ${((1 - titleIn) * 10).toFixed(2)}px`,
            }}
          >
            STARTER {no}
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: glyphIn,
              scale: interpolate(glyphIn, [0, 1], [0.72, 1]),
            }}
          >
            <div
              style={{
                width: Math.round(width * 0.46),
                height: Math.round(width * 0.46),
                borderRadius: Math.round(width * 0.14),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `linear-gradient(150deg, ${alpha("#FFFFFF", 0.94)} 0%, ${alpha(tint, 0.1)} 100%)`,
                boxShadow: `${elevation(16)}, inset 0 0 0 1.8px ${alpha("#FFFFFF", 0.95)}`,
              }}
            >
              <Glyph
                name={glyph}
                size={Math.round(width * 0.26)}
                color={ink.strong}
                accent={tint}
                fill={glyphIn}
                strokeWidth={2.8}
              />
            </div>
          </div>

          <div
            style={{
              ...T.cardTitle,
              fontSize: 34,
              opacity: titleIn,
              translate: `0px ${((1 - titleIn) * 14).toFixed(2)}px`,
            }}
          >
            {name}
          </div>
          <div
            style={{
              ...T.support,
              fontSize: 24,
              marginTop: 8,
              opacity: supportIn * 0.98,
              translate: `0px ${((1 - supportIn) * 12).toFixed(2)}px`,
            }}
          >
            {capability}
          </div>
        </div>
      </div>
    </div>
  );
};
