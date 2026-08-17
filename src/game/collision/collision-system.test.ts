import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import type { MPerS } from "../../engine/math/units";
import type { Vec2 } from "../../engine/math/vec2";
import { obbMtv, type Obb } from "../../engine/math/obb";
import { createVariantCatalog } from "../vehicle/variants";
import { filledGrid } from "../level/tile-types";
import { createInitialRig } from "../vehicle/world";
import type { Rig } from "../vehicle/vehicle-types";
import {
  lerpRig,
  obstacleFootprints,
  resolveRigCollision,
  rigFootprints,
  type Obstacle,
} from "./collision-system";

const catalog = createVariantCatalog();
const TILE_GRID = filledGrid(4, 4, 5);

function wallObb(cx: number, cy: number, halfL: number, halfW: number): Obb {
  return { center: { x: cx, y: cy }, halfL, halfW, rotation: 0 as Radians };
}

/** A solid obstacle (a wall) — the default thing to crash into. */
function wall(cx: number, cy: number, halfL: number, halfW: number): Obstacle {
  return { obb: wallObb(cx, cy, halfL, halfW), kind: "solid" };
}

/** The same strip, but a low kerb: collidable all the same, far cheaper to clip. */
function curb(cx: number, cy: number, halfL: number, halfW: number): Obstacle {
  return { obb: wallObb(cx, cy, halfL, halfW), kind: "curb" };
}

function rigAt(x: number, heading = 0, withTrailer = true): Rig {
  return createInitialRig({
    variantId: "sedan",
    ...(withTrailer ? { trailerVariantId: "caravan" } : {}),
    position: { x, y: 0 },
    heading: heading as Radians,
  });
}

function anyOverlap(footprints: Obb[], obstacles: Obstacle[]): boolean {
  return footprints.some((f) => obstacles.some((o) => obbMtv(f, o.obb) !== null));
}

/**
 * A rig at `from` plus the pose it reaches by *rolling* `distance` along its own heading — the
 * only motion the wheels can produce, and so the only kind the resolver has to make sense of.
 */
function roll(args: { from: Vec2; heading: number; distance: number }): { prev: Rig; swept: Rig } {
  const { from, heading, distance } = args;
  const at = (p: Vec2): Rig =>
    createInitialRig({ variantId: "sedan", position: p, heading: heading as Radians });
  return {
    prev: at(from),
    swept: at({ x: from.x + Math.cos(heading) * distance, y: from.y + Math.sin(heading) * distance }),
  };
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
    const boundary = [wallObb(0, 20, 1, 20)];
    const world = {
      cars: [
        createCar("drivable", 0),
        createCar("placed", 10),
        createCarWithTrailer("placed", -10),
      ],
      boundary,
      solids: [], curbs: [], grid: TILE_GRID, exit: null, bounds: { width: 100, height: 100 },
      catalog,
      damage: 0,
      rigInContact: false,
      rigJackknifed: false,
    };
    // placed car (1) + placed car + trailer (2) + boundary (1) = 4
    expect(obstacleFootprints(world)).toHaveLength(4);
  });

  it("is empty when there are no placed cars or walls", () => {
    const world = { cars: [createCar("drivable", 0)], boundary: [], solids: [], curbs: [], grid: TILE_GRID, exit: null, bounds: { width: 100, height: 100 }, catalog, damage: 0, rigInContact: false, rigJackknifed: false };
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

  it("slides along a wall on a genuinely shallow (grazing) approach instead of dead-stopping", () => {
    // Rolling 15° off the wall face — a scrape, so the along-surface part of the roll survives.
    const { prev, swept } = roll({ from: { x: 3.5, y: -6 }, heading: Math.PI / 2 - 0.26, distance: 6 });
    const result = resolveRigCollision({ prevRig: prev, sweptRig: swept, obstacles: frontWall, catalog });
    expect(result.contacted).toBe(true);
    expect(anyOverlap(rigFootprints(result.rig, catalog), frontWall)).toBe(false);
    // Blocked in x by the wall, but carried well along it in y.
    expect(result.rig.car.rearAxle.x).toBeLessThan(swept.car.rearAxle.x);
    expect(result.rig.car.rearAxle.y).toBeGreaterThan(-3);
  });

  it("binds at a mid-angle (45°) approach — wheels cannot carry the body along the wall", () => {
    const { prev, swept } = roll({ from: { x: 0, y: -4 }, heading: Math.PI / 4, distance: 8 });
    const result = resolveRigCollision({ prevRig: prev, sweptRig: swept, obstacles: frontWall, catalog });
    expect(result.contacted).toBe(true);
    expect(anyOverlap(rigFootprints(result.rig, catalog), frontWall)).toBe(false);
    // It stops where it met the wall — no crabbing on along it (its own contact-pose y, ±ε).
    const blockedY = result.rig.car.rearAxle.y;
    const blockedX = result.rig.car.rearAxle.x;
    expect(blockedY + 4).toBeCloseTo(blockedX, 1); // still on its own 45° line: y+4 === x
  });

  it("reports what was hit, so damage can price a kerb differently from a wall", () => {
    const wallHit = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(4), obstacles: frontWall, catalog });
    expect(wallHit.contactKind).toBe("solid");

    const kerb = [curb(6, 0, 0.5, 6)];
    const kerbHit = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(4), obstacles: kerb, catalog });
    expect(kerbHit.contacted).toBe(true); // a kerb still stops the rig...
    expect(kerbHit.contactKind).toBe("curb"); // ...it just costs less
  });

  it("reports the kind of the deepest contact when a kerb and a wall are both touched", () => {
    const obstacles = [curb(3.4, 0, 0.5, 6), wall(6, 0, 0.5, 6)];
    const result = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(4), obstacles, catalog });
    expect(result.contactKind).toBe("curb"); // the kerb is what the car reaches first
  });

  it("scrubs off the speed a blocked step never got to use", () => {
    const prev = { ...rigAt(0), car: { ...rigAt(0).car, speed: 5 as MPerS } };
    const swept = { ...rigAt(4), car: { ...rigAt(4).car, speed: 5 as MPerS } };
    const result = resolveRigCollision({ prevRig: prev, sweptRig: swept, obstacles: frontWall, catalog });
    expect(result.contacted).toBe(true);
    // Only part of the 4 m step happened, so only that part of the speed survives.
    expect(result.rig.car.speed).toBeLessThan(5);
    expect(result.rig.car.speed).toBeGreaterThanOrEqual(0);
  });

  it("does not slide sideways for a head-on perpendicular approach", () => {
    const result = resolveRigCollision({ prevRig: rigAt(0), sweptRig: rigAt(4), obstacles: frontWall, catalog });
    expect(result.rig.car.rearAxle.y).toBeCloseTo(0);
  });

  it("binds (no sideways creep) when pressed steeply into a wall — wheels cannot slide", () => {
    // Held throttle ~80° to the wall face (10° off head-on), frame after frame. Free travel
    // before first contact may add a little y, but once pressed the rig must stop crabbing.
    let rig = rigAt(0, 0, false);
    let yAtFrame10 = 0;
    for (let i = 0; i < 60; i++) {
      const attempt = createInitialRig({
        variantId: "sedan",
        position: { x: rig.car.rearAxle.x + 0.49, y: rig.car.rearAxle.y + 0.086 },
        heading: 0 as Radians,
      });
      rig = resolveRigCollision({ prevRig: rig, sweptRig: attempt, obstacles: frontWall, catalog }).rig;
      if (i === 9) yAtFrame10 = rig.car.rearAxle.y;
    }
    // Without grip binding this drifts ~+4.3 y over frames 10..60.
    expect(Math.abs(rig.car.rearAxle.y - yAtFrame10)).toBeLessThan(0.02);
    expect(Math.abs(rig.car.rearAxle.y)).toBeLessThan(0.45);
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
