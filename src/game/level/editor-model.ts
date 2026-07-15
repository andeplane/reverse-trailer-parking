import type { Radians } from "../../engine/math/angles";
import type { MPerS } from "../../engine/math/units";
import type { Obb } from "../../engine/math/obb";
import { rotate, sub, type Vec2 } from "../../engine/math/vec2";
import { carFootprint } from "../vehicle/vehicle-geometry";
import { findCarVariant, type CarState, type VariantCatalog } from "../vehicle/vehicle-types";
import type { ExitLine, Level, LevelCar, LevelProp } from "./level-types";

/** A blank level to start authoring from: a drivable rig, no obstacles, exit on the right edge. */
export function emptyLevel(id: string): Level {
  const width = 44;
  const height = 32;
  return {
    id,
    name: "New level",
    size: { width, height },
    drivable: { variantId: "sedan", position: { x: -width / 2 + 8, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [],
    props: [],
    exit: { a: { x: width / 2, y: -3.5 }, b: { x: width / 2, y: 3.5 }, outward: { x: 1, y: 0 } },
  };
}

/** True if a world point lies within an oriented box. */
export function pointInObb(p: Vec2, obb: Obb): boolean {
  const local = rotate(sub(p, obb.center), -obb.rotation as Radians);
  return Math.abs(local.x) <= obb.halfL && Math.abs(local.y) <= obb.halfW;
}

/** Visual (body-sized) footprint of a level car — used for editor hit-testing/selection. */
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
  return { center: footprint.center, halfW: variant.bodyWidth / 2, halfL: variant.bodyLength / 2, rotation: footprint.rotation };
}

export function propObb(prop: LevelProp): Obb {
  return {
    center: prop.position,
    halfW: prop.size.width / 2,
    halfL: prop.size.length / 2,
    rotation: prop.rotation as Radians,
  };
}

export type EditorHit = { kind: "drivable" } | { kind: "placed"; index: number } | { kind: "prop"; index: number };

/** Topmost object at a world point: props (last placed first), then placed cars, then the drivable. */
export function hitTest(level: Level, p: Vec2, catalog: VariantCatalog): EditorHit | null {
  for (let i = level.props.length - 1; i >= 0; i--) {
    if (pointInObb(p, propObb(level.props[i]!))) return { kind: "prop", index: i };
  }
  for (let i = level.placedCars.length - 1; i >= 0; i--) {
    if (pointInObb(p, levelCarObb(level.placedCars[i]!, catalog))) return { kind: "placed", index: i };
  }
  if (pointInObb(p, levelCarObb(level.drivable, catalog))) return { kind: "drivable" };
  return null;
}

/** Axis-aligned rect (centre + size) from two dragged corners, with a small minimum size. */
export function rectFromDrag(a: Vec2, b: Vec2): { position: Vec2; size: { width: number; length: number } } {
  const minSize = 0.5;
  return {
    position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    size: {
      width: Math.max(minSize, Math.abs(b.y - a.y)),
      length: Math.max(minSize, Math.abs(b.x - a.x)),
    },
  };
}

/** Snaps a dragged exit segment to the nearest playfield edge and derives the outward normal. */
export function snapExitToEdge(a: Vec2, b: Vec2, size: { width: number; height: number }): ExitLine {
  const hw = size.width / 2;
  const hh = size.height / 2;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const edges = [
    { d: Math.abs(mid.y - hh), pin: { axis: "y" as const, at: hh }, outward: { x: 0, y: 1 } },
    { d: Math.abs(mid.y + hh), pin: { axis: "y" as const, at: -hh }, outward: { x: 0, y: -1 } },
    { d: Math.abs(mid.x + hw), pin: { axis: "x" as const, at: -hw }, outward: { x: -1, y: 0 } },
    { d: Math.abs(mid.x - hw), pin: { axis: "x" as const, at: hw }, outward: { x: 1, y: 0 } },
  ];
  const best = edges.reduce((m, e) => (e.d < m.d ? e : m));
  const clampT = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  if (best.pin.axis === "y") {
    return {
      a: { x: clampT(a.x, -hw, hw), y: best.pin.at },
      b: { x: clampT(b.x, -hw, hw), y: best.pin.at },
      outward: best.outward,
    };
  }
  return {
    a: { x: best.pin.at, y: clampT(a.y, -hh, hh) },
    b: { x: best.pin.at, y: clampT(b.y, -hh, hh) },
    outward: best.outward,
  };
}
