export type Point = { readonly x: number; readonly y: number };

export const curvedPath = (from: Point, to: Point, bend = 0.36): string => {
  const dx = to.x - from.x;
  const controlA = { x: from.x + dx * bend, y: from.y };
  const controlB = { x: to.x - dx * bend, y: to.y };
  return `M ${from.x} ${from.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${to.x} ${to.y}`;
};

export const polar = (radius: number, angle: number): Point => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius,
});
