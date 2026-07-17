import { findCarVariant, findTrailerVariant, type VariantCatalog } from "../vehicle/vehicle-types";
import type { ExitLine, Level, LevelCar } from "./level-types";
import { ALL_TILE_TYPES, gridHeight, gridWidth, type TileGrid } from "./tile-types";

const TILE_TYPES: ReadonlySet<string> = new Set<string>(ALL_TILE_TYPES);

function validateCar(car: LevelCar, catalog: VariantCatalog, label: string): void {
  findCarVariant(catalog, car.variantId); // throws if unknown
  if (car.trailerVariantId !== undefined) findTrailerVariant(catalog, car.trailerVariantId);
  if (!Number.isFinite(car.position.x) || !Number.isFinite(car.position.y)) {
    throw new RangeError(`${label}: position must be finite`);
  }
  if (!Number.isFinite(car.heading)) throw new RangeError(`${label}: heading must be finite`);
}

function validateGrid(grid: TileGrid): void {
  if (!(grid.tileSize > 0)) throw new RangeError("grid: tileSize must be positive");
  if (!(grid.cols > 0) || !(grid.rows > 0)) throw new RangeError("grid: cols/rows must be positive");
  if (grid.cells.length !== grid.cols * grid.rows) {
    throw new RangeError(`grid: expected ${grid.cols * grid.rows} cells, got ${grid.cells.length}`);
  }
  for (const [i, cell] of grid.cells.entries()) {
    if (!TILE_TYPES.has(cell.type)) throw new RangeError(`grid.cells[${i}]: unknown tile "${cell.type}"`);
    if (!Number.isInteger(cell.rot) || cell.rot < 0 || cell.rot > 3) {
      throw new RangeError(`grid.cells[${i}]: rot must be an integer 0..3`);
    }
  }
}

function validateExit(exit: ExitLine, size: { width: number; height: number }): void {
  const len = Math.hypot(exit.b.x - exit.a.x, exit.b.y - exit.a.y);
  if (!(len > 0)) throw new RangeError("exit: a and b must differ");
  if (!(Math.hypot(exit.outward.x, exit.outward.y) > 0)) throw new RangeError("exit: outward normal must be non-zero");

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
  validateGrid(level.grid);
  validateCar(level.drivable, catalog, "drivable");
  level.placedCars.forEach((c, i) => validateCar(c, catalog, `placedCars[${i}]`));
  validateExit(level.exit, { width: gridWidth(level.grid), height: gridHeight(level.grid) });
}
