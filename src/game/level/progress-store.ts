import type { LevelStorage } from "./level-store";
import { MAX_STARS } from "./stars";

const STARS_KEY = "parking.stars";

/**
 * Persistent star progress: best star count per level key (see `packs.ts` `starKey` — random/pack
 * levels key by `r.<difficulty>.<seed36>`). Corrupt storage reads as empty; writes only ever
 * raise a level's best, never lower it.
 */

export function loadStars(storage: LevelStorage): Record<string, number> {
  const raw = storage.getItem(STARS_KEY);
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        out[key] = Math.max(0, Math.min(MAX_STARS, Math.floor(value)));
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Best stars earned on one level (0 = never completed). */
export function bestStars(storage: LevelStorage, key: string): number {
  return loadStars(storage)[key] ?? 0;
}

/** Records a run's stars; keeps the previous best when the new run scored lower. */
export function recordStars(args: { storage: LevelStorage; key: string; stars: number }): void {
  const { storage, key, stars } = args;
  const all = loadStars(storage);
  const clamped = Math.max(0, Math.min(MAX_STARS, Math.floor(stars)));
  if (clamped <= (all[key] ?? 0)) return;
  all[key] = clamped;
  storage.setItem(STARS_KEY, JSON.stringify(all));
}

/** Sum of best stars across every level. */
export function totalStars(storage: LevelStorage): number {
  return Object.values(loadStars(storage)).reduce((sum, s) => sum + s, 0);
}
