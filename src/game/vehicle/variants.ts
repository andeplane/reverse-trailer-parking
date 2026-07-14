import type { Radians } from "../../engine/math/angles";
import { length, midpoint, sub } from "../../engine/math/vec2";
import type { Metres, MPerS } from "../../engine/math/units";
import type { CarVariant, TrailerVariant, VariantCatalog } from "./vehicle-types";

const HALF_PI = Math.PI / 2;

export function validateCarVariant(v: CarVariant): void {
  if (v.bodyWidth <= 0) throw new RangeError(`${v.id}: bodyWidth must be positive`);
  if (v.bodyLength <= 0) throw new RangeError(`${v.id}: bodyLength must be positive`);
  if (!(v.steerMax > 0 && v.steerMax < HALF_PI)) {
    throw new RangeError(`${v.id}: steerMax must be in (0, π/2)`);
  }
  if (!(v.jackknifeMax > 0 && v.jackknifeMax < Math.PI)) {
    throw new RangeError(`${v.id}: jackknifeMax must be in (0, π)`);
  }
  if (v.maxSpeedForward <= 0) throw new RangeError(`${v.id}: maxSpeedForward must be positive`);
  if (v.maxSpeedReverse <= 0) throw new RangeError(`${v.id}: maxSpeedReverse must be positive`);
  if (v.accel <= 0) throw new RangeError(`${v.id}: accel must be positive`);
  if (v.brake <= 0) throw new RangeError(`${v.id}: brake must be positive`);
  if (v.steerRate <= 0) throw new RangeError(`${v.id}: steerRate must be positive`);

  const track = length(sub(v.wheels.fl, v.wheels.fr));
  const rearTrack = length(sub(v.wheels.rl, v.wheels.rr));
  if (track <= 0) throw new RangeError(`${v.id}: front axle is degenerate (fl == fr)`);
  if (rearTrack <= 0) throw new RangeError(`${v.id}: rear axle is degenerate (rl == rr)`);

  const rearAxleCentre = midpoint(v.wheels.rl, v.wheels.rr);
  const frontAxleCentre = midpoint(v.wheels.fl, v.wheels.fr);
  const wheelbase = length(sub(frontAxleCentre, rearAxleCentre));
  if (wheelbase <= 0) throw new RangeError(`${v.id}: wheelbase is degenerate (front axle == rear axle)`);
}

export function validateTrailerVariant(v: TrailerVariant): void {
  if (v.bodyWidth <= 0) throw new RangeError(`${v.id}: bodyWidth must be positive`);
  if (v.bodyLength <= 0) throw new RangeError(`${v.id}: bodyLength must be positive`);

  const track = length(sub(v.axleWheels.l, v.axleWheels.r));
  if (track <= 0) throw new RangeError(`${v.id}: axle is degenerate (l == r)`);

  const axleCentre = midpoint(v.axleWheels.l, v.axleWheels.r);
  const trailerLength = length(sub(v.hitch, axleCentre));
  if (trailerLength <= 0) throw new RangeError(`${v.id}: trailer length is degenerate (hitch == axle centre)`);
}

export const sedanCarVariant: CarVariant = {
  id: "sedan",
  wheels: {
    fl: { x: 1.35, y: 0.75 },
    fr: { x: 1.35, y: -0.75 },
    rl: { x: -1.35, y: 0.75 },
    rr: { x: -1.35, y: -0.75 },
  },
  hitch: { x: -2.3, y: 0 }, // just behind the rear bumper so the drawbar shows
  bodyWidth: 1.8 as Metres,
  bodyLength: 4.5 as Metres,
  steerMax: 0.6109 as Radians, // ~35°
  maxSpeedForward: 8 as MPerS,
  maxSpeedReverse: 4 as MPerS,
  accel: 3,
  brake: 6,
  steerRate: 2.5,
  jackknifeMax: 1.396 as Radians, // ~80°
  texture: "car-red",
};

export const caravanTrailerVariant: TrailerVariant = {
  id: "caravan",
  hitch: { x: 2.2, y: 0 }, // ahead of the box front; the gap is the drawbar
  axleWheels: {
    l: { x: -0.9, y: 0.75 },
    r: { x: -0.9, y: -0.75 },
  },
  bodyWidth: 2.0 as Metres,
  bodyLength: 3.1 as Metres,
  texture: "trailer-white",
};

export function createVariantCatalog(
  args: { cars?: CarVariant[]; trailers?: TrailerVariant[] } = {},
): VariantCatalog {
  const cars = args.cars ?? [sedanCarVariant];
  const trailers = args.trailers ?? [caravanTrailerVariant];
  for (const car of cars) validateCarVariant(car);
  for (const trailer of trailers) validateTrailerVariant(trailer);
  return { cars, trailers };
}
