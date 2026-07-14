import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import type { Metres, MPerS } from "../../engine/math/units";
import type { CarVariant, TrailerVariant } from "./vehicle-types";
import { deriveCarGeometry } from "./vehicle-geometry";
import {
  allCarVariants,
  allTrailerVariants,
  caravanTrailerVariant,
  createVariantCatalog,
  hatchbackCarVariant,
  sedanCarVariant,
  suvCarVariant,
  utilityTrailerVariant,
  validateCarVariant,
  validateTrailerVariant,
} from "./variants";

describe("sedanCarVariant / caravanTrailerVariant", () => {
  it("are valid by construction", () => {
    expect(() => validateCarVariant(sedanCarVariant)).not.toThrow();
    expect(() => validateTrailerVariant(caravanTrailerVariant)).not.toThrow();
  });
});

describe("catalog of variants (US4)", () => {
  it("every bundled car and trailer variant is valid", () => {
    for (const car of allCarVariants) expect(() => validateCarVariant(car)).not.toThrow();
    for (const trailer of allTrailerVariants) expect(() => validateTrailerVariant(trailer)).not.toThrow();
  });

  it("exposes unique variant ids", () => {
    const carIds = allCarVariants.map((c) => c.id);
    const trailerIds = allTrailerVariants.map((t) => t.id);
    expect(new Set(carIds).size).toBe(carIds.length);
    expect(new Set(trailerIds).size).toBe(trailerIds.length);
  });

  it("the SUV has a longer wheelbase and smaller steer lock than the hatchback (larger turn radius)", () => {
    const suv = deriveCarGeometry(suvCarVariant);
    const hatch = deriveCarGeometry(hatchbackCarVariant);
    expect(suv.wheelbase).toBeGreaterThan(hatch.wheelbase);
    expect(suvCarVariant.steerMax).toBeLessThan(hatchbackCarVariant.steerMax);
    // Minimum turn radius R = L / tan(steerMax): a larger L and smaller steerMax ⇒ larger R.
    const suvRadius = suv.wheelbase / Math.tan(suvCarVariant.steerMax);
    const hatchRadius = hatch.wheelbase / Math.tan(hatchbackCarVariant.steerMax);
    expect(suvRadius).toBeGreaterThan(hatchRadius);
  });

  it("the utility trailer has a shorter, wider footprint than the caravan", () => {
    expect(utilityTrailerVariant.bodyLength).toBeLessThan(caravanTrailerVariant.bodyLength);
  });
});

describe("createVariantCatalog", () => {
  it("defaults to the sedan + caravan when no args given", () => {
    const catalog = createVariantCatalog();
    expect(catalog.cars.map((c) => c.id)).toEqual(["sedan"]);
    expect(catalog.trailers.map((t) => t.id)).toEqual(["caravan"]);
  });

  it("accepts a custom set of variants", () => {
    const catalog = createVariantCatalog({ cars: [sedanCarVariant], trailers: [] });
    expect(catalog.cars).toHaveLength(1);
    expect(catalog.trailers).toHaveLength(0);
  });

  it("throws if any car variant is invalid", () => {
    const bad: CarVariant = { ...sedanCarVariant, bodyWidth: -1 as Metres };
    expect(() => createVariantCatalog({ cars: [bad] })).toThrow(RangeError);
  });
});

describe("validateCarVariant", () => {
  const cases: Array<[string, Partial<CarVariant>]> = [
    ["non-positive bodyWidth", { bodyWidth: 0 as Metres }],
    ["non-positive bodyLength", { bodyLength: -1 as Metres }],
    ["steerMax out of range (0)", { steerMax: 0 as Radians }],
    ["steerMax out of range (>= π/2)", { steerMax: (Math.PI / 2) as Radians }],
    ["jackknifeMax out of range (0)", { jackknifeMax: 0 as Radians }],
    ["jackknifeMax out of range (>= π)", { jackknifeMax: Math.PI as Radians }],
    ["non-positive maxSpeedForward", { maxSpeedForward: 0 as MPerS }],
    ["non-positive maxSpeedReverse", { maxSpeedReverse: 0 as MPerS }],
    ["non-positive accel", { accel: 0 }],
    ["non-positive brake", { brake: 0 }],
    ["non-positive steerRate", { steerRate: 0 }],
  ];

  it.each(cases)("throws RangeError for %s", (_label, overrides) => {
    const variant: CarVariant = { ...sedanCarVariant, ...overrides };
    expect(() => validateCarVariant(variant)).toThrow(RangeError);
  });

  it("throws for a degenerate front axle (fl == fr)", () => {
    const variant: CarVariant = {
      ...sedanCarVariant,
      wheels: { ...sedanCarVariant.wheels, fl: sedanCarVariant.wheels.fr },
    };
    expect(() => validateCarVariant(variant)).toThrow(RangeError);
  });

  it("throws for a degenerate rear axle (rl == rr)", () => {
    const variant: CarVariant = {
      ...sedanCarVariant,
      wheels: { ...sedanCarVariant.wheels, rl: sedanCarVariant.wheels.rr },
    };
    expect(() => validateCarVariant(variant)).toThrow(RangeError);
  });

  it("throws for a degenerate wheelbase (front axle == rear axle)", () => {
    const variant: CarVariant = {
      ...sedanCarVariant,
      wheels: {
        fl: sedanCarVariant.wheels.rl,
        fr: sedanCarVariant.wheels.rr,
        rl: sedanCarVariant.wheels.rl,
        rr: sedanCarVariant.wheels.rr,
      },
    };
    expect(() => validateCarVariant(variant)).toThrow(RangeError);
  });
});

describe("validateTrailerVariant", () => {
  it("throws for non-positive bodyWidth", () => {
    expect(() => validateTrailerVariant({ ...caravanTrailerVariant, bodyWidth: 0 as Metres })).toThrow(RangeError);
  });

  it("throws for non-positive bodyLength", () => {
    expect(() => validateTrailerVariant({ ...caravanTrailerVariant, bodyLength: -1 as Metres })).toThrow(RangeError);
  });

  it("throws for a degenerate axle (l == r)", () => {
    const variant: TrailerVariant = {
      ...caravanTrailerVariant,
      axleWheels: { l: caravanTrailerVariant.axleWheels.r, r: caravanTrailerVariant.axleWheels.r },
    };
    expect(() => validateTrailerVariant(variant)).toThrow(RangeError);
  });

  it("throws for a degenerate trailer length (hitch == axle centre)", () => {
    const axleCentre = { x: -1.0, y: 0 };
    const variant: TrailerVariant = {
      ...caravanTrailerVariant,
      hitch: axleCentre,
      axleWheels: { l: { x: -1.0, y: 0.7 }, r: { x: -1.0, y: -0.7 } },
    };
    expect(() => validateTrailerVariant(variant)).toThrow(RangeError);
  });
});
