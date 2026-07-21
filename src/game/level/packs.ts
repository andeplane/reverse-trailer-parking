import { ALL_DIFFICULTIES, type Difficulty } from "./random/difficulty";

/**
 * Level packs: one endless pack per difficulty. A pack level is nothing but a deterministic
 * random-generation seed, so "Easy · Level 7" is the same map for every player forever and shares
 * through the existing `r.<difficulty>.<seed36>` URL. Stars are keyed by that same seed string
 * (see `progress-store.ts`), so a level opened from a friend's link records onto the same entry.
 *
 * NEVER change `packLevelSeed`'s hash: every player's earned stars are keyed by its output.
 */

/** How many level tiles a pack shows initially, and how many each "More" click adds. */
export const PACK_PAGE_SIZE = 12;

/** SplitMix32 finaliser — a well-mixed 32-bit hash of (difficulty, index). */
function mix32(value: number): number {
  let h = value >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** The generation seed of level `index` (0-based) in the pack for `difficulty`. Stable forever. */
export function packLevelSeed(args: { difficulty: Difficulty; index: number }): number {
  const { difficulty, index } = args;
  const difficultySalt = (ALL_DIFFICULTIES.indexOf(difficulty) + 1) * 0x9e3779b9;
  return mix32((difficultySalt + Math.imul(index + 1, 0x85ebca6b)) >>> 0);
}

/** The progress-store key for a random/pack level — identical to its `r.` share-URL payload. */
export function starKey(args: { difficulty: Difficulty; seed: number }): string {
  return `r.${args.difficulty}.${(args.seed >>> 0).toString(36)}`;
}

/** How many pack indices `packIndexOfSeed` scans — bounds shared-URL reverse lookup. */
export const PACK_SCAN_LIMIT = 500;

/** The pack index a seed belongs to (scanning the first `PACK_SCAN_LIMIT`), or null. Lets a
 * shared `r.` URL that happens to be a pack level open with its pack name and next-level flow. */
export function packIndexOfSeed(args: { difficulty: Difficulty; seed: number }): number | null {
  for (let index = 0; index < PACK_SCAN_LIMIT; index++) {
    if (packLevelSeed({ difficulty: args.difficulty, index }) === (args.seed >>> 0)) return index;
  }
  return null;
}

/** Display name for a pack level, e.g. "Easy · Level 7" (index is 0-based). */
export function packLevelName(args: { difficulty: Difficulty; index: number }): string {
  const { difficulty, index } = args;
  return `${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)} · Level ${index + 1}`;
}
