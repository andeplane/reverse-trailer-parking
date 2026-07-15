import type { Vec2 } from "../../engine/math/vec2";

/**
 * Authoring / serialisation shape of a level. Plain JSON-friendly data (angles in radians,
 * distances in metres, playfield centred on the origin). Converted to a runtime `World` by
 * `levelToWorld`. Adding a level = adding data.
 */

/** Static scenery/obstacle kinds. `grass` is decor; the rest are solid (collidable). */
export type PropKind = "curb" | "tree" | "grass" | "block";

export interface LevelProp {
  kind: PropKind;
  position: Vec2; // centre, metres
  rotation: number; // radians
  size: { width: number; length: number }; // metres
}

export interface LevelCar {
  variantId: string;
  position: Vec2; // rear-axle reference, metres
  heading: number; // radians
  trailerVariantId?: string;
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
  size: { width: number; height: number }; // playfield, centred at origin
  drivable: LevelCar; // exactly one
  placedCars: LevelCar[];
  props: LevelProp[];
  exit: ExitLine;
  parSeconds?: number;
}

/** Solid prop kinds that participate in collision. */
export const SOLID_PROP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(["curb", "tree", "block"]);

export function isSolidProp(kind: PropKind): boolean {
  return SOLID_PROP_KINDS.has(kind);
}
