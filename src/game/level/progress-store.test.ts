import { describe, expect, it } from "vitest";
import type { LevelStorage } from "./level-store";
import { bestStars, loadStars, recordStars, totalStars } from "./progress-store";

function fakeStorage(initial?: Record<string, string>): LevelStorage {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
}

describe("progress-store", () => {
  it("starts empty and records a run's stars", () => {
    const storage = fakeStorage();
    expect(loadStars(storage)).toEqual({});
    expect(bestStars(storage, "r.easy.abc")).toBe(0);
    recordStars({ storage, key: "r.easy.abc", stars: 2 });
    expect(bestStars(storage, "r.easy.abc")).toBe(2);
  });

  it("only ever raises a level's best", () => {
    const storage = fakeStorage();
    recordStars({ storage, key: "r.easy.abc", stars: 3 });
    recordStars({ storage, key: "r.easy.abc", stars: 1 });
    expect(bestStars(storage, "r.easy.abc")).toBe(3);
  });

  it("sums total stars across levels", () => {
    const storage = fakeStorage();
    recordStars({ storage, key: "r.easy.a", stars: 3 });
    recordStars({ storage, key: "r.medium.b", stars: 2 });
    expect(totalStars(storage)).toBe(5);
  });

  it("survives corrupt or foreign-shaped storage", () => {
    expect(loadStars(fakeStorage({ "parking.stars": "not json" }))).toEqual({});
    expect(loadStars(fakeStorage({ "parking.stars": '["array"]' }))).toEqual({});
    expect(loadStars(fakeStorage({ "parking.stars": '{"a": "NaN", "b": 2}' }))).toEqual({ b: 2 });
    expect(totalStars(fakeStorage({ "parking.stars": "42" }))).toBe(0);
  });

  it("clamps out-of-range star values on read and write", () => {
    const storage = fakeStorage({ "parking.stars": '{"a": 99, "b": -1, "c": 2.7}' });
    expect(loadStars(storage)).toEqual({ a: 3, b: 0, c: 2 });
    recordStars({ storage, key: "d", stars: 11 });
    expect(bestStars(storage, "d")).toBe(3);
  });

  it("ignores a record that would not beat the stored best (no write)", () => {
    const writes: string[] = [];
    const store = new Map<string, string>();
    const storage: LevelStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        writes.push(k);
        store.set(k, v);
      },
    };
    recordStars({ storage, key: "a", stars: 2 });
    recordStars({ storage, key: "a", stars: 2 });
    expect(writes).toHaveLength(1);
  });
});
