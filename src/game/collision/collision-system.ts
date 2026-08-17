import { normaliseAngle, type Radians } from "../../engine/math/angles";
import type { MPerS } from "../../engine/math/units";
import { add, dot, length, normalise, scale, sub, type Vec2 } from "../../engine/math/vec2";
import { obbMtv, type Obb } from "../../engine/math/obb";
import type { ImpactKind } from "../vehicle/damage";
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
/**
 * Grip alignment (|cos| of the angle between the contacting body's rolling axis and the contact
 * surface) below which the rig binds instead of sliding. Wheels only roll along the body axis, so
 * a body pressed into an obstacle cannot be carried sideways along it: at 0.8 only a scrape within
 * ~37° of parallel glides at all, and even then only its surviving along-surface component does.
 */
const SLIDE_GRIP_CUTOFF = 0.8;

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

/** An immovable obstacle: its footprint plus what it is made of, which prices an impact with it. */
export interface Obstacle {
  obb: Obb;
  kind: ImpactKind;
}

function solidObstacle(obb: Obb): Obstacle {
  return { obb, kind: "solid" };
}

function buildObstacles(world: World): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const car of placedCars(world)) {
    const carVariant = findCarVariant(world.catalog, car.variantId);
    obstacles.push(solidObstacle(carFootprint(car, carVariant)));
    if (car.trailer) {
      const trailerVariant = findTrailerVariant(world.catalog, car.trailer.variantId);
      obstacles.push(solidObstacle(trailerFootprint(car.trailer, hitchWorld(car, carVariant), trailerVariant)));
    }
  }
  return [
    ...obstacles,
    ...world.solids.map(solidObstacle),
    ...world.curbs.map((obb): Obstacle => ({ obb, kind: "curb" })),
    ...world.boundary.map(solidObstacle),
  ];
}

/**
 * Cache of the obstacle list, keyed by everything it is built from. Nothing here moves during a run
 * — only the drivable car does, and it is not an obstacle — so this rebuilds essentially never,
 * while `stepWorld` asks for it 120 times a second on a phone. The key holds identities, so any
 * edit (a level reload, the editor replacing a car) misses the cache and rebuilds.
 */
const obstacleCache = new WeakMap<Obb[], { key: readonly unknown[]; obstacles: Obstacle[] }>();

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Immovable obstacles: every placed car (and its trailer), collidable props, kerbs, and walls. */
export function obstacleFootprints(world: World): Obstacle[] {
  const key: readonly unknown[] = [world.solids, world.curbs, world.catalog, ...placedCars(world)];
  const cached = obstacleCache.get(world.boundary);
  if (cached && sameKey(cached.key, key)) return cached.obstacles;
  const obstacles = buildObstacles(world);
  obstacleCache.set(world.boundary, { key, obstacles });
  return obstacles;
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

function overlapsAny(footprints: Obb[], obstacles: Obstacle[]): boolean {
  for (const f of footprints) {
    for (const o of obstacles) {
      if (obbMtv(f, o.obb) !== null) return true;
    }
  }
  return false;
}

/** Push the rig out of any residual overlap, resolving the deepest contact each pass. */
function pushOut(rig: Rig, obstacles: Obstacle[], catalog: VariantCatalog): Rig {
  let current = rig;
  for (let iter = 0; iter < MTV_ITERATIONS; iter++) {
    const footprints = rigFootprints(current, catalog);
    let deepest: Vec2 | null = null;
    let deepestMag = 0;
    for (const f of footprints) {
      for (const o of obstacles) {
        const mtv = obbMtv(f, o.obb);
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

/** The rig's deepest contact: the separation normal (unit, out of the obstacle) and what was hit. */
function deepestContact(
  rig: Rig,
  obstacles: Obstacle[],
  catalog: VariantCatalog,
): { normal: Vec2; kind: ImpactKind } | null {
  const footprints = rigFootprints(rig, catalog);
  let deepest: Vec2 | null = null;
  let deepestMag = 0;
  let kind: ImpactKind = "solid";
  for (const f of footprints) {
    for (const o of obstacles) {
      const mtv = obbMtv(f, o.obb);
      if (mtv) {
        const mag = length(mtv);
        if (mag > deepestMag) {
          deepestMag = mag;
          deepest = mtv;
          kind = o.kind;
        }
      }
    }
  }
  return deepest ? { normal: normalise(deepest), kind } : null;
}

/**
 * Slides the rig along the contact surface so a grazing rig glides rather than dead-stops.
 *
 * The leftover motion is first reduced to what the wheels can actually produce — its component
 * along the **car's** rolling axis, never the raw step vector — and only then projected onto the
 * surface. Without that reduction the rig would crab: a car rolling into a curb at an angle would
 * be carried bodily along the curb, sideways to its own wheels. The car's axis is the right one to
 * gate on even when the trailer is what touches, because the whole rig is translated by the car's
 * motion — gating on a folded trailer's heading would dead-stop a car rolling straight down a kerb.
 * The surviving motion is scaled by the grip alignment and binds entirely below
 * `SLIDE_GRIP_CUTOFF`. Deterministic; falls back to no slide.
 */
function slideAlongContact(args: {
  contactPose: Rig;
  sweptRig: Rig;
  normal: Vec2;
  obstacles: Obstacle[];
  catalog: VariantCatalog;
}): Rig {
  const { contactPose, sweptRig, normal, obstacles, catalog } = args;
  const remaining = sub(sweptRig.car.rearAxle, contactPose.car.rearAxle);
  if (length(remaining) < 1e-6) return contactPose;

  // What the wheels can roll: the leftover motion along the car's own axis.
  const heading = contactPose.car.heading;
  const axis: Vec2 = { x: Math.cos(heading), y: Math.sin(heading) };
  const rolled = scale(axis, dot(remaining, axis));
  const rolledLen = length(rolled);
  if (rolledLen < 1e-6) return contactPose;

  const projected = sub(rolled, scale(normal, dot(rolled, normal)));
  const grip = length(projected) / rolledLen; // 1 = rolling parallel to the surface, 0 = head-on
  const slideScale = (grip - SLIDE_GRIP_CUTOFF) / (1 - SLIDE_GRIP_CUTOFF);
  if (slideScale <= 0 || length(projected) < 1e-6) return contactPose;
  const tangent = scale(projected, Math.min(1, slideScale));

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
 * Hitting something scrubs off speed: the car keeps only the fraction of the step it actually
 * travelled. Without this a rig held against a wall keeps the full throttle speed it never got to
 * use, and the moment the surface lets it slide it shoots along at that speed.
 */
function bleedSpeed(args: { prevRig: Rig; sweptRig: Rig; resolved: Rig }): Rig {
  const { prevRig, sweptRig, resolved } = args;
  const attempted = length(sub(sweptRig.car.rearAxle, prevRig.car.rearAxle));
  if (attempted < 1e-9) return resolved;
  const achieved = length(sub(resolved.car.rearAxle, prevRig.car.rearAxle));
  const retained = Math.min(1, achieved / attempted);
  return {
    car: { ...resolved.car, speed: ((resolved.car.speed as number) * retained) as MPerS },
    trailer: resolved.trailer,
  };
}

/**
 * Resolves the drivable rig against immovable obstacles: block-at-contact by bisecting the taken
 * sub-step (tunnelling-proof because `prevRig` is known clear), then MTV push-out of any residue.
 * Deterministic; placed obstacles are never moved. On contact it reports the deepest contact —
 * `contactNormal` (unit, pointing out of the obstacle) and `contactKind` (what was hit), the
 * direction and the price of the impact for damage — and the car's speed is scrubbed to the
 * fraction of the step that survived.
 */
export function resolveRigCollision(args: {
  prevRig: Rig;
  sweptRig: Rig;
  obstacles: Obstacle[];
  catalog: VariantCatalog;
  iterations?: number;
}): { rig: Rig; contacted: boolean; contactNormal: Vec2 | null; contactKind: ImpactKind | null } {
  const { prevRig, sweptRig, obstacles, catalog } = args;
  const iterations = args.iterations ?? DEFAULT_BISECT_ITERATIONS;
  const clear = { rig: sweptRig, contacted: false, contactNormal: null, contactKind: null } as const;

  if (obstacles.length === 0) return clear;

  // If we somehow started overlapping, just push out from the previous pose. No speed is scrubbed
  // here on purpose: the frame that *entered* the contact already paid that (this branch only
  // fires when a pose was overlapping before it moved), and zeroing the speed of a rig that is
  // stuck inside something would take away the throttle it needs to drive back out.
  if (overlapsAny(rigFootprints(prevRig, catalog), obstacles)) {
    const contact = deepestContact(prevRig, obstacles, catalog);
    return {
      rig: pushOut(prevRig, obstacles, catalog),
      contacted: true,
      contactNormal: contact?.normal ?? null,
      contactKind: contact?.kind ?? null,
    };
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
  if (firstHit === -1) return clear;

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
  const contact = deepestContact(blockedPose, obstacles, catalog);
  const slid = contact
    ? slideAlongContact({ contactPose, sweptRig, normal: contact.normal, obstacles, catalog })
    : contactPose;
  const resolved = pushOut(slid, obstacles, catalog);
  return {
    rig: bleedSpeed({ prevRig, sweptRig, resolved }),
    contacted: true,
    contactNormal: contact?.normal ?? null,
    contactKind: contact?.kind ?? null,
  };
}
