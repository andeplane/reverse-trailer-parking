import { describe, expect, it } from "vitest";
import type { Level } from "./level-types";
import { curbAt, filledGrid, withCurb } from "./tile-types";
import { parseLevel, parseLevels, parseLevelsJson, serializeLevel, serializeLevels } from "./level-serialize";

const level: Level = {
  id: "a",
  name: "A",
  grid: withCurb(filledGrid(4, 4, 5), { o: "h", col: 1, row: 2 }, true),
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
  it("throws on an unknown tile type", () => {
    const grid = filledGrid(1, 1, 5);
    expect(() => parseLevel({ ...level, grid: { ...grid, cells: [{ type: "lava", rot: 0 }] } })).toThrow(RangeError);
  });
});

describe("legacy saves (pre edge-curb)", () => {
  it("defaults missing curb arrays to no curbs", () => {
    const raw = JSON.parse(serializeLevel(level)) as { grid: Record<string, unknown> };
    delete raw.grid.hCurbs;
    delete raw.grid.vCurbs;
    const parsed = parseLevel(raw);
    expect(parsed.grid.hCurbs.every((c) => !c)).toBe(true);
    expect(parsed.grid.hCurbs).toHaveLength(5 * 4);
    expect(parsed.grid.vCurbs).toHaveLength(4 * 5);
  });

  it("migrates legacy curb tiles into an outline of edge curbs on asphalt", () => {
    const grid = filledGrid(3, 1, 5);
    const raw = JSON.parse(serializeLevel({ ...level, grid })) as {
      grid: { cells: { type: string; rot: number }[]; hCurbs?: unknown; vCurbs?: unknown };
    };
    raw.grid.cells[0] = { type: "curb", rot: 1 };
    raw.grid.cells[1] = { type: "curb-corner", rot: 0 };
    delete raw.grid.hCurbs;
    delete raw.grid.vCurbs;
    const parsed = parseLevel(raw);
    expect(parsed.grid.cells[0]).toEqual({ type: "asphalt", rot: 0 });
    expect(parsed.grid.cells[1]).toEqual({ type: "asphalt", rot: 0 });
    // Outline around the two-cell region: top+bottom of both cells, left of cell 0, right of cell 1 —
    // but NOT the edge between the two legacy curb cells.
    expect(curbAt(parsed.grid, { o: "h", col: 0, row: 0 })).toBe(true);
    expect(curbAt(parsed.grid, { o: "h", col: 1, row: 1 })).toBe(true);
    expect(curbAt(parsed.grid, { o: "v", col: 0, row: 0 })).toBe(true);
    expect(curbAt(parsed.grid, { o: "v", col: 2, row: 0 })).toBe(true);
    expect(curbAt(parsed.grid, { o: "v", col: 1, row: 0 })).toBe(false);
  });
});
