/** Mulberry32: tiny, fast, seedable. State is a single uint32 so it serialises with the game. */
export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T extends string>(weights: Partial<Record<T, number>>): T;
  state(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    chance: p => next() < p,
    pick: items => items[Math.floor(next() * items.length)],
    weighted<T extends string>(weights: Partial<Record<T, number>>) {
      const entries = Object.entries(weights) as [T, number][];
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [key, w] of entries) { roll -= w; if (roll <= 0) return key; }
      return entries[entries.length - 1][0];
    },
    state: () => a,
  };
}
