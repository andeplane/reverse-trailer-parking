import type { Radians } from "../../engine/math/angles";
import type { MPerS, Seconds } from "../../engine/math/units";
import type { Vec2 } from "../../engine/math/vec2";
import type { Obb } from "../../engine/math/obb";
import type { ControlInput } from "../../engine/input/input-source";
import { stepRig } from "./vehicle-model";
import {
  drivableCar,
  fromRig,
  toRig,
  type CarSpawn,
  type CarState,
  type Rig,
  type VariantCatalog,
  type World,
} from "./vehicle-types";

function carStateFromSpawn(spawn: CarSpawn): CarState {
  return {
    variantId: spawn.variantId,
    role: spawn.role,
    rearAxle: spawn.position,
    heading: spawn.heading,
    speed: 0 as MPerS,
    steer: 0 as Radians,
    trailer: spawn.trailerVariantId ? { variantId: spawn.trailerVariantId, heading: spawn.heading } : null,
  };
}

export function createWorld(args: { cars: CarSpawn[]; boundary: Obb[]; catalog: VariantCatalog }): World {
  const cars = args.cars.map(carStateFromSpawn);
  const drivableCount = cars.filter((c) => c.role === "drivable").length;
  if (drivableCount !== 1) {
    throw new RangeError(`World must have exactly one drivable car (found ${drivableCount})`);
  }
  return { cars, boundary: args.boundary, catalog: args.catalog };
}

export function createInitialRig(args: {
  variantId: string;
  trailerVariantId?: string;
  position?: Vec2;
  heading?: Radians;
}): Rig {
  const position = args.position ?? { x: 0, y: 0 };
  const heading = args.heading ?? (0 as Radians);
  const car: CarState = {
    variantId: args.variantId,
    role: "drivable",
    rearAxle: position,
    heading,
    speed: 0 as MPerS,
    steer: 0 as Radians,
    trailer: args.trailerVariantId ? { variantId: args.trailerVariantId, heading } : null,
  };
  return toRig(car);
}

/** Advances only the drivable rig via `stepRig`; placed cars are immovable. No collision yet. */
export function stepWorld(args: { world: World; input: ControlInput; dt: Seconds }): World {
  const { world, input, dt } = args;
  const rig = toRig(drivableCar(world));
  const steppedCar = fromRig(stepRig({ rig, input, dt, catalog: world.catalog }));
  const cars = world.cars.map((car) => (car.role === "drivable" ? steppedCar : car));
  return { ...world, cars };
}
