import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import type { MPerS } from "../../engine/math/units";
import { createVariantCatalog } from "./variants";
import {
  drivableCar,
  findCarVariant,
  findTrailerVariant,
  fromRig,
  placedCars,
  toRig,
  type CarState,
  type World,
} from "./vehicle-types";

function makeCar(role: "placed" | "drivable"): CarState {
  return {
    variantId: "sedan",
    role,
    rearAxle: { x: 0, y: 0 },
    heading: 0 as Radians,
    speed: 0 as MPerS,
    steer: 0 as Radians,
    trailer: null,
  };
}

describe("catalog lookups", () => {
  const catalog = createVariantCatalog();

  it("finds a known car variant", () => {
    expect(findCarVariant(catalog, "sedan").id).toBe("sedan");
  });

  it("throws for an unknown car variant", () => {
    expect(() => findCarVariant(catalog, "nope")).toThrow(RangeError);
  });

  it("finds a known trailer variant", () => {
    expect(findTrailerVariant(catalog, "caravan").id).toBe("caravan");
  });

  it("throws for an unknown trailer variant", () => {
    expect(() => findTrailerVariant(catalog, "nope")).toThrow(RangeError);
  });
});

describe("world helpers", () => {
  const catalog = createVariantCatalog();

  it("finds the drivable car", () => {
    const world: World = { cars: [makeCar("placed"), makeCar("drivable")], boundary: [], props: [], exit: null, bounds: { width: 100, height: 100 }, catalog };
    expect(drivableCar(world).role).toBe("drivable");
  });

  it("throws when no car is drivable", () => {
    const world: World = { cars: [makeCar("placed")], boundary: [], props: [], exit: null, bounds: { width: 100, height: 100 }, catalog };
    expect(() => drivableCar(world)).toThrow(RangeError);
  });

  it("returns only placed cars", () => {
    const world: World = { cars: [makeCar("placed"), makeCar("drivable")], boundary: [], props: [], exit: null, bounds: { width: 100, height: 100 }, catalog };
    expect(placedCars(world)).toHaveLength(1);
    expect(placedCars(world)[0]?.role).toBe("placed");
  });
});

describe("Rig <-> CarState conversion", () => {
  it("round-trips a car with no trailer", () => {
    const car = makeCar("drivable");
    const rig = toRig(car);
    expect(rig.trailer).toBeNull();
    expect(fromRig(rig)).toEqual(car);
  });

  it("round-trips a car with a trailer", () => {
    const car = { ...makeCar("drivable"), trailer: { variantId: "caravan", heading: 0 as Radians } };
    const rig = toRig(car);
    expect(rig.trailer).toEqual(car.trailer);
    expect(fromRig(rig)).toEqual(car);
  });
});
