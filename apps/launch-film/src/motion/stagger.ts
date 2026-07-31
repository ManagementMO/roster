/**
 * Roster launch film — stagger.
 *
 * Groups never animate in unison and never animate in a flat linear cascade.
 * These helpers give the two orders the film actually uses: an eased cascade for
 * lists, and a radial cascade for the lineup and the tool field (things nearer
 * the optical core respond first, which reads as the core *causing* the motion).
 */
import { CENTER } from "../design/spacing";

/**
 * Eased cascade. Later items in a group get progressively *less* extra delay,
 * so a long list does not drag: index 0 waits 0, the last waits `total`.
 */
export function cascade(index: number, count: number, total: number): number {
  if (count <= 1) return 0;
  const t = index / (count - 1);
  return total * (1 - (1 - t) ** 2);
}

/** Even stagger with a per-item gap. For short, deliberate sequences (≤6). */
export function step(index: number, gap: number): number {
  return index * gap;
}

/**
 * Radial stagger: delay proportional to distance from the optical core.
 * `spread` is the delay in frames applied to an item one full frame-diagonal out.
 */
export function radial(x: number, y: number, spread: number, origin = CENTER): number {
  const dx = x - origin.x;
  const dy = y - origin.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const maxD = Math.sqrt(CENTER.x * CENTER.x + CENTER.y * CENTER.y);
  return (d / maxD) * spread;
}

/**
 * The hero staging order. Every hero object in the film reveals its parts in
 * this exact sequence, which is what makes five different cards feel like five
 * instances of one object rather than five separate animations.
 *
 * shell → glyph → title → supporting copy → connection.
 */
export const HERO_STAGE = {
  shell: 0,
  glyph: 9,
  title: 16,
  support: 23,
  connection: 30,
} as const;

export type HeroPart = keyof typeof HERO_STAGE;

/** Delay for one part of a hero object that itself starts at `base`. */
export function heroPart(base: number, part: HeroPart): number {
  return base + HERO_STAGE[part];
}
