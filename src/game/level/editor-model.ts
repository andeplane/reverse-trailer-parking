import type { Radians } from "../../engine/math/angles";
import type { MPerS } from "../../engine/math/units";
import { obbMtv, type Obb } from "../../engine/math/obb";
import { rotate, sub, type Vec2 } from "../../engine/math/vec2";
import { carFootprint } from "../vehicle/vehicle-geometry";
import { findCarVariant, type CarState, type VariantCatalog } from "../vehicle/vehicle-types";
import type { ExitLine, Level, LevelCar } from "./level-types";
import { filledGrid, gridHeight, gridWidth } from "./tile-types";

/** A blank level to start authoring from: an all-asphalt grid, a drivable rig, exit on the right. */
export function emptyLevel(id: string): Level {
  const grid = filledGrid(16, 12, 4, "asphalt");
  const hw = gridWidth(grid) / 2;
  return {
    id,
    name: "New level",
    grid,
    drivable: { variantId: "sedan", position: { x: -hw + 10, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [],
    exit: { a: { x: hw, y: -3.5 }, b: { x: hw, y: 3.5 }, outward: { x: 1, y: 0 } },
  };
}

/** True if a world point lies within an oriented box. */
export function pointInObb(p: Vec2, obb: Obb): boolean {
  const local = rotate(sub(p, obb.center), -obb.rotation as Radians);
  return Math.abs(local.x) <= obb.halfL && Math.abs(local.y) <= obb.halfW;
}

/** Visual (body-sized) footprint of a level car — used for editor hit-testing/overlap. */
export function levelCarObb(car: LevelCar, catalog: VariantCatalog): Obb {
  const variant = findCarVariant(catalog, car.variantId);
  const state: CarState = {
    variantId: car.variantId,
    role: "placed",
    rearAxle: car.position,
    heading: car.heading as Radians,
    speed: 0 as MPerS,
    steer: 0 as Radians,
    trailer: null,
  };
  const footprint = carFootprint(state, variant);
  return {
    center: footprint.center,
    halfW: variant.bodyWidth / 2,
    halfL: variant.bodyLength / 2,
    rotation: footprint.rotation,
  };
}

export type EditorHit = { kind: "drivable" } | { kind: "placed"; index: number };

/** Topmost car at a world point: placed cars (last placed first), then the drivable. */
export function carAt(level: Level, p: Vec2, catalog: VariantCatalog): EditorHit | null {
  for (let i = level.placedCars.length - 1; i >= 0; i--) {
    if (pointInObb(p, levelCarObb(level.placedCars[i]!, catalog))) return { kind: "placed", index: i };
  }
  if (pointInObb(p, levelCarObb(level.drivable, catalog))) return { kind: "drivable" };
  return null;
}

/** True if a candidate car footprint overlaps any existing car (ignoring the given index). */
export function carOverlaps(level: Level, candidate: LevelCar, catalog: VariantCatalog, ignore?: EditorHit): boolean {
  const candObb = levelCarObb(candidate, catalog);
  const cars: Array<{ car: LevelCar; hit: EditorHit }> = [
    { car: level.drivable, hit: { kind: "drivable" } },
    ...level.placedCars.map((car, index) => ({ car, hit: { kind: "placed" as const, index } })),
  ];
  for (const { car, hit } of cars) {
    if (ignore && hit.kind === ignore.kind && (hit.kind !== "placed" || hit.index === (ignore as { index: number }).index)) {
      continue;
    }
    if (obbMtv(candObb, levelCarObb(car, catalog)) !== null) return true;
  }
  return false;
}

/** A fixed-width exit gate centred at the cursor's projection onto the nearest playfield edge. */
export function exitGateAt(p: Vec2, grid: Level["grid"], width = 8): ExitLine {
  const half = width / 2;
  if (grid.tileSize > 0) {
    return snapExitToEdge({ x: p.x - half, y: p.y - half }, { x: p.x + half, y: p.y + half }, grid);
  }
  return snapExitToEdge(p, p, grid);
}

/** Snaps a dragged exit segment to the nearest playfield edge and derives the outward normal. */
export function snapExitToEdge(a: Vec2, b: Vec2, grid: Level["grid"]): ExitLine {
  const hw = gridWidth(grid) / 2;
  const hh = gridHeight(grid) / 2;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const edges = [
    { d: Math.abs(mid.y - hh), pin: { axis: "y" as const, at: hh }, outward: { x: 0, y: 1 } },
    { d: Math.abs(mid.y + hh), pin: { axis: "y" as const, at: -hh }, outward: { x: 0, y: -1 } },
    { d: Math.abs(mid.x + hw), pin: { axis: "x" as const, at: -hw }, outward: { x: -1, y: 0 } },
    { d: Math.abs(mid.x - hw), pin: { axis: "x" as const, at: hw }, outward: { x: 1, y: 0 } },
  ];
  const best = edges.reduce((m, e) => (e.d < m.d ? e : m));
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  if (best.pin.axis === "y") {
    return {
      a: { x: clamp(a.x, -hw, hw), y: best.pin.at },
      b: { x: clamp(b.x, -hw, hw), y: best.pin.at },
      outward: best.outward,
    };
  }
  return {
    a: { x: best.pin.at, y: clamp(a.y, -hh, hh) },
    b: { x: best.pin.at, y: clamp(b.y, -hh, hh) },
    outward: best.outward,
  };
}
