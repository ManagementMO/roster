/**
 * Tool glyphs.
 *
 * Drawn, not imported. Every glyph is built from the same construction — a
 * 48×48 box, 2.6px strokes, round caps, one optional filled accent shape — so a
 * row of five different tools reads as one designed set rather than five icon
 * packs. Nothing here goes below the 2px minimum stroke weight.
 */
import type React from "react";

export type GlyphName =
  | "folder"
  | "branch"
  | "globe"
  | "layers"
  | "database"
  | "download"
  | "search"
  | "terminal"
  | "mail"
  | "calendar"
  | "chart"
  | "shield"
  | "clock"
  | "cube";

export interface GlyphProps {
  name: GlyphName;
  size?: number;
  color?: string;
  accent?: string;
  /** 0 → strokes only, 1 → accent shapes at full opacity. Drives the reveal. */
  fill?: number;
  strokeWidth?: number;
}

export const Glyph: React.FC<GlyphProps> = ({
  name,
  size = 48,
  color = "#2A2D33",
  accent = "#2C6BF2",
  fill = 1,
  strokeWidth = 2.6,
}) => {
  const common: Common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
  };
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48">
      {renderGlyph(name, common, accent, fill)}
    </svg>
  );
};

type Common = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: "round";
  strokeLinejoin: "round";
  fill: "none";
};

function renderGlyph(name: GlyphName, c: Common, accent: string, fill: number): React.ReactNode {
  const a = { fill: accent, opacity: fill, stroke: "none" };
  switch (name) {
    case "folder":
      return (
        <>
          <path d="M6 14.5a3 3 0 0 1 3-3h9.4l3.6 4.4h17a3 3 0 0 1 3 3v17.6a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" {...c} />
          <rect x="14" y="24" width="20" height="3" rx="1.5" {...a} />
        </>
      );
    case "branch":
      return (
        <>
          <path d="M14 12v24" {...c} />
          <path d="M14 20c0 6 6 6 12 6s8 2 8 6" {...c} />
          <circle cx="14" cy="9.5" r="4" {...c} />
          <circle cx="34" cy="38.5" r="4" {...c} />
          <circle cx="14" cy="38.5" r="4" {...c} />
          <circle cx="34" cy="38.5" r="2" {...a} />
        </>
      );
    case "globe":
      return (
        <>
          <circle cx="24" cy="24" r="17" {...c} />
          <path d="M24 7c5 5.4 7.6 11.2 7.6 17S29 35.6 24 41c-5-5.4-7.6-11.2-7.6-17S19 12.4 24 7z" {...c} />
          <path d="M7.6 19h32.8M7.6 29h32.8" {...c} />
          <circle cx="24" cy="24" r="2.6" {...a} />
        </>
      );
    case "layers":
      return (
        <>
          <path d="M24 7 42 16.5 24 26 6 16.5z" {...c} />
          <path d="m8.5 24.5 15.5 8.2 15.5-8.2" {...c} />
          <path d="m8.5 32 15.5 8.2L39.5 32" {...c} />
          <path d="M24 10.6 37 16.5 24 22.4 11 16.5z" {...a} />
        </>
      );
    case "database":
      return (
        <>
          <ellipse cx="24" cy="12.5" rx="15" ry="5.8" {...c} />
          <path d="M9 12.5v23c0 3.2 6.7 5.8 15 5.8s15-2.6 15-5.8v-23" {...c} />
          <path d="M9 24c0 3.2 6.7 5.8 15 5.8s15-2.6 15-5.8" {...c} />
          <ellipse cx="24" cy="12.5" rx="9.5" ry="3.1" {...a} />
        </>
      );
    case "download":
      return (
        <>
          <path d="M24 8v22" {...c} />
          <path d="m14.5 22.5 9.5 9.5 9.5-9.5" {...c} />
          <path d="M8 34v3.5a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3V34" {...c} />
          <circle cx="24" cy="24" r="2.4" {...a} />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="21" cy="21" r="12.5" {...c} />
          <path d="m30.5 30.5 9 9" {...c} />
          <circle cx="21" cy="21" r="5.4" {...a} />
        </>
      );
    case "terminal":
      return (
        <>
          <rect x="6" y="10" width="36" height="28" rx="4" {...c} />
          <path d="m15 21 5.5 4.6L15 30" {...c} />
          <rect x="24" y="28.6" width="10" height="2.8" rx="1.4" {...a} />
        </>
      );
    case "mail":
      return (
        <>
          <rect x="6" y="12" width="36" height="24" rx="3.4" {...c} />
          <path d="m7.5 15 16.5 12 16.5-12" {...c} />
          <circle cx="24" cy="27" r="2.4" {...a} />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="7" y="11" width="34" height="30" rx="3.4" {...c} />
          <path d="M7 20h34M16 7v7M32 7v7" {...c} />
          <rect x="14" y="26" width="7" height="7" rx="2" {...a} />
        </>
      );
    case "chart":
      return (
        <>
          <path d="M9 39h30" {...c} />
          <path d="M9 39V12" {...c} />
          <path d="m14 31 8-8 6 5 10-13" {...c} />
          <circle cx="38" cy="15" r="2.8" {...a} />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M24 6.5 39 12v12c0 8.6-6.1 15-15 17.5C15.1 39 9 32.6 9 24V12z" {...c} />
          <path d="m17.5 24 4.6 4.6L31 19.5" {...c} />
          <circle cx="24" cy="24" r="1.8" {...a} />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="24" cy="24" r="16.5" {...c} />
          <path d="M24 13.5V24l7.5 5" {...c} />
          <circle cx="24" cy="24" r="2.2" {...a} />
        </>
      );
    case "cube":
      return (
        <>
          <path d="M24 6.5 40 15v18l-16 8.5L8 33V15z" {...c} />
          <path d="M8 15l16 8.5L40 15M24 23.5V41.5" {...c} />
          <path d="M24 9.8 36.5 16.4 24 23 11.5 16.4z" {...a} />
        </>
      );
  }
}

/** The glyph rotation used for anonymous candidates in the search field. */
export const CANDIDATE_GLYPHS: readonly GlyphName[] = [
  "search",
  "mail",
  "calendar",
  "chart",
  "shield",
  "clock",
  "cube",
  "terminal",
  "download",
  "globe",
];
