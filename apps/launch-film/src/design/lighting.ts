/**
 * Roster launch film — lighting.
 *
 * One key, one fill, one rim. The key sits upper-left and never moves, which is
 * what makes the glass across eleven scenes feel like one physical set rather
 * than eleven CSS treatments: every highlight runs top-left, every shadow falls
 * bottom-right, every bevel is bright on the same edge.
 */
import { alpha, accent, paper, shadow } from "./colors";

/** The immovable key light, in frame coordinates. */
export const KEY = { x: 470, y: -160 } as const;

/** Direction shadows fall, normalised. Derived from the key so they can't drift. */
export const SHADOW_DIR = { x: 0.42, y: 0.91 } as const;

/**
 * The room: a warm key wash from upper-left, a cool mineral bounce lower-right,
 * and a faint spectral bloom that keeps the white from reading as dead paper.
 */
export function roomBackground(): string {
  return [
    `radial-gradient(1500px 1100px at ${KEY.x}px ${KEY.y}px, ${alpha("#FFFFFF", 0.98)} 0%, ${alpha("#FFFBF5", 0.6)} 38%, rgba(255,251,245,0) 72%)`,
    `radial-gradient(1250px 950px at 1680px 1220px, ${alpha(accent.blue, 0.07)} 0%, rgba(44,107,242,0) 66%)`,
    `radial-gradient(900px 760px at 120px 1060px, ${alpha(accent.violet, 0.05)} 0%, rgba(122,77,232,0) 70%)`,
    `linear-gradient(168deg, ${paper.lit} 0%, ${paper.base} 46%, ${paper.mineral} 82%, ${paper.shade} 100%)`,
  ].join(", ");
}

/**
 * Two-layer drop shadow for an object floating `lift` pixels off the paper.
 * Contact shadow tightens and darkens as the object settles; the ambient layer
 * spreads as it rises. Feeding both from one number is what sells the depth.
 */
export function elevation(lift: number): string {
  const l = Math.max(0, lift);
  const contactBlur = 10 + l * 0.5;
  const contactY = 3 + l * 0.28;
  const ambientBlur = 44 + l * 2.6;
  const ambientY = 16 + l * 1.5;
  const contactAlpha = 0.2 - Math.min(0.11, l * 0.0035);
  return [
    `0px ${contactY.toFixed(1)}px ${contactBlur.toFixed(1)}px ${alpha("#262830", contactAlpha)}`,
    `0px ${ambientY.toFixed(1)}px ${ambientBlur.toFixed(1)}px ${shadow.ambient}`,
    `0px ${(ambientY * 2).toFixed(1)}px ${(ambientBlur * 2).toFixed(1)}px ${alpha("#262830", 0.05)}`,
  ].join(", ");
}

/**
 * The bevel: a conic-ish border gradient that is bright where the key hits and
 * dim on the away side. Applied as a `border-image`-free double background so it
 * composites cheaply.
 */
export function bevel(strength = 1): string {
  const bright = 0.95 * strength;
  const dim = 0.26 * strength;
  return `linear-gradient(148deg, ${alpha("#FFFFFF", bright)} 0%, ${alpha("#FFFFFF", 0.28 * strength)} 34%, ${alpha("#7C818E", dim * 0.5)} 62%, ${alpha("#6E7380", dim)} 100%)`;
}

/**
 * Chromatic dispersion at a glass edge — the tiny blue/violet/cyan split that
 * makes a translucent surface read as optical rather than as a white rectangle.
 * Kept under 10% alpha; this is a hint, not a rainbow.
 */
export function dispersion(strength = 1): string {
  return [
    `linear-gradient(120deg, ${alpha(accent.cyan, 0.1 * strength)} 0%, rgba(0,0,0,0) 22%)`,
    `linear-gradient(300deg, ${alpha(accent.violet, 0.09 * strength)} 0%, rgba(0,0,0,0) 24%)`,
    `linear-gradient(210deg, ${alpha(accent.blue, 0.07 * strength)} 0%, rgba(0,0,0,0) 30%)`,
  ].join(", ");
}

/** A soft, wide light bloom used behind the optical core and the brand mark. */
export function bloom(color: string, radiusPx: number, strength: number): string {
  return `radial-gradient(${radiusPx}px ${radiusPx}px at 50% 50%, ${alpha(color, 0.42 * strength)} 0%, ${alpha(color, 0.16 * strength)} 32%, ${alpha(color, 0.04 * strength)} 58%, rgba(0,0,0,0) 76%)`;
}

/**
 * Depth-of-field for the tool field. `depth` runs 0 (at camera) → 1 (far).
 * Everything the viewer is not meant to read is dissolved by this one function.
 */
export function depthOfField(depth: number): { blur: number; opacity: number; scale: number } {
  const d = Math.max(0, Math.min(1, depth));
  return {
    blur: d * d * 13,
    opacity: 1 - d * 0.78,
    scale: 1 - d * 0.42,
  };
}
