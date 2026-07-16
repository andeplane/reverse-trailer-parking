import type { Level } from "./level-types";
import { createParkingLotLevel } from "./fallback-level";
import { cellCenter, filledGrid, withTile } from "./tile-types";

const HALF_PI = Math.PI / 2;

/** A compact "reverse out of the spot" level: back the rig down through the bottom exit. */
function createReverseOutLevel(): Level {
  const cols = 10;
  const rows = 12;
  const tileSize = 3;
  let grid = filledGrid(cols, rows, tileSize, "asphalt");
  for (let c = 0; c < cols; c++) {
    grid = withTile(grid, c, 0, { type: "grass", rot: 0 });
  }
  for (let r = 0; r < rows; r++) {
    grid = withTile(grid, 0, r, { type: "grass", rot: 0 });
    grid = withTile(grid, cols - 1, r, { type: "grass", rot: 0 });
  }
  // Top parking bays where the flanking cars sit.
  for (let c = 2; c < cols - 2; c++) grid = withTile(grid, c, 1, { type: "bay", rot: 0 });

  const hh = (rows * tileSize) / 2;
  const start = cellCenter(grid, cols / 2 - 0.5, rows - 4);
  return {
    id: "reverse-out",
    name: "Reverse Out",
    grid,
    drivable: { variantId: "sedan", position: start, heading: HALF_PI, trailerVariantId: "caravan" },
    placedCars: [
      { variantId: "suv", position: cellCenter(grid, 3, 1), heading: -HALF_PI },
      { variantId: "coupe", position: cellCenter(grid, 6, 1), heading: -HALF_PI },
    ],
    exit: { a: { x: -3.5, y: -hh }, b: { x: 3.5, y: -hh }, outward: { x: 0, y: -1 } },
    parSeconds: 60,
  };
}

/** The levels shipped with the game (custom editor levels merge on top from localStorage). */
export function builtInLevels(): Level[] {
  return [createParkingLotLevel(), createReverseOutLevel()];
}
