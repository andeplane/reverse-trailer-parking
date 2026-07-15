import { describe, expect, it } from "vitest";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import { drivableCar } from "../vehicle/vehicle-types";
import type { Level } from "./level-types";
import { levelToWorld } from "./level-to-world";
import {
  applyDebugState,
  debugStateOf,
  encodeDebugState,
  parseDebugState,
  type DebugState,
} from "./debug-state";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

const level: Level = {
  id: "lot-1",
  name: "Lot",
  size: { width: 40, height: 30 },
  drivable: { variantId: "sedan", position: { x: -5, y: 2 }, heading: 0, trailerVariantId: "caravan" },
  placedCars: [],
  props: [],
  exit: { a: { x: 20, y: -3 }, b: { x: 20, y: 3 }, outward: { x: 1, y: 0 } },
};

const state: DebugState = { levelId: "lot-1", x: 3.5, y: -1.25, heading: 0.4, speed: 2, steer: -0.3, trailerHeading: 0.1 };

describe("encode/parse round-trip", () => {
  it("round-trips a full debug state through the URL", () => {
    expect(parseDebugState(encodeDebugState(state))).toEqual(state);
  });

  it("round-trips a state without a trailer", () => {
    const noTrailer = { ...state, trailerHeading: null };
    expect(parseDebugState(encodeDebugState(noTrailer))).toEqual(noTrailer);
  });

  it("returns null when the dbg marker is absent", () => {
    expect(parseDebugState("?x=1&y=2")).toBeNull();
  });

  it("returns null when a required field is missing or non-numeric", () => {
    expect(parseDebugState("?dbg=lot-1&x=1&y=2&h=3&v=4")).toBeNull(); // no steer
    expect(parseDebugState("?dbg=lot-1&x=abc&y=2&h=3&v=4&s=5")).toBeNull();
  });
});

describe("debugStateOf", () => {
  it("captures the drivable rig's rounded state", () => {
    const world = levelToWorld(level, catalog);
    const s = debugStateOf(world, "lot-1");
    expect(s.levelId).toBe("lot-1");
    expect(s.x).toBeCloseTo(-5);
    expect(s.y).toBeCloseTo(2);
    expect(s.trailerHeading).toBe(0);
  });
});

describe("applyDebugState", () => {
  it("moves the drivable rig to the encoded state, leaving placed cars alone", () => {
    const world = levelToWorld(
      { ...level, placedCars: [{ variantId: "suv", position: { x: 10, y: 0 }, heading: 0 }] },
      catalog,
    );
    const applied = applyDebugState(world, state);
    const car = drivableCar(applied);
    expect(car.rearAxle).toEqual({ x: 3.5, y: -1.25 });
    expect(car.heading).toBeCloseTo(0.4);
    expect(car.speed).toBeCloseTo(2);
    expect(car.steer).toBeCloseTo(-0.3);
    expect(car.trailer?.heading).toBeCloseTo(0.1);
    expect(applied.cars.find((c) => c.role === "placed")?.rearAxle).toEqual({ x: 10, y: 0 });
  });

  it("is a no-op round-trip: applying debugStateOf reproduces the same state", () => {
    const world = levelToWorld(level, catalog);
    const reproduced = debugStateOf(applyDebugState(world, state), "lot-1");
    expect(reproduced).toEqual(state);
  });
});
