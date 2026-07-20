/**
 * Seeded pseudo-random numbers (mulberry32). Deterministic: the same seed always yields the same
 * sequence, on every platform. Injected as a dependency wherever randomness is needed — never
 * `Math.random()` — so generation is reproducible and testable.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
}

export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Uniform float in [min, max). */
export function rngRange(args: { rng: Rng; min: number; max: number }): number {
  return args.min + args.rng.next() * (args.max - args.min);
}

/** Uniform integer in [min, max] (inclusive). */
export function rngInt(args: { rng: Rng; min: number; max: number }): number {
  return args.min + Math.floor(args.rng.next() * (args.max - args.min + 1));
}

/** A uniformly chosen element; throws on an empty list. */
export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError("rngPick: empty list");
  return items[Math.min(items.length - 1, Math.floor(rng.next() * items.length))]!;
}
