import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import type { Obb } from "../../engine/math/obb";
import { rigFootprints } from "../collision/collision-system";
import { jitterStartHitch, MAX_START_HITCH_JITTER } from "./start-jitter";
import { createVariantCatalog } from "./variants";
import { drivableCar, toRig, type CarSpawn, type World } from "./vehicle-types";
import { createWorld } from "./world";

const catalog = createVariantCatalog();

function worldWith(args: { trailer?: boolean; boundary?: Obb[] } = {}): World {
  const car: CarSpawn = {
    variantId: "sedan",
    role: "drivable",
    position: { x: 0, y: 0 },
    heading: 0 as Radians,
    ...(args.trailer === false ? {} : { trailerVariantId: "caravan" }),
  };
  return createWorld({ cars: [car], boundary: args.boundary ?? [], catalog });
}

/** The trailer's own footprint in a world, i.e. the second of the rig's two OBBs. */
function trailerFootprint(world: World): Obb {
  const obb = rigFootprints(toRig(drivableCar(world)), catalog)[1];
  if (!obb) throw new Error("expected a towed trailer");
  return obb;
}

describe("jitterStartHitch", () => {
  it("folds the trailer off the car by the rolled angle, leaving the car untouched", () => {
    const world = jitterStartHitch({ world: worldWith(), random: () => 1 });
    const car = drivableCar(world);
    expect(car.heading).toBe(0);
    expect(car.trailer?.heading).toBeCloseTo(MAX_START_HITCH_JITTER, 12);
  });

  it("rolls the other way for the low end of the range", () => {
    const world = jitterStartHitch({ world: worldWith(), random: () => 0 });
    expect(drivableCar(world).trailer?.heading).toBeCloseTo(-MAX_START_HITCH_JITTER, 12);
  });

  it("never exceeds ±3°, whatever the roll", () => {
    const rolls = [0, 0.1, 0.37, 0.5, 0.62, 0.99, 1];
    expect(MAX_START_HITCH_JITTER).toBeCloseTo((3 * Math.PI) / 180, 12);
    for (const roll of rolls) {
      const heading = drivableCar(jitterStartHitch({ world: worldWith(), random: () => roll })).trailer?.heading ?? 0;
      expect(Math.abs(heading)).toBeLessThanOrEqual(MAX_START_HITCH_JITTER + 1e-12);
    }
  });

  it("defaults to Math.random, staying inside the range over many rolls", () => {
    for (let i = 0; i < 50; i++) {
      const heading = drivableCar(jitterStartHitch({ world: worldWith() })).trailer?.heading ?? 0;
      expect(Math.abs(heading)).toBeLessThanOrEqual(MAX_START_HITCH_JITTER + 1e-12);
    }
  });

  it("leaves a car with no trailer alone", () => {
    const world = worldWith({ trailer: false });
    expect(jitterStartHitch({ world, random: () => 1 })).toBe(world);
  });

  it("folds the other way when the rolled side would start the trailer inside a wall", () => {
    // A thin strip just under the straight trailer: folding +3° dips its tail into the strip,
    // while folding −3° swings the whole box up and away from it.
    const straight = trailerFootprint(worldWith());
    const wall: Obb = {
      center: { x: straight.center.x, y: -(straight.halfW + 0.05) },
      halfL: straight.halfL * 2,
      halfW: 0.02,
      rotation: 0 as Radians,
    };
    const world = jitterStartHitch({ world: worldWith({ boundary: [wall] }), random: () => 1 });
    expect(drivableCar(world).trailer?.heading).toBeCloseTo(-MAX_START_HITCH_JITTER, 12);
  });

  it("starts dead straight rather than in a collision when neither side is clear", () => {
    const straight = trailerFootprint(worldWith());
    const blocked = worldWith({
      boundary: [{ center: straight.center, halfL: 50, halfW: 50, rotation: 0 as Radians }],
    });
    expect(jitterStartHitch({ world: blocked, random: () => 1 })).toBe(blocked);
  });
});
