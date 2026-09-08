export const seconds = (value: number, fps = 60): number => Math.round(value * fps);

export const localFrame = (frame: number, from: number): number => frame - from;
