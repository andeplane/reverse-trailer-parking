import { findCarVariant, findTrailerVariant, type VariantCatalog } from "../vehicle/vehicle-types";
import type { ExitLine, Level, LevelCar, LevelProp, PropKind } from "./level-types";

const PROP_KINDS: ReadonlySet<string> = new Set<PropKind>(["curb", "tree", "grass", "block"]);

function validateCar(car: LevelCar, catalog: VariantCatalog, label: string): void {
  findCarVariant(catalog, car.variantId); // throws if unknown
  if (car.trailerVariantId !== undefined) findTrailerVariant(catalog, car.trailerVariantId);
  if (!Number.isFinite(car.position.x) || !Number.isFinite(car.position.y)) {
    throw new RangeError(`${label}: position must be finite`);
  }
  if (!Number.isFinite(car.heading)) throw new RangeError(`${label}: heading must be finite`);
}

function validateProp(prop: LevelProp, i: number): void {
  if (!PROP_KINDS.has(prop.kind)) throw new RangeError(`prop[${i}]: unknown kind "${prop.kind}"`);
  if (!(prop.size.width > 0) || !(prop.size.length > 0)) {
    throw new RangeError(`prop[${i}]: size must be positive`);
  }
  if (!Number.isFinite(prop.position.x) || !Number.isFinite(prop.position.y)) {
    throw new RangeError(`prop[${i}]: position must be finite`);
  }
}

function validateExit(exit: ExitLine, size: { width: number; height: number }): void {
  const len = Math.hypot(exit.b.x - exit.a.x, exit.b.y - exit.a.y);
  if (!(len > 0)) throw new RangeError("exit: a and b must differ");
  const nLen = Math.hypot(exit.outward.x, exit.outward.y);
  if (!(nLen > 0)) throw new RangeError("exit: outward normal must be non-zero");

  // The exit must lie on one of the four playfield edges so the boundary can open there.
  const hw = size.width / 2;
  const hh = size.height / 2;
  const tol = 1.0;
  const onEdge =
    (Math.abs(exit.a.y - hh) < tol && Math.abs(exit.b.y - hh) < tol) ||
    (Math.abs(exit.a.y + hh) < tol && Math.abs(exit.b.y + hh) < tol) ||
    (Math.abs(exit.a.x - hw) < tol && Math.abs(exit.b.x - hw) < tol) ||
    (Math.abs(exit.a.x + hw) < tol && Math.abs(exit.b.x + hw) < tol);
  if (!onEdge) throw new RangeError("exit: must lie on a playfield edge (so the boundary can open)");
}

/** Validates an authored level against the variant catalog; throws RangeError on any problem. */
export function validateLevel(level: Level, catalog: VariantCatalog): void {
  if (!level.id) throw new RangeError("level: id is required");
  if (!level.name) throw new RangeError("level: name is required");
  if (!(level.size.width > 0) || !(level.size.height > 0)) {
    throw new RangeError("level: size must be positive");
  }
  validateCar(level.drivable, catalog, "drivable");
  level.placedCars.forEach((c, i) => validateCar(c, catalog, `placedCars[${i}]`));
  level.props.forEach(validateProp);
  validateExit(level.exit, level.size);
}
