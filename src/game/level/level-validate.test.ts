import { describe, expect, it } from "vitest";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import type { Level } from "./level-types";
import { filledGrid } from "./tile-types";
import { validateLevel } from "./level-validate";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function level(overrides: Partial<Level> = {}): Level {
  return {
    id: "a",
    name: "A",
    grid: filledGrid(8, 6, 5), // 40 x 30
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [],
    exit: { a: { x: 20, y: -3 }, b: { x: 20, y: 3 }, outward: { x: 1, y: 0 } },
    ...overrides,
  };
}

describe("validateLevel", () => {
  it("accepts a well-formed level", () => {
    expect(() => validateLevel(level(), catalog)).not.toThrow();
  });

  it("rejects an empty id or name", () => {
    expect(() => validateLevel(level({ id: "" }), catalog)).toThrow(RangeError);
    expect(() => validateLevel(level({ name: "" }), catalog)).toThrow(RangeError);
  });

  it("rejects a grid whose cell count does not match cols*rows", () => {
    expect(() => validateLevel(level({ grid: { tileSize: 5, cols: 2, rows: 2, cells: [{ type: "asphalt", rot: 0 }] } }), catalog)).toThrow(RangeError);
  });

  it("rejects an unknown tile type or bad rotation", () => {
    const grid = filledGrid(2, 2, 5);
    expect(() =>
      validateLevel(level({ grid: { ...grid, cells: [{ type: "lava" as never, rot: 0 }, ...grid.cells.slice(1)] } }), catalog),
    ).toThrow(RangeError);
    expect(() =>
      validateLevel(level({ grid: { ...grid, cells: [{ type: "grass", rot: 7 }, ...grid.cells.slice(1)] } }), catalog),
    ).toThrow(RangeError);
  });

  it("rejects an unknown car/trailer variant", () => {
    expect(() =>
      validateLevel(level({ drivable: { variantId: "nope", position: { x: 0, y: 0 }, heading: 0 } }), catalog),
    ).toThrow(RangeError);
  });

  it("rejects an exit that is not on a playfield edge", () => {
    expect(() =>
      validateLevel(level({ exit: { a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, outward: { x: 0, y: 1 } } }), catalog),
    ).toThrow(RangeError);
  });
});
