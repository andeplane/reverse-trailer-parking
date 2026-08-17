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
  if (v.collisionWidth !== undefined && !(v.collisionWidth > 0 && v.collisionWidth <= v.bodyWidth)) {
    throw new RangeError(`${v.id}: collisionWidth must be in (0, bodyWidth]`);
  }

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

  if (v.collisionWidth !== undefined && !(v.collisionWidth > 0 && v.collisionWidth <= v.bodyWidth)) {
    throw new RangeError(`${v.id}: collisionWidth must be in (0, bodyWidth]`);
  }

  const track = length(sub(v.axleWheels.l, v.axleWheels.r));
  if (track <= 0) throw new RangeError(`${v.id}: axle is degenerate (l == r)`);

  const axleCentre = midpoint(v.axleWheels.l, v.axleWheels.r);
  const trailerLength = length(sub(v.hitch, axleCentre));
  if (trailerLength <= 0) throw new RangeError(`${v.id}: trailer length is degenerate (hitch == axle centre)`);
}

/**
 * Car variants. Geometry is authored as explicit wheel/hitch coordinates (scalars like wheelbase are
 * derived), and `bodyWidth`/`bodyLength` match the sprite's trimmed aspect ratio so the art is never
 * stretched. `collisionWidth` is the body without its door mirrors — what the player actually feels.
 *
 * Colour is NOT part of a variant: the art is white and tinted per car (see `car-colours.ts`), so a
 * body type and a paint colour are chosen independently.
 */

export const sedanCarVariant: CarVariant = {
  id: "sedan",
  wheels: {
    fl: { x: 1.35, y: 0.75 },
    fr: { x: 1.35, y: -0.75 },
    rl: { x: -1.35, y: 0.75 },
    rr: { x: -1.35, y: -0.75 },
  },
  hitch: { x: -2.3, y: 0 }, // just behind the rear bumper so the drawbar shows
  bodyWidth: 1.88 as Metres,
  bodyLength: 4.5 as Metres,
  steerMax: 0.6109 as Radians, // ~35°
  maxSpeedForward: 8 as MPerS,
  maxSpeedReverse: 4 as MPerS,
  accel: 3,
  brake: 6,
  steerRate: 2.5,
  jackknifeMax: 1.396 as Radians, // ~80°
  texture: "car-sedan",
  collisionWidth: 1.7 as Metres,
};

/** Longer wheelbase + smaller steer lock → a noticeably wider turning circle than the sedan. */
export const suvCarVariant: CarVariant = {
  id: "suv",
  wheels: {
    fl: { x: 1.45, y: 0.86 },
    fr: { x: 1.45, y: -0.86 },
    rl: { x: -1.45, y: 0.86 },
    rr: { x: -1.45, y: -0.86 },
  },
  hitch: { x: -2.5, y: 0 },
  bodyWidth: 2.27 as Metres,
  bodyLength: 4.8 as Metres,
  steerMax: 0.4887 as Radians, // ~28°
  maxSpeedForward: 7.5 as MPerS,
  maxSpeedReverse: 3.8 as MPerS,
  accel: 2.7,
  brake: 6,
  steerRate: 2.2,
  jackknifeMax: 1.396 as Radians,
  texture: "car-suv",
  collisionWidth: 2.0 as Metres,
};

/** Short wheelbase + tight steer → a nimble hatchback with a small turning circle. */
export const hatchbackCarVariant: CarVariant = {
  id: "hatchback",
  wheels: {
    fl: { x: 1.2, y: 0.76 },
    fr: { x: 1.2, y: -0.76 },
    rl: { x: -1.2, y: 0.76 },
    rr: { x: -1.2, y: -0.76 },
  },
  hitch: { x: -2.0, y: 0 },
  bodyWidth: 2.03 as Metres,
  bodyLength: 3.9 as Metres,
  steerMax: 0.6632 as Radians, // ~38°
  maxSpeedForward: 8 as MPerS,
  maxSpeedReverse: 4.2 as MPerS,
  accel: 3.2,
  brake: 6.5,
  steerRate: 2.8,
  jackknifeMax: 1.396 as Radians,
  texture: "car-hatchback",
  collisionWidth: 1.73 as Metres,
};

export const coupeCarVariant: CarVariant = {
  id: "coupe",
  wheels: {
    fl: { x: 1.3, y: 0.72 },
    fr: { x: 1.3, y: -0.72 },
    rl: { x: -1.3, y: 0.72 },
    rr: { x: -1.3, y: -0.72 },
  },
  hitch: { x: -2.15, y: 0 },
  bodyWidth: 1.84 as Metres,
  bodyLength: 4.3 as Metres,
  steerMax: 0.6109 as Radians,
  maxSpeedForward: 8.5 as MPerS,
  maxSpeedReverse: 4 as MPerS,
  accel: 3.4,
  brake: 6.5,
  steerRate: 2.6,
  jackknifeMax: 1.396 as Radians,
  texture: "car-coupe",
  collisionWidth: 1.63 as Metres,
};

export const wagonCarVariant: CarVariant = {
  id: "wagon",
  wheels: {
    fl: { x: 1.45, y: 0.72 },
    fr: { x: 1.45, y: -0.72 },
    rl: { x: -1.45, y: 0.72 },
    rr: { x: -1.45, y: -0.72 },
  },
  hitch: { x: -2.5, y: 0 },
  bodyWidth: 1.85 as Metres,
  bodyLength: 4.8 as Metres,
  steerMax: 0.5411 as Radians, // ~31°
  maxSpeedForward: 7.8 as MPerS,
  maxSpeedReverse: 4 as MPerS,
  accel: 2.9,
  brake: 6,
  steerRate: 2.4,
  jackknifeMax: 1.396 as Radians,
  texture: "car-wagon",
  collisionWidth: 1.62 as Metres,
};

/** High-roof panel van: long, slow to turn, and too long for a standard bay. */
export const vanCarVariant: CarVariant = {
  id: "van",
  wheels: {
    fl: { x: 1.65, y: 0.78 },
    fr: { x: 1.65, y: -0.78 },
    rl: { x: -1.65, y: 0.78 },
    rr: { x: -1.65, y: -0.78 },
  },
  hitch: { x: -2.8, y: 0 },
  bodyWidth: 2.09 as Metres,
  bodyLength: 5.4 as Metres,
  steerMax: 0.5236 as Radians, // ~30°
  maxSpeedForward: 7 as MPerS,
  maxSpeedReverse: 3.5 as MPerS,
  accel: 2.4,
  brake: 5.5,
  steerRate: 2,
  jackknifeMax: 1.396 as Radians,
  texture: "car-van",
  collisionWidth: 1.75 as Metres,
};

/** Pickup with an open bed — wide mirrors, long body, lazy steering. */
export const pickupCarVariant: CarVariant = {
  id: "pickup",
  wheels: {
    fl: { x: 1.7, y: 0.88 },
    fr: { x: 1.7, y: -0.88 },
    rl: { x: -1.7, y: 0.88 },
    rr: { x: -1.7, y: -0.88 },
  },
  hitch: { x: -2.9, y: 0 },
  bodyWidth: 2.35 as Metres,
  bodyLength: 5.6 as Metres,
  steerMax: 0.4712 as Radians, // ~27°
  maxSpeedForward: 7.2 as MPerS,
  maxSpeedReverse: 3.6 as MPerS,
  accel: 2.6,
  brake: 5.5,
  steerRate: 2,
  jackknifeMax: 1.396 as Radians,
  texture: "car-pickup",
  collisionWidth: 1.97 as Metres,
};

/** Box truck: the widest thing in the lot — it blocks a whole aisle end. */
export const truckCarVariant: CarVariant = {
  id: "truck",
  wheels: {
    fl: { x: 2.0, y: 1.15 },
    fr: { x: 2.0, y: -1.15 },
    rl: { x: -2.0, y: 1.15 },
    rr: { x: -2.0, y: -1.15 },
  },
  hitch: { x: -3.6, y: 0 },
  bodyWidth: 2.79 as Metres,
  bodyLength: 7 as Metres,
  steerMax: 0.4363 as Radians, // ~25°
  maxSpeedForward: 6.5 as MPerS,
  maxSpeedReverse: 3 as MPerS,
  accel: 2,
  brake: 5,
  steerRate: 1.8,
  jackknifeMax: 1.396 as Radians,
  texture: "car-truck",
  collisionWidth: 2.58 as Metres,
};

/** Motorhome: the longest vehicle — a rolling wall to squeeze past. */
export const rvCarVariant: CarVariant = {
  id: "rv",
  wheels: {
    fl: { x: 2.1, y: 0.9 },
    fr: { x: 2.1, y: -0.9 },
    rl: { x: -2.1, y: 0.9 },
    rr: { x: -2.1, y: -0.9 },
  },
  hitch: { x: -3.8, y: 0 },
  bodyWidth: 2.34 as Metres,
  bodyLength: 7.4 as Metres,
  steerMax: 0.384 as Radians, // ~22°
  maxSpeedForward: 6.5 as MPerS,
  maxSpeedReverse: 3 as MPerS,
  accel: 1.9,
  brake: 5,
  steerRate: 1.7,
  jackknifeMax: 1.396 as Radians,
  texture: "car-rv",
  collisionWidth: 2.01 as Metres,
};

export const caravanTrailerVariant: TrailerVariant = {
  id: "caravan",
  hitch: { x: 2.2, y: 0 }, // ahead of the box front; the gap is the drawbar
  // Just aft of the box centre, where a real caravan's single axle sits (and where the sprite
  // draws its wheel arches). Axle position sets the hitch-to-axle length, so it is the single
  // biggest handle on how the trailer reverses.
  axleWheels: {
    l: { x: -0.42, y: 0.75 },
    r: { x: -0.42, y: -0.75 },
  },
  bodyWidth: 2.0 as Metres,
  bodyLength: 2.6 as Metres,
  texture: "trailer-white",
  collisionWidth: 1.77 as Metres,
};

/** A short, wide flat-bed utility trailer — different footprint + shorter length than the caravan. */
export const utilityTrailerVariant: TrailerVariant = {
  id: "utility",
  hitch: { x: 1.6, y: 0 },
  // Near the middle of the little flat bed — a short hitch-to-axle length, so it reacts fast.
  axleWheels: {
    l: { x: 0.1, y: 0.75 },
    r: { x: 0.1, y: -0.75 },
  },
  bodyWidth: 1.9 as Metres,
  bodyLength: 2.1 as Metres,
  texture: "trailer-utility",
  collisionWidth: 1.6 as Metres,
};

/** Car-sized variants: short enough to sit in a standard 2.5 m × 5 m parking bay. */
export const bayCarVariants: CarVariant[] = [
  sedanCarVariant,
  suvCarVariant,
  hatchbackCarVariant,
  coupeCarVariant,
  wagonCarVariant,
];

/** Oversize variants: too long for a bay, so they only ever stand in open ground. */
export const oversizeCarVariants: CarVariant[] = [
  vanCarVariant,
  pickupCarVariant,
  truckCarVariant,
  rvCarVariant,
];

export const allCarVariants: CarVariant[] = [...bayCarVariants, ...oversizeCarVariants];

export const allTrailerVariants: TrailerVariant[] = [caravanTrailerVariant, utilityTrailerVariant];

export function createVariantCatalog(
  args: { cars?: CarVariant[]; trailers?: TrailerVariant[] } = {},
): VariantCatalog {
  const cars = args.cars ?? [sedanCarVariant];
  const trailers = args.trailers ?? [caravanTrailerVariant];
  for (const car of cars) validateCarVariant(car);
  for (const trailer of trailers) validateTrailerVariant(trailer);
  return { cars, trailers };
}
