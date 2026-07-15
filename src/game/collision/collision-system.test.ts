import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import { obbMtv, type Obb } from "../../engine/math/obb";
import { createVariantCatalog } from "../vehicle/variants";
import { createInitialRig } from "../vehicle/world";
import type { Rig } from "../vehicle/vehicle-types";
import { lerpRig, obstacleFootprints, resolveRigCollision, rigFootprints } from "./collision-system";

const catalog = createVariantCatalog();

function wall(cx: number, cy: number, halfL: number, halfW: number): Obb {
  return { center: { x: cx, y: cy }, halfL, halfW, rotation: 0 as Radians };
}

function rigAt(x: number, heading = 0, withTrailer = true): Rig {
  return createInitialRig({
    variantId: "sedan",
    ...(withTrailer ? { trailerVariantId: "caravan" } : {}),
    position: { x, y: 0 },
    heading: heading as Radians,
  });
}

function anyOverlap(footprints: Obb[], obstacles: Obb[]): boolean {
  return footprints.some((f) => obstacles.some((o) => obbMtv(f, o) !== null));
}

describe("rigFootprints", () => {
  it("returns just the car OBB with no trailer", () => {
    expect(rigFootprints(rigAt(0, 0, false), catalog)).toHaveLength(1);
  });

  it("returns car + trailer OBBs when towing", () => {
    expect(rigFootprints(rigAt(0), catalog)).toHaveLength(2);
  });
});

describe("obstacleFootprints", () => {
  it("collects placed cars, their trailers, and boundary walls", () => {
    const boundary = [wall(0, 20, 1, 20)];
    const world = {
      cars: [
        createCar("drivable", 0),
        createCar("placed", 10),
        createCarWithTrailer("placed", -10),
      ],
      boundary,
      props: [], exit: null, bounds: { width: 100, height: 100 }, 
      catalog,
    };
    // placed car (1) + placed car + trailer (2) + boundary (1) = 4
    expect(obstacleFootprints(world)).toHaveLength(4);
  });

  it("is empty when there are no placed cars or walls", () => {
    const world = { cars: [createCar("drivable", 0)], boundary: [], props: [], exit: null, bounds: { width: 100, height: 100 }, catalog };
    expect(obstacleFootprints(world)).toHaveLength(0);
  });
});

function createCar(role: "placed" | "drivable", x: number) {
  const rig = createInitialRig({ variantId: "sedan", position: { x, y: 0 }, heading: 0 as Radians });
  return { ...rig.car, role };
}
function createCarWithTrailer(role: "placed" | "drivable", x: number) {
  const rig = createInitialRig({
    variantId: "sedan",
    trailerVariantId: "caravan",
    position: { x, y: 0 },
    heading: 0 as Radians,
  });
  return { ...rig.car, role };
}

describe("lerpRig", () => {
  it("returns pose a at t=0 and pose b at t=1", () => {
    const a = rigAt(0);
    const b = rigAt(4);
    expect(lerpRig(a, b, 0, catalog).car.rearAxle.x).toBeCloseTo(0);
    expect(lerpRig(a, b, 1, catalog).car.rearAxle.x).toBeCloseTo(4);
  });

  it("interpolates the rear axle linearly at the midpoint", () => {
    expect(lerpRig(rigAt(0), rigAt(4), 0.5, catalog).car.rearAxle.x).toBeCloseTo(2);
  });

  it("interpolates heading by the shortest arc across the ±π wrap", () => {
    const a = rigAt(0, 3.0);
    const b = rigAt(0, -3.0);
    // shortest arc from 3.0 to -3.0 passes through ±π, not through 0.
    const mid = lerpRig(a, b, 0.5, catalog).car.heading;
    expect(Math.abs(mid)).toBeGreaterThan(3.0);
  });
});

describe("resolveRigCollision", () => {
  const frontWall = [wall(6, 0, 0.5, 6)]; // spans x 5.5..6.5, y -6..6

  it("passes the swept rig through untouched when there are no obstacles", () => {
    const result = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(1), obstacles: [], catalog });
    expect(result.contacted).toBe(false);
    expect(result.rig.car.rearAxle.x).toBeCloseTo(1);
  });

  it("passes through when the swept rig stays clear of obstacles", () => {
    const result = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(1), obstacles: frontWall, catalog });
    expect(result.contacted).toBe(false);
    expect(result.rig.car.rearAxle.x).toBeCloseTo(1);
  });

  it("blocks at contact when the swept rig would overlap a wall", () => {
    const prev = rigAt(0);
    const swept = rigAt(4); // car front would be well past the wall
    const result = resolveRigCollision({ prevRig: prev, sweptRig: swept, obstacles: frontWall, catalog });
    expect(result.contacted).toBe(true);
    expect(result.rig.car.rearAxle.x).toBeGreaterThan(0);
    expect(result.rig.car.rearAxle.x).toBeLessThan(4);
    expect(anyOverlap(rigFootprints(result.rig, catalog), frontWall)).toBe(false);
  });

  it("does not tunnel through the wall even for a large single step", () => {
    const prev = rigAt(0);
    const swept = rigAt(30); // far past the wall in one jump
    const result = resolveRigCollision({ prevRig: prev, sweptRig: swept, obstacles: frontWall, catalog });
    expect(result.contacted).toBe(true);
    expect(anyOverlap(rigFootprints(result.rig, catalog), frontWall)).toBe(false);
    // The car must remain on the near side of the wall (front edge below the wall's near face).
    expect(result.rig.car.rearAxle.x).toBeLessThan(6);
  });

  it("blocks the trailer when reversing it into a wall behind the rig", () => {
    const rearWall = [wall(-9, 0, 0.5, 6)]; // behind the in-line trailer
    const prev = rigAt(0);
    const swept = rigAt(-8); // reverse hard toward the wall
    const result = resolveRigCollision({ prevRig: prev, sweptRig: swept, obstacles: rearWall, catalog });
    expect(result.contacted).toBe(true);
    expect(anyOverlap(rigFootprints(result.rig, catalog), rearWall)).toBe(false);
  });

  it("keeps the rig clear when wedged between two placed obstacles", () => {
    const walls = [wall(6, 0, 0.5, 6), wall(-9, 0, 0.5, 6)];
    const result = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(4), obstacles: walls, catalog });
    expect(anyOverlap(rigFootprints(result.rig, catalog), walls)).toBe(false);
  });

  it("is deterministic for identical inputs", () => {
    const a = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(4), obstacles: frontWall, catalog });
    const b = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(4), obstacles: frontWall, catalog });
    expect(a.rig).toEqual(b.rig);
  });

  it("produces only finite pose values", () => {
    const result = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(4), obstacles: frontWall, catalog });
    expect(Number.isFinite(result.rig.car.rearAxle.x)).toBe(true);
    expect(Number.isFinite(result.rig.car.rearAxle.y)).toBe(true);
    expect(Number.isFinite(result.rig.car.heading)).toBe(true);
    expect(Number.isFinite(result.rig.trailer?.heading ?? 0)).toBe(true);
  });

  it("slides along a wall approached at an angle instead of dead-stopping", () => {
    // Approach the front wall at a shallow angle: some tangential (y) motion should survive.
    const prev = rigAt(0, 0, false);
    const swept = createInitialRig({ variantId: "sedan", position: { x: 5, y: 2 }, heading: 0 as Radians });
    const result = resolveRigCollision({ prevRig: prev, sweptRig: swept, obstacles: frontWall, catalog });
    expect(result.contacted).toBe(true);
    expect(anyOverlap(rigFootprints(result.rig, catalog), frontWall)).toBe(false);
    // Blocked in x (can't reach x=5) but slid in y toward the target.
    expect(result.rig.car.rearAxle.x).toBeLessThan(5);
    expect(result.rig.car.rearAxle.y).toBeGreaterThan(0.2);
  });

  it("does not slide sideways for a head-on perpendicular approach", () => {
    const result = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(4), obstacles: frontWall, catalog });
    expect(result.rig.car.rearAxle.y).toBeCloseTo(0);
  });

  it("pushes out of a residual overlap when the previous pose already touches", () => {
    // prev's front bumper (x≈3.6) pokes ~0.6m into the wall front (x=3.0) → resolver must clear it.
    const overlappingWall = [wall(3.5, 0, 0.5, 6)];
    expect(anyOverlap(rigFootprints(rigAt(0), catalog), overlappingWall)).toBe(true);
    const result = resolveRigCollision({
      prevRig: rigAt(0),
      sweptRig: rigAt(0.1),
      obstacles: overlappingWall,
      catalog,
    });
    expect(result.contacted).toBe(true);
    expect(anyOverlap(rigFootprints(result.rig, catalog), overlappingWall)).toBe(false);
  });
});
