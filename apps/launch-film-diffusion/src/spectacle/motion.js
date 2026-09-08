export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const mix = (from, to, amount) => from + (to - from) * amount;
export const inv = (amount) => 1 - amount;
export const span = (time, start, end) => clamp((time - start) / (end - start));

export const ease = {
  linear: (value) => clamp(value),
  in2: (value) => clamp(value) ** 2,
  in3: (value) => clamp(value) ** 3,
  out2: (value) => 1 - (1 - clamp(value)) ** 2,
  out3: (value) => 1 - (1 - clamp(value)) ** 3,
  out5: (value) => 1 - (1 - clamp(value)) ** 5,
  inOut: (value) => {
    const v = clamp(value);
    return v < 0.5 ? 4 * v ** 3 : 1 - (-2 * v + 2) ** 3 / 2;
  },
  expoOut: (value) => clamp(value) === 1 ? 1 : 1 - 2 ** (-10 * clamp(value)),
  backOut: (value) => {
    const v = clamp(value);
    const c1 = 1.42;
    const c3 = c1 + 1;
    return 1 + c3 * (v - 1) ** 3 + c1 * (v - 1) ** 2;
  },
  softBack: (value) => {
    const v = clamp(value);
    const base = 1 - (1 - v) ** 4;
    const settle = Math.sin(v * Math.PI) * 0.08 * (1 - v * 0.45);
    return base + settle;
  },
  elasticOut: (value) => {
    const v = clamp(value);
    if (v === 0 || v === 1) return v;
    return 2 ** (-9 * v) * Math.sin((v * 10 - 0.72) * (2 * Math.PI) / 3) + 1;
  },
};

export const enter = (time, start, duration = 0.7, easing = ease.out3) => easing(span(time, start, start + duration));
export const exit = (time, start, duration = 0.55, easing = ease.in3) => 1 - easing(span(time, start, start + duration));
export const windowAlpha = (time, start, end, inDuration = 0.35, outDuration = 0.35) => (
  enter(time, start, inDuration) * exit(time, end - outDuration, outDuration)
);

export const overshoot = (time, start, duration = 0.8) => ease.backOut(span(time, start, start + duration));

export const hash = (value) => {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const project = (x, y, z, cameraZ = 0, focal = 880) => {
  const depth = Math.max(100, z - cameraZ + focal);
  const scale = focal / depth;
  return {
    x: 960 + x * scale,
    y: 540 + y * scale,
    scale,
    depth,
  };
};

export const bezierPoint = (start, control1, control2, end, amount) => {
  const t = clamp(amount);
  const u = 1 - t;
  return [
    u ** 3 * start[0] + 3 * u ** 2 * t * control1[0] + 3 * u * t ** 2 * control2[0] + t ** 3 * end[0],
    u ** 3 * start[1] + 3 * u ** 2 * t * control1[1] + 3 * u * t ** 2 * control2[1] + t ** 3 * end[1],
  ];
};

export const velocityBlur = (amount, maximum = 18) => Math.sin(clamp(amount) * Math.PI) * maximum;
