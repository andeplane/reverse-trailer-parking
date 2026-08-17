import { clamp, normaliseAngle, safeTan, type Radians } from "../../engine/math/angles";
import type { MPerS, Seconds } from "../../engine/math/units";
import { clampControlInput, type ControlInput } from "../../engine/input/input-source";
import { deriveCarGeometry, deriveTrailerGeometry } from "./vehicle-geometry";
import { findCarVariant, findTrailerVariant, type Rig, type VariantCatalog } from "./vehicle-types";

function moveToward(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** One kinematic step plus what happened to the articulation during it. */
export interface RigStep {
  rig: Rig;
  /** True when the step folded the trailer past its jackknife limit and the rig bound (car
   * stopped dead). Callers that model damage charge for it — see `world.ts`. */
  jackknifed: boolean;
}

/**
 * Pure kinematics-only step: bicycle model for the car + one-trailer articulation.
 * No collision — see `world.ts`/`collision-system.ts` for that.
 */
export function stepRig(args: { rig: Rig; input: ControlInput; dt: Seconds; catalog: VariantCatalog }): Rig {
  return stepRigWithStatus(args).rig;
}

/** As `stepRig`, but also reports whether the rig bound at its jackknife limit this step. */
export function stepRigWithStatus(args: {
  rig: Rig;
  input: ControlInput;
  dt: Seconds;
  catalog: VariantCatalog;
}): RigStep {
  const { rig, dt, catalog } = args;
  const input = clampControlInput(args.input);
  const carVariant = findCarVariant(catalog, rig.car.variantId);
  const { wheelbase, hitchOffset } = deriveCarGeometry(carVariant);

  // 1. Speed: accelerate toward throttle, or brake to exactly 0 when coasting.
  let speed = rig.car.speed as number;
  if (input.throttle !== 0) {
    speed += input.throttle * carVariant.accel * dt;
  } else if (speed > 0) {
    speed = Math.max(0, speed - carVariant.brake * dt);
  } else if (speed < 0) {
    speed = Math.min(0, speed + carVariant.brake * dt);
  }
  speed = clamp(speed, -carVariant.maxSpeedReverse, carVariant.maxSpeedForward);

  // 2. Steer: slew toward target, clamp to steerMax.
  const targetSteer = input.steer * carVariant.steerMax;
  const steer = clamp(
    moveToward(rig.car.steer, targetSteer, carVariant.steerRate * dt),
    -carVariant.steerMax,
    carVariant.steerMax,
  ) as Radians;

  // 3. Car pose: no-side-slip bicycle model, rear-axle reference.
  const heading = rig.car.heading;
  const headingRate = (speed / wheelbase) * safeTan(steer);
  const rearAxle = {
    x: rig.car.rearAxle.x + speed * Math.cos(heading) * dt,
    y: rig.car.rearAxle.y + speed * Math.sin(heading) * dt,
  };
  const newHeading = normaliseAngle(heading + headingRate * dt);

  // 4. Trailer articulation (if towed) + 5. jackknife stop.
  let trailer = rig.trailer;
  if (trailer) {
    const trailerVariant = findTrailerVariant(catalog, trailer.variantId);
    const { trailerLength } = deriveTrailerGeometry(trailerVariant);
    const psi0 = heading - trailer.heading;
    const trailerHeadingRate =
      (speed / trailerLength) * Math.sin(psi0) - (hitchOffset / trailerLength) * headingRate * Math.cos(psi0);
    const unclampedHeading = normaliseAngle(trailer.heading + trailerHeadingRate * dt);
    const psi = normaliseAngle(newHeading - unclampedHeading);

    // The trailer runs on rolling (no-side-slip) wheels, so we must NOT force its angle by rotating
    // it about the hitch (that would slide the axle sideways). Instead, when the car's motion would
    // fold the articulation past the mechanical jackknife limit, the rig binds: block that motion
    // (stop the car) — you have to pull forward to recover.
    if (Math.abs(psi) > carVariant.jackknifeMax) {
      return {
        rig: {
          car: { ...rig.car, speed: 0 as MPerS, steer },
          trailer: rig.trailer,
        },
        jackknifed: true,
      };
    }

    trailer = { ...trailer, heading: unclampedHeading };
  }

  return {
    rig: {
      car: {
        ...rig.car,
        rearAxle,
        heading: newHeading,
        speed: speed as MPerS,
        steer,
        trailer,
      },
      trailer,
    },
    jackknifed: false,
  };
}
