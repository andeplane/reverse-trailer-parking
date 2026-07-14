import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import type { Seconds } from "../../engine/math/units";
import type { ControlInput } from "../../engine/input/input-source";
import { createVariantCatalog } from "./variants";
import type { CarSpawn } from "./vehicle-types";
import { createInitialRig, createWorld, stepWorld } from "./world";

const catalog = createVariantCatalog();
const DT = (1 / 60) as Seconds;

describe("createWorld", () => {
  it("builds a world from spawns with exactly one drivable car", () => {
    const cars: CarSpawn[] = [
      { variantId: "sedan", role: "drivable", position: { x: 0, y: 0 }, heading: 0 as Radians },
      { variantId: "sedan", role: "placed", position: { x: 10, y: 0 }, heading: 0 as Radians },
    ];
    const world = createWorld({ cars, boundary: [], catalog });
    expect(world.cars).toHaveLength(2);
  });

  it("spawns a trailer in line with the car heading", () => {
    const cars: CarSpawn[] = [
      {
        variantId: "sedan",
        role: "drivable",
        position: { x: 0, y: 0 },
        heading: 0.5 as Radians,
        trailerVariantId: "caravan",
      },
    ];
    const world = createWorld({ cars, boundary: [], catalog });
    expect(world.cars[0]?.trailer).toEqual({ variantId: "caravan", heading: 0.5 });
  });

  it("throws if no car is drivable", () => {
    const cars: CarSpawn[] = [{ variantId: "sedan", role: "placed", position: { x: 0, y: 0 }, heading: 0 as Radians }];
    expect(() => createWorld({ cars, boundary: [], catalog })).toThrow(RangeError);
  });

  it("throws if more than one car is drivable", () => {
    const cars: CarSpawn[] = [
      { variantId: "sedan", role: "drivable", position: { x: 0, y: 0 }, heading: 0 as Radians },
      { variantId: "sedan", role: "drivable", position: { x: 5, y: 0 }, heading: 0 as Radians },
    ];
    expect(() => createWorld({ cars, boundary: [], catalog })).toThrow(RangeError);
  });
});

describe("createInitialRig", () => {
  it("creates a drivable rig at rest with defaults", () => {
    const rig = createInitialRig({ variantId: "sedan" });
    expect(rig.car.role).toBe("drivable");
    expect(rig.car.speed).toBe(0);
    expect(rig.car.rearAxle).toEqual({ x: 0, y: 0 });
    expect(rig.trailer).toBeNull();
  });

  it("creates a trailer in line (ψ=0) when a trailerVariantId is given", () => {
    const rig = createInitialRig({ variantId: "sedan", trailerVariantId: "caravan", heading: 0.3 as Radians });
    expect(rig.trailer).toEqual({ variantId: "caravan", heading: 0.3 });
  });
});

describe("stepWorld", () => {
  function twoCarWorld() {
    const cars: CarSpawn[] = [
      { variantId: "sedan", role: "placed", position: { x: 20, y: 0 }, heading: 0 as Radians },
      { variantId: "sedan", role: "drivable", position: { x: 0, y: 0 }, heading: 0 as Radians },
    ];
    return createWorld({ cars, boundary: [], catalog });
  }

  it("advances only the drivable car, leaving placed cars unchanged", () => {
    const world = twoCarWorld();
    const input: ControlInput = { throttle: 1, steer: 0 };
    const result = stepWorld({ world, input, dt: DT });

    const placed = result.cars.find((c) => c.role === "placed");
    const drivable = result.cars.find((c) => c.role === "drivable");
    expect(placed).toEqual(world.cars.find((c) => c.role === "placed"));
    expect(drivable?.speed).toBeGreaterThan(0);
  });

  it("is deterministic for identical (world, input, dt)", () => {
    const world = twoCarWorld();
    const input: ControlInput = { throttle: 0.6, steer: -0.4 };
    const a = stepWorld({ world, input, dt: DT });
    const b = stepWorld({ world, input, dt: DT });
    expect(a).toEqual(b);
  });

  it("does not mutate the input world", () => {
    const world = twoCarWorld();
    const before = JSON.parse(JSON.stringify(world));
    stepWorld({ world, input: { throttle: 1, steer: 1 }, dt: DT });
    expect(world).toEqual(before);
  });
});
