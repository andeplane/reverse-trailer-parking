import type { Radians } from "../../engine/math/angles";
import type { MPerS } from "../../engine/math/units";
import { drivableCar, type World } from "../vehicle/vehicle-types";

/** A reproducible snapshot of the drivable rig, encoded into the URL when debug mode is on. */
export interface DebugState {
  levelId: string;
  x: number;
  y: number;
  heading: number;
  speed: number;
  steer: number;
  trailerHeading: number | null;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The drivable rig's current state, for encoding. */
export function debugStateOf(world: World, levelId: string): DebugState {
  const car = drivableCar(world);
  return {
    levelId,
    x: round(car.rearAxle.x),
    y: round(car.rearAxle.y),
    heading: round(car.heading),
    speed: round(car.speed),
    steer: round(car.steer),
    trailerHeading: car.trailer ? round(car.trailer.heading) : null,
  };
}

/** Encodes a debug state as a URL query string (including the leading "?"). */
export function encodeDebugState(s: DebugState): string {
  const p = new URLSearchParams();
  p.set("dbg", s.levelId);
  p.set("x", String(s.x));
  p.set("y", String(s.y));
  p.set("h", String(s.heading));
  p.set("v", String(s.speed));
  p.set("s", String(s.steer));
  if (s.trailerHeading !== null) p.set("t", String(s.trailerHeading));
  return `?${p.toString()}`;
}

/** Parses a debug state from a URL query string; null if the `dbg` marker is absent or malformed. */
export function parseDebugState(search: string): DebugState | null {
  const p = new URLSearchParams(search);
  const levelId = p.get("dbg");
  if (!levelId) return null;
  const num = (key: string): number => Number(p.get(key));
  const required = ["x", "y", "h", "v", "s"];
  if (required.some((k) => p.get(k) === null || !Number.isFinite(num(k)))) return null;
  const t = p.get("t");
  return {
    levelId,
    x: num("x"),
    y: num("y"),
    heading: num("h"),
    speed: num("v"),
    steer: num("s"),
    trailerHeading: t !== null && Number.isFinite(Number(t)) ? Number(t) : null,
  };
}

/** Returns a copy of the world with the drivable rig set to the given debug state. */
export function applyDebugState(world: World, s: DebugState): World {
  const cars = world.cars.map((car) => {
    if (car.role !== "drivable") return car;
    return {
      ...car,
      rearAxle: { x: s.x, y: s.y },
      heading: s.heading as Radians,
      speed: s.speed as MPerS,
      steer: s.steer as Radians,
      trailer:
        car.trailer && s.trailerHeading !== null
          ? { ...car.trailer, heading: s.trailerHeading as Radians }
          : car.trailer,
    };
  });
  return { ...world, cars };
}
