import type { Radians } from "./angles";
import { add, dot, rotate, scale, sub, vec2, type Vec2 } from "./vec2";

/** Oriented bounding box: local +x = forward (halfL extent), +y = left (halfW extent). */
export interface Obb {
  center: Vec2;
  halfW: number;
  halfL: number;
  rotation: Radians;
}

function forwardAxis(o: Obb): Vec2 {
  return rotate(vec2(1, 0), o.rotation);
}

function leftAxis(o: Obb): Vec2 {
  return rotate(vec2(0, 1), o.rotation);
}

/** The 4 world-space corners, starting front-left and going clockwise. */
export function obbCorners(o: Obb): [Vec2, Vec2, Vec2, Vec2] {
  const fwd = scale(forwardAxis(o), o.halfL);
  const left = scale(leftAxis(o), o.halfW);
  return [
    add(add(o.center, fwd), left),
    sub(add(o.center, fwd), left),
    sub(sub(o.center, fwd), left),
    add(sub(o.center, fwd), left),
  ];
}

/** Signed min-translation-vector to move `a` clear of `b`; null if disjoint (SAT over 4 face normals). */
export function obbMtv(a: Obb, b: Obb): Vec2 | null {
  const axes = [forwardAxis(a), leftAxis(a), forwardAxis(b), leftAxis(b)];
  const centerDiff = sub(a.center, b.center);

  let minOverlap = Number.POSITIVE_INFINITY;
  let minAxis: Vec2 | null = null;
  let minSign = 1;

  for (const axis of axes) {
    const projA = a.halfL * Math.abs(dot(forwardAxis(a), axis)) + a.halfW * Math.abs(dot(leftAxis(a), axis));
    const projB = b.halfL * Math.abs(dot(forwardAxis(b), axis)) + b.halfW * Math.abs(dot(leftAxis(b), axis));
    const distance = dot(centerDiff, axis);
    const overlap = projA + projB - Math.abs(distance);

    if (overlap <= 0) return null;

    if (overlap < minOverlap) {
      minOverlap = overlap;
      minAxis = axis;
      minSign = distance >= 0 ? 1 : -1;
    }
  }

  if (!minAxis) return null;
  return scale(minAxis, minOverlap * minSign);
}

/** True iff the two oriented boxes overlap (touching-only counts as not overlapping). */
export function obbOverlap(a: Obb, b: Obb): boolean {
  return obbMtv(a, b) !== null;
}
