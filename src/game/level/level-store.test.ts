import { describe, expect, it } from "vitest";
import { filledGrid } from "./tile-types";
import type { Level } from "./level-types";
import {
  deleteCustomLevel,
  fetchBundledLevels,
  loadCustomLevels,
  mergeLevels,
  saveCustomLevel,
  type LevelStorage,
} from "./level-store";

function makeLevel(id: string, name = id): Level {
  return {
    id,
    name,
    grid: filledGrid(4, 4, 5),
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0 },
    placedCars: [],
    exit: { a: { x: 10, y: -2 }, b: { x: 10, y: 2 }, outward: { x: 1, y: 0 } },
  };
}

function fakeStorage(): LevelStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe("custom level storage", () => {
  it("returns [] when nothing is stored", () => {
    expect(loadCustomLevels(fakeStorage())).toEqual([]);
  });

  it("saves and reloads a custom level", () => {
    const storage = fakeStorage();
    saveCustomLevel(makeLevel("x"), storage);
    expect(loadCustomLevels(storage).map((l) => l.id)).toEqual(["x"]);
  });

  it("replaces a custom level with the same id (upsert)", () => {
    const storage = fakeStorage();
    saveCustomLevel(makeLevel("x", "old"), storage);
    saveCustomLevel(makeLevel("x", "new"), storage);
    const levels = loadCustomLevels(storage);
    expect(levels).toHaveLength(1);
    expect(levels[0]?.name).toBe("new");
  });

  it("deletes a custom level by id", () => {
    const storage = fakeStorage();
    saveCustomLevel(makeLevel("x"), storage);
    saveCustomLevel(makeLevel("y"), storage);
    deleteCustomLevel("x", storage);
    expect(loadCustomLevels(storage).map((l) => l.id)).toEqual(["y"]);
  });

  it("returns [] for corrupt stored data", () => {
    const storage = fakeStorage();
    storage.setItem("parking.customLevels", "{not json");
    expect(loadCustomLevels(storage)).toEqual([]);
  });
});

describe("mergeLevels", () => {
  it("appends custom levels and overrides bundled ones by id", () => {
    const bundled = [makeLevel("a", "A"), makeLevel("b", "B")];
    const custom = [makeLevel("b", "B-custom"), makeLevel("c", "C")];
    const merged = mergeLevels(bundled, custom);
    expect(merged.map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(merged.find((l) => l.id === "b")?.name).toBe("B-custom");
  });
});

describe("fetchBundledLevels", () => {
  it("fetches and parses the levels JSON", async () => {
    const levels = [makeLevel("a"), makeLevel("b")];
    const fakeFetch = (async () => ({ json: async () => levels })) as unknown as typeof fetch;
    expect((await fetchBundledLevels("/levels.json", fakeFetch)).map((l) => l.id)).toEqual(["a", "b"]);
  });
});
