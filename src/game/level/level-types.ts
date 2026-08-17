import type { Vec2 } from "../../engine/math/vec2";
import type { TileGrid } from "./tile-types";

/**
 * Authoring / serialisation shape of a level. Plain JSON-friendly data (angles in radians,
 * distances in metres). The map is a **tile grid**; cars and the exit are objects placed on top.
 * Converted to a runtime `World` by `levelToWorld`.
 */

export interface LevelCar {
  variantId: string;
  position: Vec2; // rear-axle reference, metres
  heading: number; // radians
  trailerVariantId?: string;
  /** Paint, 0xRRGGBB (the art is white and tinted). Omitted → the default lot paint; the player's
   * rig is always red whatever this says. See `vehicle/car-colours.ts`. */
  colour?: number;
}

/** Exit gate: a line segment a–b with a unit `outward` normal pointing to the winning side. */
export interface ExitLine {
  a: Vec2;
  b: Vec2;
  outward: Vec2; // unit normal toward "outside"
}

export interface Level {
  id: string;
  name: string;
  grid: TileGrid;
  drivable: LevelCar; // exactly one
  placedCars: LevelCar[];
  exit: ExitLine;
  parSeconds?: number;
}
