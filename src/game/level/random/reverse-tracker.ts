import { clamp, normaliseAngle, type Radians } from "../../../engine/math/angles";
import type { Obb } from "../../../engine/math/obb";
import { add, midpoint, rotate, scale, sub, type Vec2 } from "../../../engine/math/vec2";
import { PLAY_DT } from "../../sandbox";
import { obstacleFootprints, resolveRigCollision, rigFootprints } from "../../collision/collision-system";
import { stepRig } from "../../vehicle/vehicle-model";
import { hitchWorld, trailerWheelWorldPositions } from "../../vehicle/vehicle-geometry";
import { drivableCar, findCarVariant, findTrailerVariant, fromRig, toRig, type VariantCatalog, type World } from "../../vehicle/vehicle-types";
import { hasRigCrossedExit } from "../win";
import { levelToWorld } from "../level-to-world";
import type { Level } from "../level-types";
import { localMargin, type DifficultyParams } from "./difficulty";
import type { RecordedPath } from "./drive-in";

/**
 * Verification replay (ADR-003): drive the recorded drive-in *backwards* through the real
 * `stepWorld` (collisions on) with a closed-loop trailer-backing cascade, and require the rig to
 * fully cross the exit. Only levels that pass ship.
 *
 * Control law (see design.md Phase 4 — signs verified for this codebase's convention
 * ψ = carHeading − trailerHeading, v < 0):
 *   e_y    = n̂ · (trailerAxle − ref)         n̂ = left normal of the FORWARD path tangent
 *   θᵗ_des = θ_tan + clamp(atan(k_y·e_y), ±0.5)
 *   ψ_des  = clamp(−k_θ·wrap(θᵗ_des − θᵗ), ±0.7·jackknifeMax)   // minus sign is load-bearing
 *   steer  = clamp(steer_ff + k_ψ·(ψ − ψ_des), ±steerMax)
 */

const K_Y = 0.35; // 1/m
const K_THETA = 2.2;
const K_PSI = 3;
const HEADING_CORRECTION_CAP = 0.5; // rad
const PSI_DES_FRACTION = 0.7;
const NOMINAL_REVERSE_SPEED = 3;
const SLOW_REVERSE_SPEED = 2;
const STALL_WINDOW_STEPS = 30;
const STALL_DISTANCE = 0.01;
const DEG = Math.PI / 180;

export type ReplayFailure = "timeout" | "cross-track" | "stall" | "jackknife";

export interface ReplayResult {
  won: boolean;
  seconds: number;
  reason: "won" | ReplayFailure;
}

function trailerAxleOf(world: World, catalog: VariantCatalog): Vec2 {
  const car = drivableCar(world);
  const carVariant = findCarVariant(catalog, car.variantId);
  if (!car.trailer) return car.rearAxle;
  const trailerVariant = findTrailerVariant(catalog, car.trailer.variantId);
  const wheels = trailerWheelWorldPositions(car.trailer, hitchWorld(car, carVariant), trailerVariant);
  return midpoint(wheels.l, wheels.r);
}

interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function aabbOf(obb: Obb): Aabb {
  const c = Math.abs(Math.cos(obb.rotation));
  const s = Math.abs(Math.sin(obb.rotation));
  const ex = obb.halfL * c + obb.halfW * s;
  const ey = obb.halfL * s + obb.halfW * c;
  return { minX: obb.center.x - ex, maxX: obb.center.x + ex, minY: obb.center.y - ey, maxY: obb.center.y + ey };
}

/**
 * Same semantics as `stepWorld`, but the (static) obstacle footprints are computed once and
 * AABB-prefiltered around the rig each step — the replay runs thousands of steps, and rebuilding
 * + SAT-testing every obstacle per step dominates generation time otherwise.
 */
function makeFastStepper(world: World): (current: World, input: { throttle: number; steer: number }) => World {
  const obstacles = obstacleFootprints(world);
  const obstacleAabbs = obstacles.map(aabbOf);
  return (current, input) => {
    const prevRig = toRig(drivableCar(current));
    const sweptRig = stepRig({ rig: prevRig, input, dt: PLAY_DT, catalog: current.catalog });
    const near: Obb[] = [];
    // Generous reach: rig half-diagonal (~3.5 m) + step + slack. Distant obstacles cannot
    // interact with this sub-step, so filtering them is semantics-preserving.
    const reach = 6;
    const cx = prevRig.car.rearAxle.x;
    const cy = prevRig.car.rearAxle.y;
    for (let i = 0; i < obstacles.length; i++) {
      const a = obstacleAabbs[i]!;
      if (a.maxX < cx - reach || a.minX > cx + reach || a.maxY < cy - reach || a.minY > cy + reach) continue;
      near.push(obstacles[i]!);
    }
    const { rig } = resolveRigCollision({ prevRig, sweptRig, obstacles: near, catalog: current.catalog });
    const steppedCar = fromRig(rig);
    return { ...current, cars: current.cars.map((c) => (c.role === "drivable" ? steppedCar : c)) };
  };
}

export function replaySolutionReverse(args: {
  level: Level;
  path: RecordedPath;
  params: DifficultyParams;
  catalog: VariantCatalog;
  /** Corridor margin multiplier used when the level was decorated (relax-and-retry). */
  marginScale?: number;
  /** Observes every stepped world (the initial state first) — e.g. the menu's autopilot demo. */
  onStep?: (world: World) => void;
}): ReplayResult {
  const { level, path, params, catalog, onStep } = args;
  const marginScale = args.marginScale ?? 1;
  const dt = PLAY_DT;
  const samples = path.samples;
  if (samples.length < 2 || !level.exit) return { won: false, seconds: 0, reason: "timeout" };

  let world = levelToWorld(level, catalog);
  onStep?.(world);
  const fastStep = makeFastStepper(world);
  const carVariant = findCarVariant(catalog, level.drivable.variantId);
  const steerMax = carVariant.steerMax;
  const jackknifeMax = carVariant.jackknifeMax;

  const budgetSeconds = 2.5 * (path.arcLength / NOMINAL_REVERSE_SPEED) + 5;
  const maxSteps = Math.ceil(budgetSeconds / dt);

  // Reference progress: arc position along the recording, decreasing from the end (player start).
  let sExpected = path.arcLength;
  let refIndex = samples.length - 1;
  let stallAccum = 0;
  let stallSteps = 0;

  for (let step = 0; step < maxSteps; step++) {
    const car = drivableCar(world);
    const psi = car.trailer ? normaliseAngle(car.heading - car.trailer.heading) : (0 as Radians);
    const trailerAxle = trailerAxleOf(world, catalog);

    // Windowed reference lookup around expected progress (never snap to a far branch).
    while (refIndex > 0 && samples[refIndex]!.s > sExpected) refIndex--;
    let best = refIndex;
    let bestDist = Infinity;
    for (let i = Math.max(0, refIndex - 200); i <= Math.min(samples.length - 1, refIndex + 200); i++) {
      const d = sub(samples[i]!.trailerAxle, trailerAxle);
      const dist = d.x * d.x + d.y * d.y;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    const ref = samples[best]!;

    // Reference point/tangent — straight-line extrapolation beyond the recording start (s < 0
    // is the outside-the-exit run-out; the recording began fully outside, so this stays short).
    let refPoint = ref.trailerAxle;
    const refTangent = ref.trailerHeading;
    let steerFf = ref.steer;
    if (best === 0 && sExpected < samples[0]!.s) {
      const back = samples[0]!.s - sExpected;
      refPoint = add(samples[0]!.trailerAxle, scale(rotate({ x: 1, y: 0 }, refTangent as Radians), -back));
      steerFf = 0;
    }

    const nHat = rotate({ x: 0, y: 1 }, refTangent as Radians);
    const err = sub(trailerAxle, refPoint);
    const eY = nHat.x * err.x + nHat.y * err.y;

    const distFromStart = path.arcLength - ref.s;
    const margin = localMargin({ baseMargin: params.baseMargin, distFromStart }) * marginScale;
    if (Math.abs(eY) > Math.max(0.35, 0.5 * margin)) {
      return { won: false, seconds: step * dt, reason: "cross-track" };
    }
    if (Math.abs(psi) >= jackknifeMax - 3 * DEG) {
      return { won: false, seconds: step * dt, reason: "jackknife" };
    }

    const trailerHeading = car.trailer?.heading ?? car.heading;
    const thetaDes = refTangent + clamp(Math.atan(K_Y * eY), -HEADING_CORRECTION_CAP, HEADING_CORRECTION_CAP);
    const psiDes = clamp(
      -K_THETA * normaliseAngle(thetaDes - trailerHeading),
      -PSI_DES_FRACTION * jackknifeMax,
      PSI_DES_FRACTION * jackknifeMax,
    );
    const steer = clamp(steerFf + K_PSI * (psi - psiDes), -steerMax, steerMax);

    const targetSpeed =
      Math.abs(steerFf) > 0.3 * steerMax || Math.abs(eY) > 0.3 * margin ? SLOW_REVERSE_SPEED : NOMINAL_REVERSE_SPEED;
    const throttle = car.speed > -targetSpeed ? -1 : 0;

    const before = drivableCar(world).rearAxle;
    world = fastStep(world, { throttle, steer: steer / steerMax });
    onStep?.(world);
    const after = drivableCar(world);
    const moved = Math.hypot(after.rearAxle.x - before.x, after.rearAxle.y - before.y);
    sExpected = Math.max(sExpected - moved, -20);

    // Arc-progress stall: catches jackknife bind (invisible in the returned state) and head-on
    // collision dead-stops that have near-zero cross-track error.
    if (throttle === -1) {
      stallAccum += moved;
      stallSteps++;
      if (stallSteps >= STALL_WINDOW_STEPS) {
        if (stallAccum < STALL_DISTANCE) return { won: false, seconds: (step + 1) * dt, reason: "stall" };
        stallAccum = 0;
        stallSteps = 0;
      }
    } else {
      stallAccum = 0;
      stallSteps = 0;
    }

    if (hasRigCrossedExit(rigFootprints(toRig(after), catalog), level.exit)) {
      return { won: true, seconds: (step + 1) * dt, reason: "won" };
    }
  }
  return { won: false, seconds: maxSteps * dt, reason: "timeout" };
}
