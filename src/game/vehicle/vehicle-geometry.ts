import { add, dot, length, midpoint, normalise, perp, rotate, sub, type Vec2 } from "../../engine/math/vec2";
import type { Radians } from "../../engine/math/angles";
import type { Metres } from "../../engine/math/units";
import type { Obb } from "../../engine/math/obb";
import type { CarState, CarVariant, TrailerState, TrailerVariant } from "./vehicle-types";

export interface CarDerivedGeometry {
  rearAxleCentre: Vec2;
  frontAxleCentre: Vec2;
  forward: Vec2;
  wheelbase: Metres;
  trackWidth: Metres;
  /** Signed distance from rear axle to hitch, along `forward`; positive = hitch behind rear axle. */
  hitchOffset: Metres;
}

export function deriveCarGeometry(variant: CarVariant): CarDerivedGeometry {
  const rearAxleCentre = midpoint(variant.wheels.rl, variant.wheels.rr);
  const frontAxleCentre = midpoint(variant.wheels.fl, variant.wheels.fr);
  const forward = normalise(sub(frontAxleCentre, rearAxleCentre));
  const left = perp(forward);
  const wheelbase = length(sub(frontAxleCentre, rearAxleCentre)) as Metres;
  const trackWidth = Math.abs(dot(sub(variant.wheels.rl, variant.wheels.rr), left)) as Metres;
  const hitchOffset = dot(sub(rearAxleCentre, variant.hitch), forward) as Metres;
  return { rearAxleCentre, frontAxleCentre, forward, wheelbase, trackWidth, hitchOffset };
}

export interface TrailerDerivedGeometry {
  axleCentre: Vec2;
  trailerLength: Metres;
}

export function deriveTrailerGeometry(variant: TrailerVariant): TrailerDerivedGeometry {
  const axleCentre = midpoint(variant.axleWheels.l, variant.axleWheels.r);
  const trailerLength = length(sub(variant.hitch, axleCentre)) as Metres;
  return { axleCentre, trailerLength };
}

/** Maps a car-body-local point (origin = rear-axle centre reference) into world space. */
function carLocalToWorld(car: CarState, variant: CarVariant, local: Vec2): Vec2 {
  const { rearAxleCentre } = deriveCarGeometry(variant);
  return add(car.rearAxle, rotate(sub(local, rearAxleCentre), car.heading));
}

export function wheelWorldPositions(
  car: CarState,
  variant: CarVariant,
): { fl: Vec2; fr: Vec2; rl: Vec2; rr: Vec2 } {
  return {
    fl: carLocalToWorld(car, variant, variant.wheels.fl),
    fr: carLocalToWorld(car, variant, variant.wheels.fr),
    rl: carLocalToWorld(car, variant, variant.wheels.rl),
    rr: carLocalToWorld(car, variant, variant.wheels.rr),
  };
}

export function hitchWorld(car: CarState, variant: CarVariant): Vec2 {
  return carLocalToWorld(car, variant, variant.hitch);
}

/** Rear-axle reference position that puts the car's body centre at `centre` for the given heading. */
export function rearAxleForBodyCentre(args: { centre: Vec2; heading: Radians; variant: CarVariant }): Vec2 {
  const { rearAxleCentre } = deriveCarGeometry(args.variant);
  return add(args.centre, rotate(rearAxleCentre, args.heading));
}

export function carFootprint(car: CarState, variant: CarVariant): Obb {
  return {
    center: carLocalToWorld(car, variant, { x: 0, y: 0 }),
    halfW: (variant.collisionWidth ?? variant.bodyWidth) / 2,
    halfL: variant.bodyLength / 2,
    rotation: car.heading,
  };
}

/** World position of the trailer's own body-centre reference, given the world hitch coupling point. */
function trailerBodyCentreWorld(trailer: TrailerState, hitchWorldPoint: Vec2, variant: TrailerVariant): Vec2 {
  return sub(hitchWorldPoint, rotate(variant.hitch, trailer.heading));
}

export function trailerFootprint(trailer: TrailerState, hitchWorldPoint: Vec2, variant: TrailerVariant): Obb {
  return {
    center: trailerBodyCentreWorld(trailer, hitchWorldPoint, variant),
    halfW: (variant.collisionWidth ?? variant.bodyWidth) / 2,
    halfL: variant.bodyLength / 2,
    rotation: trailer.heading,
  };
}

export function trailerWheelWorldPositions(
  trailer: TrailerState,
  hitchWorldPoint: Vec2,
  variant: TrailerVariant,
): { l: Vec2; r: Vec2 } {
  const bodyCentre = trailerBodyCentreWorld(trailer, hitchWorldPoint, variant);
  return {
    l: add(bodyCentre, rotate(variant.axleWheels.l, trailer.heading)),
    r: add(bodyCentre, rotate(variant.axleWheels.r, trailer.heading)),
  };
}
