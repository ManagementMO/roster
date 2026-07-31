/**
 * Roster launch film — colour.
 *
 * The whole film lives on luminous warm-white mineral paper. Ink is graphite,
 * never pure black. Chroma is a budget, not a decoration: a frame may spend it
 * on ONE accent, and coral is reserved exclusively for failure so that when a
 * starter breaks the eye goes straight there.
 */

/** Warm-white and pale-mineral grounds. Ordered light → less light. */
export const paper = {
  /** The base sheet. Warm, slightly creamy — never #fff. */
  base: "#F6F4F1",
  /** Where the studio key light lands. */
  lit: "#FFFDFA",
  /** Cool mineral shade that keeps the white from going yellow. */
  mineral: "#EDEBE9",
  /** Deepest ground tone, used only at frame edges. */
  shade: "#E1DDD8",
} as const;

/** Graphite ink. Text never uses pure black; it reads harsh against warm white. */
export const ink = {
  /** Headlines. */
  strong: "#16181C",
  /** Body and titles. */
  base: "#2A2D33",
  /** Supporting copy. */
  muted: "#5C616B",
  /** Labels and eyebrow type. */
  faint: "#8A8F99",
  /** Hairlines and dormant geometry. */
  hair: "#B9BCC3",
} as const;

/**
 * The spectral accents. Blue is the product colour (routing, selection);
 * violet is intelligence (search, learning, the Sixth Man); cyan is return
 * data; amber is certification. Coral is failure and nothing else.
 */
export const accent = {
  blue: "#2C6BF2",
  blueDeep: "#1B45AE",
  blueLift: "#7BA6FF",
  violet: "#7A4DE8",
  violetLift: "#B79BFF",
  cyan: "#28B6C8",
  cyanLift: "#8BE0EA",
  amber: "#D08A2C",
  amberLift: "#F0C078",
  coral: "#E2543F",
  coralLift: "#F79A88",
} as const;

/** Glass tints — always white-dominant, tinted by a whisper. */
export const glass = {
  fillTop: "rgba(255,255,255,0.86)",
  fillBottom: "rgba(255,255,255,0.52)",
  fillFlat: "rgba(255,255,255,0.66)",
  /** The bright optical edge that reads as a polished bevel. */
  edgeLight: "rgba(255,255,255,0.95)",
  /** The dim edge on the shadow side. */
  edgeDark: "rgba(120,124,136,0.30)",
  /** Interior sheen band. */
  sheen: "rgba(255,255,255,0.70)",
} as const;

/** Shadow stack. Two layers: a tight contact shadow and a broad ambient one. */
export const shadow = {
  contact: "rgba(38,40,48,0.16)",
  ambient: "rgba(38,40,48,0.10)",
  deep: "rgba(30,32,40,0.22)",
} as const;

/** rgba() from a hex string plus alpha. Deterministic, no colour library. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : h;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Linear blend between two hex colours. `t` is clamped to [0,1]. */
export function mix(from: string, to: string, t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ] as const;
  };
  const a = parse(from);
  const b = parse(to);
  const ch = (i: 0 | 1 | 2) => Math.round(a[i] + (b[i] - a[i]) * c);
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

/** Named semantic roles, so scenes never reach for a raw hex. */
export const role = {
  dormant: ink.hair,
  selected: accent.blue,
  request: accent.blue,
  returned: accent.cyan,
  searching: accent.violet,
  learning: accent.violet,
  certified: accent.amber,
  failed: accent.coral,
  suggested: accent.violet,
} as const;
