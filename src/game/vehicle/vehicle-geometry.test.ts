import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import type { MPerS } from "../../engine/math/units";
import { caravanTrailerVariant, sedanCarVariant } from "./variants";
import type { CarState, TrailerState } from "./vehicle-types";
import {
  carFootprint,
  deriveCarGeometry,
  deriveTrailerGeometry,
  hitchWorld,
  trailerFootprint,
  trailerWheelWorldPositions,
  wheelWorldPositions,
} from "./vehicle-geometry";

function carAt(x: number, y: number, heading: number): CarState {
  return {
    variantId: "sedan",
    role: "drivable",
    rearAxle: { x, y },
    heading: heading as Radians,
    speed: 0 as MPerS,
    steer: 0 as Radians,
    trailer: null,
  };
}

describe("deriveCarGeometry (sedan)", () => {
  const geometry = deriveCarGeometry(sedanCarVariant);

  it("derives the correct wheelbase", () => {
    expect(geometry.wheelbase).toBeCloseTo(2.7);
  });

  it("derives the correct track width", () => {
    expect(geometry.trackWidth).toBeCloseTo(1.5);
  });

  it("derives the correct hitch offset (behind rear axle)", () => {
    expect(geometry.hitchOffset).toBeCloseTo(0.95);
  });

  it("derives axle centres consistent with the wheel coordinates", () => {
    expect(geometry.rearAxleCentre).toEqual({ x: -1.35, y: 0 });
    expect(geometry.frontAxleCentre).toEqual({ x: 1.35, y: 0 });
  });
});

describe("deriveTrailerGeometry (caravan)", () => {
  const geometry = deriveTrailerGeometry(caravanTrailerVariant);

  it("derives the correct trailer length", () => {
    expect(geometry.trailerLength).toBeCloseTo(3.1);
  });

  it("derives the axle centre consistent with the wheel coordinates", () => {
    expect(geometry.axleCentre).toEqual({ x: -0.9, y: 0 });
  });
});

describe("wheelWorldPositions", () => {
  it("places wheels relative to rearAxle at heading 0", () => {
    const car = carAt(10, 5, 0);
    const wheels = wheelWorldPositions(car, sedanCarVariant);
    expect(wheels.rl).toEqual({ x: 10, y: 5.75 });
    expect(wheels.rr).toEqual({ x: 10, y: 4.25 });
    expect(wheels.fl.x).toBeCloseTo(12.7);
    expect(wheels.fl.y).toBeCloseTo(5.75);
  });

  it("rotates wheels with heading π/2", () => {
    const car = carAt(0, 0, Math.PI / 2);
    const wheels = wheelWorldPositions(car, sedanCarVariant);
    // Forward (+x local) becomes +y world; left (+y local) becomes -x world.
    expect(wheels.fl.x).toBeCloseTo(-0.75);
    expect(wheels.fl.y).toBeCloseTo(2.7);
  });
});

describe("hitchWorld / carFootprint", () => {
  it("places the hitch behind the rear axle at heading 0", () => {
    const car = carAt(0, 0, 0);
    const hitch = hitchWorld(car, sedanCarVariant);
    expect(hitch.x).toBeCloseTo(-0.95);
    expect(hitch.y).toBeCloseTo(0);
  });

  it("centres the footprint on the body and matches heading", () => {
    const car = carAt(5, -3, Math.PI / 4);
    const footprint = carFootprint(car, sedanCarVariant);
    expect(footprint.halfW).toBeCloseTo(0.81); // collisionWidth 1.62 / 2 (excludes mirrors)
    expect(footprint.halfL).toBeCloseTo(2.25);
    expect(footprint.rotation).toBeCloseTo(Math.PI / 4);
  });
});

describe("trailerFootprint / trailerWheelWorldPositions", () => {
  it("places the trailer body behind the hitch when in line with the car", () => {
    const car = carAt(0, 0, 0);
    const hitch = hitchWorld(car, sedanCarVariant);
    const trailer: TrailerState = { variantId: "caravan", heading: 0 as Radians };
    const footprint = trailerFootprint(trailer, hitch, caravanTrailerVariant);
    // Trailer hitch local (2.2,0) sits at world hitch; body centre is 2.2m ahead of that along heading 0.
    expect(footprint.center.x).toBeCloseTo(hitch.x - 2.2);
    expect(footprint.center.y).toBeCloseTo(hitch.y);
    expect(footprint.rotation).toBeCloseTo(0);
  });

  it("derives trailer wheel positions consistent with the footprint centre", () => {
    const car = carAt(0, 0, 0);
    const hitch = hitchWorld(car, sedanCarVariant);
    const trailer: TrailerState = { variantId: "caravan", heading: 0 as Radians };
    const footprint = trailerFootprint(trailer, hitch, caravanTrailerVariant);
    const wheels = trailerWheelWorldPositions(trailer, hitch, caravanTrailerVariant);
    expect(wheels.l.x).toBeCloseTo(footprint.center.x - 0.9);
    expect(wheels.l.y).toBeCloseTo(0.75);
    expect(wheels.r.y).toBeCloseTo(-0.75);
  });

  it("rotates the trailer footprint by its own heading, independent of car heading", () => {
    const car = carAt(0, 0, 0);
    const hitch = hitchWorld(car, sedanCarVariant);
    const trailer: TrailerState = { variantId: "caravan", heading: (Math.PI / 2) as Radians };
    const footprint = trailerFootprint(trailer, hitch, caravanTrailerVariant);
    expect(footprint.rotation).toBeCloseTo(Math.PI / 2);
    // Trailer's local +x hitch offset now points along world +y, so body centre is below the hitch in y.
    expect(footprint.center.x).toBeCloseTo(hitch.x);
    expect(footprint.center.y).toBeCloseTo(hitch.y - 2.2);
  });
});
