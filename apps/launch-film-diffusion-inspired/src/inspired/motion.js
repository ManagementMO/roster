export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const mix = (from, to, amount) => from + (to - from) * amount;
export const span = (time, start, end) => clamp((time - start) / Math.max(0.0001, end - start));
export const smooth = (value) => {
  const v = clamp(value);
  return v * v * (3 - 2 * v);
};
export const easeOut = (value) => 1 - (1 - clamp(value)) ** 3;
export const easeIn = (value) => clamp(value) ** 3;
export const easeInOut = (value) => {
  const v = clamp(value);
  return v < 0.5 ? 4 * v ** 3 : 1 - (-2 * v + 2) ** 3 / 2;
};
export const softBack = (value) => {
  const v = clamp(value);
  const base = easeOut(v);
  return base + Math.sin(v * Math.PI) * 0.045 * (1 - v * 0.35);
};
export const hash = (value) => {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
export const bezierPoint = (start, control1, control2, end, amount) => {
  const t = clamp(amount);
  const u = 1 - t;
  return [
    u ** 3 * start[0] + 3 * u ** 2 * t * control1[0] + 3 * u * t ** 2 * control2[0] + t ** 3 * end[0],
    u ** 3 * start[1] + 3 * u ** 2 * t * control1[1] + 3 * u * t ** 2 * control2[1] + t ** 3 * end[1],
  ];
};
