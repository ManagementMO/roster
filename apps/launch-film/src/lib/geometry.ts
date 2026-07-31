/**
 * Geometry the film draws with.
 *
 * The important one is `ribbonPath`. Connections in this film are never strokes:
 * a stroked bezier gives you a uniform hairline that reads as a wire diagram. A
 * ribbon is a FILLED path built from two offset curves, so it can taper — wide
 * where it leaves the core, narrow where it meets a card — which is what makes
 * the routing read as flow rather than as a network graph.
 */

export interface Point {
  x: number;
  y: number;
}

export const pt = (x: number, y: number): Point => ({ x, y });

/** Cubic bezier evaluation. */
export function cubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** First derivative of the same cubic — used for the ribbon's normal. */
export function cubicTangent(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

/**
 * Control points for the film's house curve: an S-bend that leaves `from`
 * horizontally and arrives at `to` horizontally. `bow` bends it off the straight
 * line, which is how two ribbons to neighbouring cards stay visually separate.
 */
export function houseCurve(from: Point, to: Point, bow = 0): [Point, Point, Point, Point] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const reach = Math.max(90, Math.abs(dx) * 0.52 + Math.abs(dy) * 0.16);
  const nx = -dy;
  const ny = dx;
  const len = Math.hypot(nx, ny) || 1;
  const ox = (nx / len) * bow;
  const oy = (ny / len) * bow;
  return [
    from,
    { x: from.x + reach + ox, y: from.y + oy },
    { x: to.x - reach + ox, y: to.y + oy },
    to,
  ];
}

/** Same curve, but leaving and arriving along an arbitrary direction. */
export function radialCurve(from: Point, to: Point, tension = 0.46, bow = 0): [Point, Point, Point, Point] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d;
  const ny = dx / d;
  return [
    from,
    { x: from.x + dx * tension + nx * bow, y: from.y + dy * tension + ny * bow },
    { x: to.x - dx * tension + nx * bow, y: to.y - dy * tension + ny * bow },
    to,
  ];
}

/**
 * A tapered ribbon as a closed SVG path.
 *
 * `widthAt(t)` returns the half-width at position t along the curve, so a caller
 * can taper, bulge, or pinch. `progress` clips the ribbon to its first fraction,
 * which is how connections draw on without a stroke-dasharray hack.
 */
export function ribbonPath(
  curve: readonly [Point, Point, Point, Point],
  widthAt: (t: number) => number,
  progress = 1,
  segments = 34,
): string {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0.001) return "";
  const [p0, p1, p2, p3] = curve;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * p;
    const c = cubic(p0, p1, p2, p3, t);
    const tan = cubicTangent(p0, p1, p2, p3, t);
    const len = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / len;
    const ny = tan.x / len;
    const w = Math.max(0.2, widthAt(t));
    left.push({ x: c.x + nx * w, y: c.y + ny * w });
    right.push({ x: c.x - nx * w, y: c.y - ny * w });
  }
  const fwd = left.map((q, i) => `${i === 0 ? "M" : "L"}${q.x.toFixed(2)},${q.y.toFixed(2)}`).join("");
  const back = right
    .slice()
    .reverse()
    .map((q) => `L${q.x.toFixed(2)},${q.y.toFixed(2)}`)
    .join("");
  return `${fwd}${back}Z`;
}

/** The centreline of the same curve, clipped to `progress`. For light packets. */
export function centerline(curve: readonly [Point, Point, Point, Point], progress = 1, segments = 34): string {
  const p = Math.max(0, Math.min(1, progress));
  const [p0, p1, p2, p3] = curve;
  const out: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * p;
    const c = cubic(p0, p1, p2, p3, t);
    out.push(`${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`);
  }
  return out.join("");
}

/**
 * Regular polygon vertices. `rotation` in degrees; 0 puts the first vertex
 * straight up, which is what the five-aperture prism wants.
 */
export function polygon(center: Point, radius: number, sides: number, rotation = 0): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((i / sides) * 360 + rotation - 90) * (Math.PI / 180);
    out.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return out;
}

/** Points → an SVG polygon path. */
export function polyPath(points: readonly Point[], close = true): string {
  if (points.length === 0) return "";
  const head = points.map((q, i) => `${i === 0 ? "M" : "L"}${q.x.toFixed(2)},${q.y.toFixed(2)}`).join("");
  return close ? `${head}Z` : head;
}

/**
 * A rounded polygon — the prism facets need soft corners or they read as a
 * flat vector badge rather than a cut optical solid.
 */
export function roundedPolyPath(points: readonly Point[], radius: number): string {
  const n = points.length;
  if (n < 3) return polyPath(points);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n] as Point;
    const curr = points[i] as Point;
    const next = points[(i + 1) % n] as Point;
    const toPrev = norm({ x: prev.x - curr.x, y: prev.y - curr.y });
    const toNext = norm({ x: next.x - curr.x, y: next.y - curr.y });
    const a = { x: curr.x + toPrev.x * radius, y: curr.y + toPrev.y * radius };
    const b = { x: curr.x + toNext.x * radius, y: curr.y + toNext.y * radius };
    parts.push(
      `${i === 0 ? `M${a.x.toFixed(2)},${a.y.toFixed(2)}` : `L${a.x.toFixed(2)},${a.y.toFixed(2)}`}`,
    );
    parts.push(`Q${curr.x.toFixed(2)},${curr.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`);
  }
  return `${parts.join("")}Z`;
}

function norm(v: Point): Point {
  const d = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / d, y: v.y / d };
}

/** Linear interpolation between two points. */
export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Distance between two points. */
export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
