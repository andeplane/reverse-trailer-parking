import type { Level } from "./level-types";
import { cellCenter, filledGrid, withTile, type TileGrid } from "./tile-types";

const HALF_PI = Math.PI / 2;

/** Builds the demo lot's tile grid: grass border, two bay rows, a few trees. */
function buildLotGrid(): TileGrid {
  const cols = 14;
  const rows = 12;
  const tileSize = 4;
  let grid = filledGrid(cols, rows, tileSize, "asphalt");

  // Grass border ring.
  for (let c = 0; c < cols; c++) {
    grid = withTile(grid, c, 0, { type: "grass", rot: 0 });
    grid = withTile(grid, c, rows - 1, { type: "grass", rot: 0 });
  }
  for (let r = 0; r < rows; r++) {
    grid = withTile(grid, 0, r, { type: "grass", rot: 0 });
    grid = withTile(grid, cols - 1, r, { type: "grass", rot: 0 });
  }
  // Bay rows: top row (open downward, rot 0) and bottom row (open upward, rot 2).
  for (let c = 2; c < cols - 2; c++) {
    grid = withTile(grid, c, 2, { type: "bay", rot: 0 });
    grid = withTile(grid, c, rows - 3, { type: "bay", rot: 2 });
  }
  // A couple of trees in the grass border.
  grid = withTile(grid, 1, 1, { type: "tree", rot: 0 });
  grid = withTile(grid, cols - 2, rows - 2, { type: "tree", rot: 0 });
  return grid;
}

/** A built-in level used if `levels.json` cannot be fetched (also the shape editor levels take). */
export function createParkingLotLevel(): Level {
  const grid = buildLotGrid();
  const hw = (grid.cols * grid.tileSize) / 2;
  const bayTop = (col: number) => cellCenter(grid, col, 2);
  const bayBottom = (col: number) => cellCenter(grid, col, grid.rows - 3);
  const centre = cellCenter(grid, 4, grid.rows / 2);

  return {
    id: "lot-1",
    name: "The Big Lot",
    grid,
    drivable: { variantId: "sedan", position: centre, heading: 0, trailerVariantId: "caravan" },
    placedCars: [
      { variantId: "suv", position: bayTop(3), heading: -HALF_PI },
      { variantId: "hatchback", position: bayTop(6), heading: -HALF_PI },
      { variantId: "wagon", position: bayTop(9), heading: -HALF_PI },
      { variantId: "coupe", position: bayBottom(3), heading: HALF_PI },
      { variantId: "wagon", position: bayBottom(6), heading: HALF_PI },
      { variantId: "suv", position: bayBottom(9), heading: HALF_PI },
    ],
    exit: { a: { x: hw, y: -3.5 }, b: { x: hw, y: 3.5 }, outward: { x: 1, y: 0 } },
    parSeconds: 90,
  };
}
