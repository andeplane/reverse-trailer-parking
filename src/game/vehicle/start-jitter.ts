import { normaliseAngle, type Radians } from "../../engine/math/angles";
import { obbOverlap } from "../../engine/math/obb";
import { obstacleFootprints, rigFootprints } from "../collision/collision-system";
import { drivableCar, toRig, type CarState, type World } from "./vehicle-types";

/** Largest start-of-run hitch angle, in radians: the trailer begins folded within ±3° of the car. */
export const MAX_START_HITCH_JITTER = ((3 * Math.PI) / 180) as Radians;

function withTrailerHeading(car: CarState, heading: Radians): CarState {
  return car.trailer ? { ...car, trailer: { ...car.trailer, heading } } : car;
}

/**
 * True when the drivable rig, with its trailer folded to `heading`, touches nothing. Cheap enough
 * to run a couple of times at level load; it only exists to veto a jitter that would start the
 * trailer inside a wall.
 */
function isTrailerClear(world: World, car: CarState, heading: Radians): boolean {
  const footprints = rigFootprints(toRig(withTrailerHeading(car, heading)), world.catalog);
  const obstacles = obstacleFootprints(world);
  return !footprints.some((f) => obstacles.some((o) => obbOverlap(f, o.obb)));
}

/**
 * Folds the drivable rig's trailer a random ±3° off the car so a run never starts perfectly
 * collinear — a dead-straight rig is both unrealistic and a freebie, since the first correction
 * only ever comes from the player's own steering.
 *
 * The roll is injectable (`random`) so simulation stays deterministic where it must be: the
 * random-level generator and its verification replay build worlds straight from `levelToWorld`
 * and never come through here. If neither sign of the jitter leaves the trailer clear of walls,
 * cars and kerbs, the world is returned untouched rather than starting the player in a collision.
 */
export function jitterStartHitch(args: { world: World; random?: () => number }): World {
  const { world } = args;
  const random = args.random ?? Math.random;
  const car = drivableCar(world);
  if (!car.trailer) return world;

  const jitter = (random() * 2 - 1) * MAX_START_HITCH_JITTER;
  for (const offset of [jitter, -jitter]) {
    const heading = normaliseAngle(car.trailer.heading + offset);
    if (isTrailerClear(world, car, heading)) {
      const jittered = withTrailerHeading(car, heading);
      return { ...world, cars: world.cars.map((c) => (c.role === "drivable" ? jittered : c)) };
    }
  }
  return world;
}
