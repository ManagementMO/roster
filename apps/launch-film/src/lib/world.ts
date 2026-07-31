/**
 * The world the film is staged in.
 *
 * Scenes 3–7 share one continuous space: the same background field, the same
 * candidates, the same prism position. Defining it once here is what lets the
 * cut from Overload to Initialization to Search read as a camera moving through
 * a place rather than as three unrelated slides.
 *
 * Everything below is deterministic. No clock, no randomness at render time.
 */
import { CENTER } from "../design/spacing";
import type { GlyphName } from "../components/ToolObject/glyphs";
import { makeRng, scatter, seedFrom } from "./rng";

/* ───────────────────────────── background field ───────────────────────── */

export interface FieldTool {
  x: number;
  y: number;
  depth: number;
  size: number;
  /** Phase offset so the field drifts organically rather than in lockstep. */
  phase: number;
}

/**
 * The abstract capability field. 168 objects across three depth bands, scattered
 * with rejection sampling so it never grids up. Together with occlusion and
 * defocus this reads as "hundreds" without asking the compositor to draw them.
 */
export function buildField(seed = seedFrom("roster-field")): FieldTool[] {
  const rng = makeRng(seed);
  const points = scatter(seed, 168, { x: -140, y: -110, w: 2200, h: 1300 }, 84);
  return points.map((p) => {
    const depth = 0.2 + rng() * 0.8;
    return {
      x: p.x,
      y: p.y,
      depth,
      size: 40 + rng() * 44,
      phase: rng() * Math.PI * 2,
    };
  });
}

export const FIELD = buildField();

/** The field, sorted far → near so nearer objects occlude further ones. */
export const FIELD_SORTED = [...FIELD].sort((a, b) => b.depth - a.depth);

/** A subset near the camera, used as ribbon sources for the bundled traffic. */
export const FIELD_NEAR = FIELD.filter((t) => t.depth < 0.52).slice(0, 34);

/* ─────────────────────────────── candidates ───────────────────────────── */

export interface Candidate {
  id: string;
  name: string;
  capability: string;
  glyph: GlyphName;
  /** Does this capability make the starting five? */
  starter: boolean;
}

/**
 * The evaluated set. Five become the starting five (matching `STARTERS` in
 * productCopy); three do not. Names describe what a capability does — the film
 * attaches no score, rank or certification to any of them.
 */
export const CANDIDATES: readonly Candidate[] = [
  { id: "fs", name: "filesystem", capability: "read · write · search", glyph: "folder", starter: true },
  { id: "git", name: "git", capability: "diff · log · blame", glyph: "branch", starter: true },
  { id: "fetch", name: "fetch", capability: "retrieve a URL", glyph: "globe", starter: true },
  { id: "memory", name: "memory", capability: "durable notes", glyph: "layers", starter: true },
  { id: "sqlite", name: "sqlite", capability: "query a database", glyph: "database", starter: true },
  { id: "calendar", name: "calendar", capability: "list events", glyph: "calendar", starter: false },
  { id: "mail", name: "mail", capability: "send a message", glyph: "mail", starter: false },
  { id: "chart", name: "chart", capability: "render a plot", glyph: "chart", starter: false },
];

export const STARTER_CANDIDATES = CANDIDATES.filter((c) => c.starter);
export const BENCH_CANDIDATES = CANDIDATES.filter((c) => !c.starter);

/* ──────────────────────────────── staging ─────────────────────────────── */

/** Where the prism lives in the wide shots. Slightly above centre — a crest. */
export const CORE_HOME = { x: CENTER.x, y: 486 } as const;

/** Search-scene candidate positions: an organic cluster, right of the text column. */
export const SEARCH_SLOTS: readonly { x: number; y: number; depth: number }[] = [
  { x: 1090, y: 230, depth: 0.05 },
  { x: 1520, y: 318, depth: 0.16 },
  { x: 1045, y: 428, depth: 0.0 },
  { x: 1500, y: 542, depth: 0.1 },
  { x: 1040, y: 646, depth: 0.04 },
  { x: 1500, y: 790, depth: 0.18 },
  { x: 1078, y: 816, depth: 0.1 },
];

/** Overload-scene readable foreground tools. Six, at slightly varied depths. */
export const OVERLOAD_SLOTS: readonly { x: number; y: number; depth: number }[] = [
  { x: 388, y: 268, depth: 0.1 },
  { x: 1540, y: 232, depth: 0.14 },
  { x: 316, y: 606, depth: 0.03 },
  { x: 1596, y: 596, depth: 0.06 },
  { x: 622, y: 866, depth: 0.12 },
  { x: 1298, y: 884, depth: 0.16 },
];

/**
 * Clearing-scene layout: five survivors on the upper band, three rejects below
 * them so the downward migration to the bench is a real spatial move.
 */
export const CLEARING_KEEP: readonly { x: number; y: number }[] = [
  { x: 396, y: 372 },
  { x: 778, y: 372 },
  { x: 1160, y: 372 },
  { x: 1542, y: 372 },
  { x: 960, y: 528 },
];

export const CLEARING_CUT: readonly { x: number; y: number }[] = [
  { x: 462, y: 742 },
  { x: 960, y: 742 },
  { x: 1458, y: 742 },
];

/**
 * The Starting Five formation. Bottoms share a floor line — a team photo, not a
 * card grid — with the centre card tallest. Roster's prism sits above as the crest.
 */
export const LINEUP = [
  { x: 336, width: 276, height: 348 },
  { x: 648, width: 276, height: 386 },
  { x: 960, width: 300, height: 424 },
  { x: 1272, width: 276, height: 386 },
  { x: 1584, width: 276, height: 348 },
] as const;

export const LINEUP_FLOOR = 946;
export const LINEUP_CORE = { x: 960, y: 258 } as const;
export const LINEUP_CORE_SIZE = 214;

/** Frame at which each lineup card starts its entrance, relative to the scene. */
export const LINEUP_ORDER = [2, 1, 0, 3, 4] as const;
