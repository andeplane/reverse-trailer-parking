import { dot, normalise, perp, sub, type Vec2 } from "../../engine/math/vec2";
import { obbCorners, type Obb } from "../../engine/math/obb";
import type { ExitLine } from "./level-types";

/**
 * A default outward normal for an exit segment a–b: the unit perpendicular that points away from
 * `interiorRef` (typically the playfield centre), so "outside" is the far side of the line.
 */
export function outwardNormalAwayFrom(a: Vec2, b: Vec2, interiorRef: Vec2): Vec2 {
  const n = normalise(perp(sub(b, a)));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const toInterior = sub(interiorRef, mid);
  // Flip so the normal points AWAY from the interior reference.
  return dot(n, toInterior) > 0 ? { x: -n.x, y: -n.y } : n;
}

/** Signed distance of a point from the exit line along its outward normal (>0 = outside). */
function outwardDistance(point: Vec2, exit: ExitLine): number {
  return dot(sub(point, exit.a), exit.outward);
}

/**
 * True when every corner of every given footprint is strictly on the outward side of the exit line
 * — i.e. the whole rig (car AND trailer) has *fully* crossed the exit.
 */
export function hasRigCrossedExit(rigFootprints: Obb[], exit: ExitLine): boolean {
  if (rigFootprints.length === 0) return false;
  for (const obb of rigFootprints) {
    for (const corner of obbCorners(obb)) {
      if (outwardDistance(corner, exit) <= 0) return false;
    }
  }
  return true;
}

/** True when any corner of any footprint has reached the outward side (crossing has begun). */
export function hasRigStartedCrossing(rigFootprints: Obb[], exit: ExitLine): boolean {
  for (const obb of rigFootprints) {
    for (const corner of obbCorners(obb)) {
      if (outwardDistance(corner, exit) > 0) return true;
    }
  }
  return false;
}
