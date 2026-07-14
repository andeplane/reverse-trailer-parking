import { normaliseAngle, type Radians } from "../../engine/math/angles";
import { add, dot, length, normalise, scale, sub, type Vec2 } from "../../engine/math/vec2";
import { obbMtv, type Obb } from "../../engine/math/obb";
import { carFootprint, hitchWorld, trailerFootprint } from "../vehicle/vehicle-geometry";
import {
  findCarVariant,
  findTrailerVariant,
  placedCars,
  type Rig,
  type VariantCatalog,
  type World,
} from "../vehicle/vehicle-types";

const DEFAULT_BISECT_ITERATIONS = 14;
const MTV_ITERATIONS = 8;
const SLIDE_ITERATIONS = 8;
/** Path samples along the taken step; makes contact detection tunnelling-proof for coarse steps. */
const PATH_SAMPLES = 32;

/** Oriented footprints of a rig: the car OBB plus its trailer OBB (if towed). */
export function rigFootprints(rig: Rig, catalog: VariantCatalog): Obb[] {
  const carVariant = findCarVariant(catalog, rig.car.variantId);
  const footprints: Obb[] = [carFootprint(rig.car, carVariant)];
  if (rig.trailer) {
    const trailerVariant = findTrailerVariant(catalog, rig.trailer.variantId);
    const hitch = hitchWorld(rig.car, carVariant);
    footprints.push(trailerFootprint(rig.trailer, hitch, trailerVariant));
  }
  return footprints;
}

/** Immovable obstacles: every placed car (and its trailer) plus the boundary walls. */
export function obstacleFootprints(world: World): Obb[] {
  const footprints: Obb[] = [];
  for (const car of placedCars(world)) {
    const carVariant = findCarVariant(world.catalog, car.variantId);
    footprints.push(carFootprint(car, carVariant));
    if (car.trailer) {
      const trailerVariant = findTrailerVariant(world.catalog, car.trailer.variantId);
      footprints.push(trailerFootprint(car.trailer, hitchWorld(car, carVariant), trailerVariant));
    }
  }
  return [...footprints, ...world.boundary];
}

function angleLerp(a: number, b: number, t: number): Radians {
  return normaliseAngle(a + normaliseAngle(b - a) * t);
}

/**
 * Interpolates a rig pose between two rigs. The car rear-axle is lerped linearly and headings by
 * the shortest arc; the trailer follows the car (its heading also lerps), keeping the coupling.
 * `catalog` is accepted for API symmetry with the rest of the collision contract.
 */
export function lerpRig(a: Rig, b: Rig, t: number, _catalog: VariantCatalog): Rig {
  const rearAxle: Vec2 = {
    x: a.car.rearAxle.x + (b.car.rearAxle.x - a.car.rearAxle.x) * t,
    y: a.car.rearAxle.y + (b.car.rearAxle.y - a.car.rearAxle.y) * t,
  };
  const trailer =
    a.trailer && b.trailer
      ? { ...b.trailer, heading: angleLerp(a.trailer.heading, b.trailer.heading, t) }
      : b.trailer;
  return {
    car: { ...b.car, rearAxle, heading: angleLerp(a.car.heading, b.car.heading, t), trailer },
    trailer,
  };
}

function translateRig(rig: Rig, delta: Vec2): Rig {
  const car = { ...rig.car, rearAxle: add(rig.car.rearAxle, delta) };
  return { car, trailer: rig.trailer };
}

function overlapsAny(footprints: Obb[], obstacles: Obb[]): boolean {
  for (const f of footprints) {
    for (const o of obstacles) {
      if (obbMtv(f, o) !== null) return true;
    }
  }
  return false;
}

/** Push the rig out of any residual overlap, resolving the deepest contact each pass. */
function pushOut(rig: Rig, obstacles: Obb[], catalog: VariantCatalog): Rig {
  let current = rig;
  for (let iter = 0; iter < MTV_ITERATIONS; iter++) {
    const footprints = rigFootprints(current, catalog);
    let deepest: Vec2 | null = null;
    let deepestMag = 0;
    for (const f of footprints) {
      for (const o of obstacles) {
        const mtv = obbMtv(f, o);
        if (mtv) {
          const mag = length(mtv);
          if (mag > deepestMag) {
            deepestMag = mag;
            deepest = mtv;
          }
        }
      }
    }
    if (!deepest) break;
    current = translateRig(current, deepest);
  }
  return current;
}

/** Deepest separation normal (unit) of a rig against obstacles, or null if clear. */
function contactNormal(rig: Rig, obstacles: Obb[], catalog: VariantCatalog): Vec2 | null {
  const footprints = rigFootprints(rig, catalog);
  let deepest: Vec2 | null = null;
  let deepestMag = 0;
  for (const f of footprints) {
    for (const o of obstacles) {
      const mtv = obbMtv(f, o);
      if (mtv) {
        const mag = length(mtv);
        if (mag > deepestMag) {
          deepestMag = mag;
          deepest = mtv;
        }
      }
    }
  }
  return deepest ? normalise(deepest) : null;
}

/**
 * Slides the rig along the contact tangent: the leftover motion into the surface is projected onto
 * the tangent so the rig grazes rather than dead-stops. Deterministic; falls back to no slide.
 */
function slideAlongContact(args: {
  contactPose: Rig;
  sweptRig: Rig;
  blockedPose: Rig;
  obstacles: Obb[];
  catalog: VariantCatalog;
}): Rig {
  const { contactPose, sweptRig, blockedPose, obstacles, catalog } = args;
  const remaining = sub(sweptRig.car.rearAxle, contactPose.car.rearAxle);
  if (length(remaining) < 1e-6) return contactPose;

  const normal = contactNormal(blockedPose, obstacles, catalog);
  if (!normal) return contactPose;

  const tangent = sub(remaining, scale(normal, dot(remaining, normal)));
  if (length(tangent) < 1e-6) return contactPose;

  const full = translateRig(contactPose, tangent);
  if (!overlapsAny(rigFootprints(full, catalog), obstacles)) return full;

  // Bisect the tangential move for the furthest clear slide.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < SLIDE_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const pose = translateRig(contactPose, scale(tangent, mid));
    if (overlapsAny(rigFootprints(pose, catalog), obstacles)) hi = mid;
    else lo = mid;
  }
  return translateRig(contactPose, scale(tangent, lo));
}

/**
 * Resolves the drivable rig against immovable obstacles: block-at-contact by bisecting the taken
 * sub-step (tunnelling-proof because `prevRig` is known clear), then MTV push-out of any residue.
 * Deterministic; placed obstacles are never moved.
 */
export function resolveRigCollision(args: {
  prevRig: Rig;
  sweptRig: Rig;
  obstacles: Obb[];
  catalog: VariantCatalog;
  iterations?: number;
}): { rig: Rig; contacted: boolean } {
  const { prevRig, sweptRig, obstacles, catalog } = args;
  const iterations = args.iterations ?? DEFAULT_BISECT_ITERATIONS;

  if (obstacles.length === 0) return { rig: sweptRig, contacted: false };

  // If we somehow started overlapping, just push out from the previous pose.
  if (overlapsAny(rigFootprints(prevRig, catalog), obstacles)) {
    return { rig: pushOut(prevRig, obstacles, catalog), contacted: true };
  }

  // Sample the taken path to find the first overlapping fraction (tunnelling-proof for coarse steps).
  let firstHit = -1;
  for (let i = 1; i <= PATH_SAMPLES; i++) {
    const pose = i === PATH_SAMPLES ? sweptRig : lerpRig(prevRig, sweptRig, i / PATH_SAMPLES, catalog);
    if (overlapsAny(rigFootprints(pose, catalog), obstacles)) {
      firstHit = i;
      break;
    }
  }
  if (firstHit === -1) return { rig: sweptRig, contacted: false };

  // Bisect between the last clear sample and the first overlapping one for the exact contact pose.
  let lo = (firstHit - 1) / PATH_SAMPLES;
  let hi = firstHit / PATH_SAMPLES;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const pose = lerpRig(prevRig, sweptRig, mid, catalog);
    if (overlapsAny(rigFootprints(pose, catalog), obstacles)) hi = mid;
    else lo = mid;
  }

  const contactPose = lerpRig(prevRig, sweptRig, lo, catalog);
  const blockedPose = lerpRig(prevRig, sweptRig, hi, catalog); // barely overlapping → clean normal
  const slid = slideAlongContact({ contactPose, sweptRig, blockedPose, obstacles, catalog });
  return { rig: pushOut(slid, obstacles, catalog), contacted: true };
}
