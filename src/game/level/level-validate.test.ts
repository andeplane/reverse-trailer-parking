import { describe, expect, it } from "vitest";
import { createVariantCatalog, allCarVariants, allTrailerVariants } from "../vehicle/variants";
import type { Level } from "./level-types";
import { validateLevel } from "./level-validate";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function level(overrides: Partial<Level> = {}): Level {
  return {
    id: "a",
    name: "A",
    size: { width: 40, height: 30 },
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [],
    props: [],
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

  it("rejects a non-positive size", () => {
    expect(() => validateLevel(level({ size: { width: 0, height: 10 } }), catalog)).toThrow(RangeError);
  });

  it("rejects an unknown car/trailer variant", () => {
    expect(() =>
      validateLevel(level({ drivable: { variantId: "nope", position: { x: 0, y: 0 }, heading: 0 } }), catalog),
    ).toThrow(RangeError);
    expect(() =>
      validateLevel(
        level({ drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0, trailerVariantId: "nope" } }),
        catalog,
      ),
    ).toThrow(RangeError);
  });

  it("rejects a prop with an unknown kind or non-positive size", () => {
    expect(() =>
      validateLevel(
        level({ props: [{ kind: "spaceship" as never, position: { x: 0, y: 0 }, rotation: 0, size: { width: 1, length: 1 } }] }),
        catalog,
      ),
    ).toThrow(RangeError);
    expect(() =>
      validateLevel(
        level({ props: [{ kind: "curb", position: { x: 0, y: 0 }, rotation: 0, size: { width: 0, length: 1 } }] }),
        catalog,
      ),
    ).toThrow(RangeError);
  });

  it("rejects an exit that is not on a playfield edge", () => {
    expect(() =>
      validateLevel(level({ exit: { a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, outward: { x: 0, y: 1 } } }), catalog),
    ).toThrow(RangeError);
  });

  it("rejects a degenerate exit line", () => {
    expect(() =>
      validateLevel(level({ exit: { a: { x: 20, y: 0 }, b: { x: 20, y: 0 }, outward: { x: 1, y: 0 } } }), catalog),
    ).toThrow(RangeError);
  });
});
