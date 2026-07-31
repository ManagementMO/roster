/**
 * Roster launch film — space.
 *
 * A 12-column editorial grid over 1920×1080 with a generous margin, plus the
 * social-safe box every load-bearing element must stay inside.
 */

export const FRAME = { width: 1920, height: 1080 } as const;

/** Outer editorial margin. Everything important lives inside this. */
export const MARGIN = 148;

/** Social-safe box (a little tighter than the margin, for crops and overlays). */
export const SAFE = {
  left: 160,
  right: 1920 - 160,
  top: 120,
  bottom: 1080 - 120,
  width: 1920 - 320,
  height: 1080 - 240,
} as const;

/** 12-column grid inside the margins. */
const COLUMNS = 12;
const GUTTER = 32;
const gridWidth = FRAME.width - MARGIN * 2;
const colWidth = (gridWidth - GUTTER * (COLUMNS - 1)) / COLUMNS;

/** Left edge of column `n` (1-indexed). */
export function col(n: number): number {
  return MARGIN + (n - 1) * (colWidth + GUTTER);
}

/** Width spanning `n` columns. */
export function span(n: number): number {
  return n * colWidth + (n - 1) * GUTTER;
}

/** Vertical rhythm unit. Every gap in the film is a multiple of this. */
export const UNIT = 8;
export const gap = {
  hair: UNIT,
  tight: UNIT * 2,
  snug: UNIT * 3,
  base: UNIT * 5,
  wide: UNIT * 8,
  section: UNIT * 13,
} as const;

/** Corner radii. Glass is softly radiused, never pill-shaped. */
export const radius = {
  chip: 8,
  card: 18,
  panel: 26,
  hero: 30,
} as const;

/** Frame centre, referenced constantly by the optical geometry. */
export const CENTER = { x: FRAME.width / 2, y: FRAME.height / 2 } as const;

/** True when a box sits fully inside the social-safe area. Used by the QA sheet. */
export function withinSafe(box: { x: number; y: number; w: number; h: number }): boolean {
  return (
    box.x >= SAFE.left && box.y >= SAFE.top && box.x + box.w <= SAFE.right && box.y + box.h <= SAFE.bottom
  );
}
