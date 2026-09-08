export const staggerFrame = (index: number, start: number, step: number): number => start + index * step;

export const centerOutOrder = (count: number): number[] => {
  const center = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => index).sort(
    (a, b) => Math.abs(a - center) - Math.abs(b - center),
  );
};
