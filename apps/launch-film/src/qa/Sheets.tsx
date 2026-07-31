/**
 * QA surfaces.
 *
 * Three printed sheets, all rendered by Remotion itself from stills the render
 * pipeline already produced — no image library, no ImageMagick, nothing to
 * install. The scripts in `scripts/` write `manifest.json`, copy the PNGs into
 * `public/qa/`, and then render these compositions as stills.
 */
import type React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { accent, alpha, ink, paper } from "../design/colors";
import { MONO, SANS } from "../design/typography";
import { CLAIM_LEDGER, LAUNCH_COMMAND } from "../productCopy";
import { SCENES } from "../motion/timing";
import manifest from "./manifest.json";

type Shot = { file: string; frame: number; scene: string; label: string };

const shots: Shot[] = (manifest as { shots?: Shot[] }).shots ?? [];
const beforeShots: Shot[] = (manifest as { before?: Shot[] }).before ?? [];
const meta = (manifest as { meta?: Record<string, string> }).meta ?? {};

const sheetBase: React.CSSProperties = {
  background: `linear-gradient(170deg, ${paper.lit} 0%, ${paper.base} 60%, ${paper.mineral} 100%)`,
  fontFamily: SANS,
  color: ink.strong,
};

const SheetHeader: React.FC<{ title: string; subtitle: string; width: number }> = ({
  title,
  subtitle,
  width,
}) => (
  <div style={{ width, margin: "0 auto", paddingTop: 54, paddingBottom: 30 }}>
    <div style={{ fontSize: 22, letterSpacing: "0.22em", fontWeight: 600, color: accent.blue }}>
      ROSTER · LAUNCH FILM · PREMIUM V1
    </div>
    <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 12 }}>{title}</div>
    <div style={{ fontSize: 24, color: ink.muted, marginTop: 10 }}>{subtitle}</div>
    <div style={{ height: 3, background: alpha(ink.hair, 0.6), borderRadius: 3, marginTop: 22 }} />
  </div>
);

/* ───────────────────────────── contact sheet ───────────────────────────── */

export const CONTACT_SHEET = { width: 1760, height: 4420 } as const;

export const ContactSheet: React.FC = () => {
  const cellW = 500;
  const cellH = Math.round((cellW * 1080) / 1920);
  return (
    <AbsoluteFill style={sheetBase}>
      <SheetHeader
        title="Contact sheet — every scene, entry · midpoint · exit"
        subtitle={`${SCENES.length} scenes · ${shots.length} frames · 1920×1080 · 60 fps`}
        width={1560}
      />
      <div style={{ width: 1560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {SCENES.map((scene, row) => {
          const rowShots = shots.filter((s) => s.scene === scene.id);
          return (
            <div key={scene.id} style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <div style={{ width: 6, alignSelf: "stretch", background: alpha(accent.blue, 0.5), borderRadius: 6 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 20, color: accent.blue, fontWeight: 700 }}>
                    {String(row + 1).padStart(2, "0")}
                  </span>
                  <span style={{ fontSize: 26, fontWeight: 600 }}>{scene.title}</span>
                  <span style={{ fontFamily: MONO, fontSize: 18, color: ink.faint }}>
                    f{scene.from}–{scene.from + scene.duration - 1} · {(scene.duration / 60).toFixed(1)}s
                  </span>
                </div>
                <div style={{ display: "flex", gap: 18 }}>
                  {rowShots.map((shot) => (
                    <div key={shot.file}>
                      <Img
                        src={staticFile(`qa/${shot.file}`)}
                        style={{
                          width: cellW,
                          height: cellH,
                          objectFit: "cover",
                          borderRadius: 8,
                          boxShadow: `0 6px 22px ${alpha("#2A2D33", 0.14)}`,
                          border: `1.5px solid ${alpha(ink.hair, 0.6)}`,
                        }}
                      />
                      <div style={{ fontFamily: MONO, fontSize: 16, color: ink.faint, marginTop: 6 }}>
                        {shot.label} · f{shot.frame}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ───────────────────────────── before / after ──────────────────────────── */

export const BEFORE_AFTER = { width: 1760, height: 1980 } as const;

export const BeforeAfter: React.FC = () => {
  const cellW = 760;
  const cellH = Math.round((cellW * 1080) / 1920);
  const pairs = beforeShots.slice(0, 3);
  return (
    <AbsoluteFill style={sheetBase}>
      <SheetHeader
        title="Direction comparison"
        subtitle="Left: the dark HUD direction this film explicitly rejected, rendered for comparison. Right: the shipped warm-white optical-glass system."
        width={1560}
      />
      <div style={{ width: 1560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", gap: 40 }}>
          <ColumnLabel text="REJECTED DIRECTION — reconstructed" color={accent.coral} width={cellW} />
          <ColumnLabel text="SHIPPED — premium optical glass" color={accent.blue} width={cellW} />
        </div>
        {pairs.map((pair) => {
          const after = shots.find((s) => s.frame === pair.frame);
          return (
            <div key={pair.file} style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
              <Cell src={`qa/${pair.file}`} w={cellW} h={cellH} caption={`${pair.label} · f${pair.frame}`} />
              {after ? (
                <Cell src={`qa/${after.file}`} w={cellW} h={cellH} caption={`${after.label} · f${after.frame}`} />
              ) : null}
            </div>
          );
        })}
        <div style={{ fontSize: 21, color: ink.muted, lineHeight: 1.5, marginTop: 4 }}>
          This repository contained no previously-rendered launch film, so there is no earlier master to diff
          against. The left column is therefore an honest reconstruction of the visual direction the brief ruled
          out — dark HUD chrome, thin cyan outlines, a glowing central orb, metadata grids — rendered from the
          same scene data so the comparison is like-for-like rather than asserted.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ColumnLabel: React.FC<{ text: string; color: string; width: number }> = ({ text, color, width }) => (
  <div
    style={{
      width,
      fontSize: 20,
      letterSpacing: "0.16em",
      fontWeight: 700,
      color,
      paddingBottom: 8,
      borderBottom: `3px solid ${alpha(color, 0.45)}`,
    }}
  >
    {text}
  </div>
);

const Cell: React.FC<{ src: string; w: number; h: number; caption: string }> = ({ src, w, h, caption }) => (
  <div>
    <Img
      src={staticFile(src)}
      style={{
        width: w,
        height: h,
        objectFit: "cover",
        borderRadius: 10,
        boxShadow: `0 8px 28px ${alpha("#2A2D33", 0.16)}`,
        border: `1.5px solid ${alpha(ink.hair, 0.6)}`,
      }}
    />
    <div style={{ fontFamily: MONO, fontSize: 17, color: ink.faint, marginTop: 7 }}>{caption}</div>
  </div>
);

/* ──────────────────────────────── QA sheet ─────────────────────────────── */

export const QA_SHEET = { width: 1760, height: 2280 } as const;

export const QaSheet: React.FC = () => {
  const cellW = 490;
  const cellH = Math.round((cellW * 1080) / 1920);
  const safe = { left: 160 / 1920, right: 160 / 1920, top: 120 / 1080, bottom: 120 / 1080 };
  const checked = shots.filter((s) => s.label === "mid").slice(0, 6);

  return (
    <AbsoluteFill style={sheetBase}>
      <SheetHeader
        title="QA sheet — composition, claims and delivery"
        subtitle={`Safe-area overlay on six midpoints · claim ledger · master specification`}
        width={1560}
      />
      <div style={{ width: 1560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 34 }}>
        <div>
          <SectionTitle>1 · Social-safe margins (160px sides · 120px top and bottom)</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
            {checked.map((shot) => (
              <div key={`qa-${shot.file}`} style={{ position: "relative", width: cellW, height: cellH }}>
                <Img
                  src={staticFile(`qa/${shot.file}`)}
                  style={{
                    width: cellW,
                    height: cellH,
                    objectFit: "cover",
                    borderRadius: 8,
                    border: `1.5px solid ${alpha(ink.hair, 0.6)}`,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: cellW * safe.left,
                    right: cellW * safe.right,
                    top: cellH * safe.top,
                    bottom: cellH * safe.bottom,
                    border: `2px dashed ${alpha(accent.blue, 0.8)}`,
                    borderRadius: 4,
                  }}
                />
                <div style={{ fontFamily: MONO, fontSize: 15, color: ink.faint, marginTop: 5 }}>
                  {shot.scene} · f{shot.frame}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionTitle>2 · Claim ledger — every statement the film makes, and its source</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {CLAIM_LEDGER.map((row) => (
              <div
                key={row.claim}
                style={{
                  display: "flex",
                  gap: 18,
                  alignItems: "baseline",
                  padding: "9px 16px",
                  background: alpha("#FFFFFF", 0.68),
                  border: `1.5px solid ${alpha(ink.hair, 0.5)}`,
                  borderRadius: 8,
                }}
              >
                <span style={{ color: accent.blue, fontSize: 18, fontWeight: 700 }}>✓</span>
                <span style={{ fontSize: 21, flex: 1 }}>{row.claim}</span>
                <span style={{ fontFamily: MONO, fontSize: 17, color: ink.muted }}>{row.source}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionTitle>3 · Master specification (measured after render)</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {Object.entries(meta).map(([k, v]) => (
              <div
                key={k}
                style={{
                  padding: "12px 18px",
                  background: alpha("#FFFFFF", 0.72),
                  border: `1.5px solid ${alpha(ink.hair, 0.5)}`,
                  borderRadius: 8,
                  minWidth: 240,
                }}
              >
                <div style={{ fontSize: 17, letterSpacing: "0.14em", color: ink.faint, fontWeight: 600 }}>
                  {k.toUpperCase()}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 22, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: accent.blue, marginTop: 20 }}>
            ❯ {LAUNCH_COMMAND}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 26,
      fontWeight: 600,
      letterSpacing: "-0.01em",
      marginBottom: 16,
      paddingBottom: 10,
      borderBottom: `2px solid ${alpha(ink.hair, 0.5)}`,
    }}
  >
    {children}
  </div>
);
