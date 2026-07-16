import type { Radians } from "../../engine/math/angles";
import type { MPerS, Seconds } from "../../engine/math/units";
import type { Vec2 } from "../../engine/math/vec2";
import type { Obb } from "../../engine/math/obb";
import type { ControlInput } from "../../engine/input/input-source";
import { obstacleFootprints, resolveRigCollision } from "../collision/collision-system";
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
import type { ExitLine } from "../level/level-types";
import { filledGrid, gridHeight, gridWidth, type TileGrid } from "../level/tile-types";

const DEFAULT_GRID = filledGrid(40, 40, 5, "asphalt");

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

export function createWorld(args: {
  cars: CarSpawn[];
  boundary: Obb[];
  catalog: VariantCatalog;
  solids?: Obb[];
  grid?: TileGrid;
  exit?: ExitLine | null;
  bounds?: { width: number; height: number };
}): World {
  const cars = args.cars.map(carStateFromSpawn);
  const drivableCount = cars.filter((c) => c.role === "drivable").length;
  if (drivableCount !== 1) {
    throw new RangeError(`World must have exactly one drivable car (found ${drivableCount})`);
  }
  const grid = args.grid ?? DEFAULT_GRID;
  return {
    cars,
    boundary: args.boundary,
    solids: args.solids ?? [],
    grid,
    exit: args.exit ?? null,
    bounds: args.bounds ?? { width: gridWidth(grid), height: gridHeight(grid) },
    catalog: args.catalog,
  };
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

/**
 * Advances only the drivable rig via `stepRig`, then resolves collision against every placed car
 * (and its trailer) and the boundary so the rig can never overlap or tunnel through them. Placed
 * cars are immovable.
 */
export function stepWorld(args: { world: World; input: ControlInput; dt: Seconds }): World {
  const { world, input, dt } = args;
  const prevRig = toRig(drivableCar(world));
  const sweptRig = stepRig({ rig: prevRig, input, dt, catalog: world.catalog });
  const { rig: resolvedRig } = resolveRigCollision({
    prevRig,
    sweptRig,
    obstacles: obstacleFootprints(world),
    catalog: world.catalog,
  });
  const steppedCar = fromRig(resolvedRig);
  const cars = world.cars.map((car) => (car.role === "drivable" ? steppedCar : car));
  return { ...world, cars };
}
