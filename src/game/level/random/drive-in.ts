import { clamp, normaliseAngle, type Radians } from "../../../engine/math/angles";
import type { Obb } from "../../../engine/math/obb";
import { obbOverlap } from "../../../engine/math/obb";
import type { Rng } from "../../../engine/math/rng";
import { rngRange } from "../../../engine/math/rng";
import { add, length, midpoint, normalise, rotate, scale, sub, type Vec2 } from "../../../engine/math/vec2";
import { PLAY_DT } from "../../sandbox";
import { rigFootprints } from "../../collision/collision-system";
import { stepRig } from "../../vehicle/vehicle-model";
import { deriveCarGeometry, trailerWheelWorldPositions, hitchWorld } from "../../vehicle/vehicle-geometry";
import { findCarVariant, findTrailerVariant, type Rig, type VariantCatalog } from "../../vehicle/vehicle-types";
import { createInitialRig } from "../../vehicle/world";
import type { ExitLine } from "../level-types";
import type { TileGrid } from "../tile-types";
import type { DifficultyParams } from "./difficulty";

/**
 * The forward "drive-in": simulate the rig driving in through the exit gap into the empty lot with
 * the game's own kinematics, recording the swept path. The recording's final pose becomes the
 * player start; the recording itself (time-reversed) is the level's guaranteed solution. See
 * `specs/003-random-levels/design.md` Phase 2.
 */

export interface PathSample {
  /** Cumulative rear-axle arc length from the recording start, metres. */
  s: number;
  rearAxle: Vec2;
  heading: number;
  trailerHeading: number;
  /** Hitch articulation angle ψ = carHeading − trailerHeading. */
  psi: number;
  /** ACHIEVED steer (post-slew), the reversible quantity — not the commanded input. */
  steer: number;
  /** Trailer axle centre in world space (the reverse tracker's reference point). */
  trailerAxle: Vec2;
  carObb: Obb;
  trailerObb: Obb;
}

export interface RecordedPath {
  samples: PathSample[];
  arcLength: number;
  durationSeconds: number;
  finalRig: Rig;
}

/** Forward steering is capped below the jackknife safety clamp: at 0.64·steerMax the steady-state
 * hitch angle is ≈0.45·jackknifeMax, leaving real headroom (0.8 would collide with the clamp). */
export const STEER_CAP_FRACTION = 0.64;
const PSI_SAFETY_FRACTION = 0.6;
const CRUISE_SPEED = 3;
const LOOKAHEAD = 4.5;
const WAYPOINT_RADIUS = 2;
const MAX_CHAINS = 8;
const WAYPOINT_TIME_BUDGET_S = 15;
const DOCK_TIME_BUDGET_S = 20;
const DEG = Math.PI / 180;

interface RigGeometry {
  wheelbase: number;
  frontOverhang: number;
  jackknifeMax: number;
  steerMax: number;
  effectiveRadius: number;
}

function rigGeometry(catalog: VariantCatalog, carVariantId: string): RigGeometry {
  const variant = findCarVariant(catalog, carVariantId);
  const { wheelbase, rearAxleCentre } = deriveCarGeometry(variant);
  return {
    wheelbase,
    frontOverhang: variant.bodyLength / 2 - rearAxleCentre.x,
    jackknifeMax: variant.jackknifeMax,
    steerMax: variant.steerMax,
    effectiveRadius: wheelbase / Math.tan(STEER_CAP_FRACTION * variant.steerMax),
  };
}

/** Two segments p1–p2 / p3–p4 properly intersect. */
function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d = (a: Vec2, b: Vec2, c: Vec2): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function chainSelfIntersects(points: Vec2[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 2; j < points.length - 1; j++) {
      if (segmentsIntersect(points[i]!, points[i + 1]!, points[j]!, points[j + 1]!)) return true;
    }
  }
  return false;
}

/** Sample a feasible waypoint chain: bounded turns coupled to turning-radius feasibility, biased
 * to the central interior, non-self-intersecting, ending in a long near-straight APPROACH leg
 * (so the rig arrives at the dock already straightened, with room beyond and not aimed back at
 * the exit). Returns null when sampling fails. */
function sampleWaypointChain(args: {
  start: Vec2;
  startDir: Vec2;
  exitMid: Vec2;
  bounds: { width: number; height: number };
  params: DifficultyParams;
  geometry: RigGeometry;
  rng: Rng;
}): Vec2[] | null {
  const { start, startDir, exitMid, bounds, params, geometry, rng } = args;
  const count = params.waypointsMin + Math.floor(rng.next() * (params.waypointsMax - params.waypointsMin + 1));
  // Waypoints stay well off the walls (no wall-hugging corridors; docking needs room).
  const inset = 6;
  const maxX = bounds.width / 2 - inset;
  const maxY = bounds.height / 2 - inset;
  const roomAlong = (from: Vec2, dir: Vec2): number => {
    let room = Infinity;
    if (dir.x > 1e-9) room = Math.min(room, (bounds.width / 2 - from.x) / dir.x);
    if (dir.x < -1e-9) room = Math.min(room, (-bounds.width / 2 - from.x) / dir.x);
    if (dir.y > 1e-9) room = Math.min(room, (bounds.height / 2 - from.y) / dir.y);
    if (dir.y < -1e-9) room = Math.min(room, (-bounds.height / 2 - from.y) / dir.y);
    return room;
  };

  const points: Vec2[] = [start];
  let dir = startDir;
  let position = start;

  /** Polar leg sample: distance + heading change within `cap`, with a 60% bias that curls the
   * chain back toward the lot centre (so chains don't march into a corner and die). */
  const sampleLeg = (distMin: number, distMax: number, cap: number): { next: Vec2; dir: Vec2 } | null => {
    const baseAngle = Math.atan2(dir.y, dir.x);
    const dist = rngRange({ rng, min: distMin, max: distMax });
    const feasibleCap = Math.min(cap, dist / (1.25 * geometry.effectiveRadius));
    let angle: number;
    if (rng.next() < 0.6) {
      const toCentre = Math.atan2(-position.y, -position.x);
      angle = baseAngle + clamp(normaliseAngle(toCentre - baseAngle), -feasibleCap, feasibleCap) * rng.next();
    } else {
      angle = baseAngle + rngRange({ rng, min: -feasibleCap, max: feasibleCap });
    }
    const legDir = { x: Math.cos(angle), y: Math.sin(angle) };
    const next = add(position, scale(legDir, dist));
    if (Math.abs(next.x) > maxX || Math.abs(next.y) > maxY) return null;
    return { next, dir: legDir };
  };

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 30 && !placed; attempt++) {
      const leg = sampleLeg(4, 12, params.maxTurn);
      if (!leg) continue;
      points.push(leg.next);
      dir = leg.dir;
      position = leg.next;
      placed = true;
    }
    // A cornered chain keeps what it has (>= the difficulty minimum) rather than dying.
    if (!placed) {
      if (i < params.waypointsMin) return null;
      break;
    }
  }

  // Final approach leg: gentle turn, long, with straightening room beyond, not aimed at the gap.
  let approachPlaced = false;
  for (let attempt = 0; attempt < 60 && !approachPlaced; attempt++) {
    const leg = sampleLeg(6, 12, 50 * DEG);
    if (!leg) continue;
    if (roomAlong(leg.next, leg.dir) < geometry.frontOverhang + 4.5) continue;
    const reverseDir = scale(leg.dir, -1);
    const toExit = normalise(sub(exitMid, leg.next));
    const aim = Math.acos(clamp(reverseDir.x * toExit.x + reverseDir.y * toExit.y, -1, 1));
    if (aim < 25 * DEG) continue;
    points.push(leg.next);
    approachPlaced = true;
  }
  if (!approachPlaced) {
    return null;
  }

  if (chainSelfIntersects(points)) {
    return null;
  }
  return points.slice(1);
}

/** Pure-pursuit steer command toward a target point (positive = CCW, matching the model). */
function pursuitSteer(args: { rig: Rig; target: Vec2; geometry: RigGeometry }): number {
  const { rig, target, geometry } = args;
  const to = sub(target, rig.car.rearAxle);
  const dist = Math.max(1, length(to));
  const alpha = normaliseAngle(Math.atan2(to.y, to.x) - rig.car.heading);
  const steer = Math.atan2(2 * geometry.wheelbase * Math.sin(alpha), Math.max(dist, LOOKAHEAD));
  const cap = STEER_CAP_FRACTION * geometry.steerMax;
  return clamp(steer, -cap, cap);
}

function psiOf(rig: Rig): number {
  return rig.trailer ? normaliseAngle(rig.car.heading - rig.trailer.heading) : 0;
}

function sampleOf(rig: Rig, s: number, catalog: VariantCatalog): PathSample {
  const carVariant = findCarVariant(catalog, rig.car.variantId);
  const footprints = rigFootprints(rig, catalog);
  const trailerVariant = rig.trailer ? findTrailerVariant(catalog, rig.trailer.variantId) : null;
  const trailerAxle =
    rig.trailer && trailerVariant
      ? (() => {
          const wheels = trailerWheelWorldPositions(rig.trailer, hitchWorld(rig.car, carVariant), trailerVariant);
          return midpoint(wheels.l, wheels.r);
        })()
      : rig.car.rearAxle;
  return {
    s,
    rearAxle: rig.car.rearAxle,
    heading: rig.car.heading,
    trailerHeading: rig.trailer?.heading ?? rig.car.heading,
    psi: psiOf(rig),
    steer: rig.car.steer,
    trailerAxle,
    carObb: footprints[0]!,
    trailerObb: footprints[1] ?? footprints[0]!,
  };
}

/** Signed distance of the rig's rearmost footprint corner along the exit's outward normal. */
function rearmostOutwardDistance(rig: Rig, exit: ExitLine, catalog: VariantCatalog): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const obb of rigFootprints(rig, catalog)) {
    const fwd = rotate({ x: 1, y: 0 }, obb.rotation);
    const left = rotate({ x: 0, y: 1 }, obb.rotation);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const corner = add(obb.center, add(scale(fwd, sx * obb.halfL), scale(left, sy * obb.halfW)));
        const dist = (corner.x - exit.a.x) * exit.outward.x + (corner.y - exit.a.y) * exit.outward.y;
        max = Math.max(max, dist);
      }
    }
  }
  return max;
}

/**
 * Simulates one drive-in attempt with the given waypoints. Returns the recording, or null when
 * the attempt hits a wall, stalls, or fails its budgets/acceptance floors.
 */
function simulateChain(args: {
  waypoints: Vec2[];
  exit: ExitLine;
  boundary: Obb[];
  grid: TileGrid;
  catalog: VariantCatalog;
  carVariantId: string;
  trailerVariantId: string;
  params: DifficultyParams;
  geometry: RigGeometry;
}): RecordedPath | null {
  const { waypoints, exit, boundary, grid, catalog, carVariantId, trailerVariantId, params, geometry } = args;
  const dt = PLAY_DT;
  const exitMid = midpoint(exit.a, exit.b);
  const inward = scale(exit.outward, -1);
  const heading = Math.atan2(inward.y, inward.x) as Radians;

  let rig = createInitialRig({
    variantId: carVariantId,
    trailerVariantId,
    position: add(exitMid, scale(exit.outward, geometry.frontOverhang + 0.2)),
    heading,
  });

  const samples: PathSample[] = [sampleOf(rig, 0, catalog)];
  let s = 0;
  let phase: "run-in" | "waypoints" | "dock" | "stop" = "run-in";
  let waypointIndex = 0;
  let phaseElapsed = 0;
  let straightLeft = params.extraStraight;
  let insideReached = false;
  // Docking state (assigned when the dock phase starts).
  let dockMode: "lane" | "free" = "free";
  let laneAxisHeading = 0;
  let laneCoord = 0;
  let laneAlongX = true;

  const halfW = (grid.cols * grid.tileSize) / 2;
  const halfH = (grid.rows * grid.tileSize) / 2;
  /** Distance from a point to the boundary along a direction (straight-line travel room). */
  const roomAlong = (from: Vec2, dir: Vec2): number => {
    let room = Infinity;
    if (dir.x > 1e-9) room = Math.min(room, (halfW - from.x) / dir.x);
    if (dir.x < -1e-9) room = Math.min(room, (-halfW - from.x) / dir.x);
    if (dir.y > 1e-9) room = Math.min(room, (halfH - from.y) / dir.y);
    if (dir.y < -1e-9) room = Math.min(room, (-halfH - from.y) / dir.y);
    return room;
  };

  const totalBudgetSteps = Math.ceil(180 / dt);
  for (let step = 0; step < totalBudgetSteps; step++) {
    let steerCmd = 0;
    const cruise = phase === "dock" ? 2 : CRUISE_SPEED;
    let throttle = Math.abs(rig.car.speed) < cruise ? 1 : 0;

    if (phase === "run-in") {
      steerCmd = 0;
      if (!insideReached && rearmostOutwardDistance(rig, exit, catalog) < -1) insideReached = true;
      if (insideReached) {
        straightLeft -= Math.abs(rig.car.speed) * dt;
        if (straightLeft <= 0) {
          phase = "waypoints";
          phaseElapsed = 0;
        }
      }
    } else if (phase === "waypoints") {
      const target = waypoints[waypointIndex]!;
      steerCmd = pursuitSteer({ rig, target, geometry });
      if (length(sub(target, rig.car.rearAxle)) < WAYPOINT_RADIUS) {
        waypointIndex++;
        phaseElapsed = 0;
        if (waypointIndex >= waypoints.length) {
          phase = "dock";
          phaseElapsed = 0;
          // Pick the best dock axis: any of the 4 within a 60° turn, ranked by room slack
          // (turning consumes room). No viable axis → "free dock": straighten along the current
          // heading without a lane snap (the bay dressing is optional polish, ψ ≈ 0 is not).
          dockMode = "free";
          let bestSlack = -Infinity;
          for (let k = 0; k < 4; k++) {
            const axis = (k * Math.PI) / 2 - Math.PI / 2; // -90°, 0°, 90°, 180°
            const turn = Math.abs(normaliseAngle(rig.car.heading - axis));
            if (turn > 60 * DEG) continue;
            const dir = { x: Math.cos(axis), y: Math.sin(axis) };
            const needed = geometry.frontOverhang + 4 + 6 * (turn / (Math.PI / 2));
            const slack = roomAlong(rig.car.rearAxle, dir) - needed;
            if (slack > bestSlack) {
              bestSlack = slack;
              laneAxisHeading = axis;
            }
          }
          if (bestSlack > 0) {
            dockMode = "lane";
            laneAlongX = Math.abs(Math.cos(laneAxisHeading)) > 0.5;
            const tile = grid.tileSize;
            if (laneAlongX) {
              const row = clamp(Math.round((halfH - rig.car.rearAxle.y) / tile - 0.5), 2, grid.rows - 3);
              laneCoord = halfH - (row + 0.5) * tile;
            } else {
              const col = clamp(Math.round((rig.car.rearAxle.x + halfW) / tile - 0.5), 2, grid.cols - 3);
              laneCoord = -halfW + (col + 0.5) * tile;
            }
          }
        }
      } else if (phaseElapsed > WAYPOINT_TIME_BUDGET_S) {
        return null;
      }
    } else if (phase === "dock") {
      const headingDir = rotate({ x: 1, y: 0 }, rig.car.heading);
      let straightened: boolean;
      if (dockMode === "lane") {
        const dirX = Math.cos(laneAxisHeading);
        const dirY = Math.sin(laneAxisHeading);
        const target: Vec2 = laneAlongX
          ? { x: rig.car.rearAxle.x + Math.sign(dirX) * LOOKAHEAD, y: laneCoord }
          : { x: laneCoord, y: rig.car.rearAxle.y + Math.sign(dirY) * LOOKAHEAD };
        steerCmd = pursuitSteer({ rig, target, geometry });
        const headingErr = Math.abs(normaliseAngle(rig.car.heading - laneAxisHeading));
        const lateralErr = laneAlongX
          ? Math.abs(rig.car.rearAxle.y - laneCoord)
          : Math.abs(rig.car.rearAxle.x - laneCoord);
        straightened = headingErr < 2 * DEG && lateralErr < 0.15 && Math.abs(psiOf(rig)) < 2 * DEG;
      } else {
        // Free dock: wheels straight, wait for the trailer to self-align.
        steerCmd = 0;
        straightened = Math.abs(psiOf(rig)) < 2 * DEG;
      }
      // Stop before running out of room: straight-but-undocked is acceptable, a wall hit is not.
      const brakeDistance = (rig.car.speed * rig.car.speed) / (2 * 6 * 0.8);
      const nearWall = roomAlong(rig.car.rearAxle, headingDir) - geometry.frontOverhang < 1.0 + brakeDistance;
      if (nearWall && Math.abs(psiOf(rig)) >= 3 * DEG) {
        return null;
      }
      if (straightened || nearWall || phaseElapsed > DOCK_TIME_BUDGET_S) {
        phase = "stop";
      }
    } else {
      // stop: coast-brake to a standstill, keeping the wheels straight.
      steerCmd = 0;
      throttle = 0;
      if (rig.car.speed === 0) break;
    }

    // Jackknife safety: let the trailer self-straighten before continuing to turn.
    if (Math.abs(psiOf(rig)) > PSI_SAFETY_FRACTION * geometry.jackknifeMax) steerCmd = 0;

    rig = stepRig({
      rig,
      input: { throttle, steer: steerCmd / geometry.steerMax },
      dt,
      catalog,
    });
    phaseElapsed += dt;
    s += Math.abs(rig.car.speed) * dt;
    samples.push(sampleOf(rig, s, catalog));

    // Never touch the boundary walls — the corridor cannot protect against them.
    if (phase !== "run-in" && rigFootprints(rig, catalog).some((f) => boundary.some((b) => obbOverlap(f, b)))) {
      return null;
    }
  }

  if (phase !== "stop" || rig.car.speed !== 0) return null;
  if (Math.abs(psiOf(rig)) >= 3 * DEG) return null;

  // Acceptance floors: arc length, start↔exit separation, spread, and no trivially-aimed start.
  if (s < params.minArcLength) return null;
  if (length(sub(rig.car.rearAxle, exitMid)) < params.minStartExitDistance) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const sample of samples) {
    minX = Math.min(minX, sample.rearAxle.x);
    maxX = Math.max(maxX, sample.rearAxle.x);
    minY = Math.min(minY, sample.rearAxle.y);
    maxY = Math.max(maxY, sample.rearAxle.y);
  }
  const gridW = grid.cols * grid.tileSize;
  const gridH = grid.rows * grid.tileSize;
  if (maxX - minX < 0.45 * gridW && maxY - minY < 0.45 * gridH) return null;
  const reverseDir = rotate({ x: 1, y: 0 }, (rig.car.heading + Math.PI) as Radians);
  const toExit = normalise(sub(exitMid, rig.car.rearAxle));
  const aimAngle = Math.acos(clamp(reverseDir.x * toExit.x + reverseDir.y * toExit.y, -1, 1));
  if (aimAngle < 20 * DEG) return null;

  // samples holds the initial pose plus one per step, so steps = samples.length - 1.
  return { samples, arcLength: s, durationSeconds: (samples.length - 1) * dt, finalRig: rig };
}

/** Records a drive-in for the given lot skeleton; retries waypoint chains deterministically from
 * the injected RNG. Returns null when no acceptable chain is found (caller re-rolls the seed). */
export function recordDriveIn(args: {
  exit: ExitLine;
  boundary: Obb[];
  grid: TileGrid;
  catalog: VariantCatalog;
  carVariantId: string;
  trailerVariantId: string;
  params: DifficultyParams;
  rng: Rng;
}): RecordedPath | null {
  const { exit, boundary, grid, catalog, carVariantId, trailerVariantId, params, rng } = args;
  const geometry = rigGeometry(catalog, carVariantId);
  const exitMid = midpoint(exit.a, exit.b);
  const inward = scale(exit.outward, -1);
  // Approximate point where steering unlocks (rig fully inside + extra straight).
  const runIn = geometry.frontOverhang + 7 + params.extraStraight;
  const chainStart = add(exitMid, scale(inward, runIn));

  for (let chain = 0; chain < MAX_CHAINS; chain++) {
    const waypoints = sampleWaypointChain({
      start: chainStart,
      startDir: inward,
      exitMid,
      bounds: { width: grid.cols * grid.tileSize, height: grid.rows * grid.tileSize },
      params,
      geometry,
      rng,
    });
    if (!waypoints) continue;
    const recorded = simulateChain({
      waypoints,
      exit,
      boundary,
      grid,
      catalog,
      carVariantId,
      trailerVariantId,
      params,
      geometry,
    });
    if (recorded) return recorded;
  }
  return null;
}
