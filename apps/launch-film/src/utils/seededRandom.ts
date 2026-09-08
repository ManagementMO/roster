const hashSeed = (seed: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Mulberry32 with a string seed. Stable across browsers and render workers. */
export const makeSeededRandom = (seed: string): (() => number) => {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const randomBetween = (random: () => number, min: number, max: number): number =>
  min + random() * (max - min);

export const randomInt = (random: () => number, min: number, max: number): number =>
  Math.floor(randomBetween(random, min, max + 1));
