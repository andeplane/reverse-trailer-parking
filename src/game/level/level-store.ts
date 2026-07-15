import type { Level } from "./level-types";
import { parseLevels, parseLevelsJson, serializeLevels } from "./level-serialize";

const CUSTOM_KEY = "parking.customLevels";

/** Minimal `localStorage`-shaped dependency (injectable for tests). */
export interface LevelStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Loads custom (editor-authored) levels from storage; returns [] if none/corrupt. */
export function loadCustomLevels(storage: LevelStorage): Level[] {
  const raw = storage.getItem(CUSTOM_KEY);
  if (!raw) return [];
  try {
    return parseLevelsJson(raw);
  } catch {
    return [];
  }
}

/** Inserts or replaces (by id) a custom level in storage. */
export function saveCustomLevel(level: Level, storage: LevelStorage): void {
  const existing = loadCustomLevels(storage).filter((l) => l.id !== level.id);
  storage.setItem(CUSTOM_KEY, serializeLevels([...existing, level]));
}

export function deleteCustomLevel(id: string, storage: LevelStorage): void {
  const remaining = loadCustomLevels(storage).filter((l) => l.id !== id);
  storage.setItem(CUSTOM_KEY, serializeLevels(remaining));
}

/** Merges bundled + custom levels; a custom level replaces a bundled one with the same id. */
export function mergeLevels(bundled: Level[], custom: Level[]): Level[] {
  const byId = new Map<string, Level>();
  for (const l of bundled) byId.set(l.id, l);
  for (const l of custom) byId.set(l.id, l);
  return [...byId.values()];
}

/** Fetches the bundled `levels.json` (thin glue; injectable fetch for tests). */
export async function fetchBundledLevels(
  url = "/levels.json",
  fetchFn: typeof fetch = fetch,
): Promise<Level[]> {
  const res = await fetchFn(url);
  const data: unknown = await res.json();
  return parseLevels(data);
}
