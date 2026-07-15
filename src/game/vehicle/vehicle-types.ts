import type { Radians } from "../../engine/math/angles";
import type { MPerS, Metres } from "../../engine/math/units";
import type { Vec2 } from "../../engine/math/vec2";
import type { Obb } from "../../engine/math/obb";
import type { ExitLine, PropKind } from "../level/level-types";

/** Body-local coordinates: origin at the body reference, +x = forward (nose), +y = left. */
export interface CarVariant {
  id: string;
  wheels: { fl: Vec2; fr: Vec2; rl: Vec2; rr: Vec2 };
  hitch: Vec2;
  bodyWidth: Metres;
  bodyLength: Metres;
  steerMax: Radians;
  maxSpeedForward: MPerS;
  maxSpeedReverse: MPerS;
  accel: number;
  brake: number;
  steerRate: number;
  jackknifeMax: Radians;
  /** Sprite texture key (roof-view art), loaded by the renderer. */
  texture: string;
  /** Collision body width (metres), excluding sprite margin like door mirrors. Defaults to bodyWidth. */
  collisionWidth?: Metres;
}

export interface TrailerVariant {
  id: string;
  hitch: Vec2;
  axleWheels: { l: Vec2; r: Vec2 };
  bodyWidth: Metres;
  bodyLength: Metres;
  /** Sprite texture key (roof-view art), loaded by the renderer. */
  texture: string;
  /** Collision body width (metres), excluding sprite margin. Defaults to bodyWidth. */
  collisionWidth?: Metres;
}

export interface VariantCatalog {
  cars: CarVariant[];
  trailers: TrailerVariant[];
}

export type CarRole = "placed" | "drivable";

export interface TrailerState {
  variantId: string;
  heading: Radians;
}

export interface CarState {
  variantId: string;
  role: CarRole;
  rearAxle: Vec2;
  heading: Radians;
  speed: MPerS;
  steer: Radians;
  trailer: TrailerState | null;
}

/** A car and its (optional) trailer as the coupled unit stepped by the kinematic model. */
export interface Rig {
  car: CarState;
  trailer: TrailerState | null;
}

/** A static scenery/obstacle instance placed in the world (curb, tree, grass, block). */
export interface WorldProp {
  kind: PropKind;
  obb: Obb;
  collidable: boolean;
}

export interface World {
  cars: CarState[];
  boundary: Obb[];
  props: WorldProp[];
  exit: ExitLine | null;
  bounds: { width: number; height: number };
  catalog: VariantCatalog;
}

export interface CarSpawn {
  variantId: string;
  role: CarRole;
  position: Vec2;
  heading: Radians;
  trailerVariantId?: string;
}

export function findCarVariant(catalog: VariantCatalog, variantId: string): CarVariant {
  const variant = catalog.cars.find((v) => v.id === variantId);
  if (!variant) throw new RangeError(`Unknown car variant: ${variantId}`);
  return variant;
}

export function findTrailerVariant(catalog: VariantCatalog, variantId: string): TrailerVariant {
  const variant = catalog.trailers.find((v) => v.id === variantId);
  if (!variant) throw new RangeError(`Unknown trailer variant: ${variantId}`);
  return variant;
}

export function drivableCar(world: World): CarState {
  const car = world.cars.find((c) => c.role === "drivable");
  if (!car) throw new RangeError("World has no drivable car");
  return car;
}

export function placedCars(world: World): CarState[] {
  return world.cars.filter((c) => c.role === "placed");
}

export function toRig(car: CarState): Rig {
  return { car, trailer: car.trailer };
}

export function fromRig(rig: Rig): CarState {
  return { ...rig.car, trailer: rig.trailer };
}
