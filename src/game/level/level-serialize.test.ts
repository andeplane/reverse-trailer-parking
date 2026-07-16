import { describe, expect, it } from "vitest";
import type { Level } from "./level-types";
import { filledGrid } from "./tile-types";
import { parseLevel, parseLevels, parseLevelsJson, serializeLevel, serializeLevels } from "./level-serialize";

const level: Level = {
  id: "a",
  name: "A",
  grid: filledGrid(4, 4, 5),
  drivable: { variantId: "sedan", position: { x: 1, y: 2 }, heading: 0.5, trailerVariantId: "caravan" },
  placedCars: [{ variantId: "suv", position: { x: 3, y: 4 }, heading: 1 }],
  exit: { a: { x: 10, y: -2 }, b: { x: 10, y: 2 }, outward: { x: 1, y: 0 } },
  parSeconds: 60,
};

describe("serialize/parse round-trip", () => {
  it("round-trips a level (including the tile grid) through JSON", () => {
    expect(parseLevelsJson(serializeLevels([level]))).toEqual([level]);
  });

  it("round-trips a single level and preserves optional fields", () => {
    expect(parseLevel(JSON.parse(serializeLevel(level)))).toEqual(level);
  });

  it("omits an absent trailer/par without adding undefined keys", () => {
    const minimal: Level = { ...level, drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0 } };
    delete (minimal as { parSeconds?: number }).parSeconds;
    const parsed = parseLevel(JSON.parse(serializeLevel(minimal)));
    expect(parsed.drivable.trailerVariantId).toBeUndefined();
    expect(parsed.parSeconds).toBeUndefined();
  });
});

describe("parse validation", () => {
  it("throws on a non-object", () => {
    expect(() => parseLevel(42)).toThrow(RangeError);
  });
  it("throws when a required field is missing/mistyped", () => {
    expect(() => parseLevel({ ...level, id: 5 })).toThrow(RangeError);
    expect(() => parseLevel({ ...level, grid: { tileSize: "x", cols: 1, rows: 1, cells: [] } })).toThrow(RangeError);
    expect(() => parseLevel({ ...level, placedCars: "no" })).toThrow(RangeError);
  });
  it("throws when grid.cells is not an array", () => {
    expect(() => parseLevel({ ...level, grid: { tileSize: 5, cols: 1, rows: 1, cells: {} } })).toThrow(RangeError);
  });
  it("parseLevels requires an array", () => {
    expect(() => parseLevels({})).toThrow(RangeError);
  });
});
