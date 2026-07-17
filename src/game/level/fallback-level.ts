import type { Radians } from "../../engine/math/angles";
import type { Vec2 } from "../../engine/math/vec2";
import { rearAxleForBodyCentre } from "../vehicle/vehicle-geometry";
import { allCarVariants } from "../vehicle/variants";
import type { Level, LevelCar } from "./level-types";
import { cellCenter, filledGrid, sideEdge, withCurb, withTile, type TileGrid } from "./tile-types";

const HALF_PI = Math.PI / 2;

/**
 * A parking bay is one tile wide and TWO tiles deep: a `bay` (closed end) tile plus a `bay-open`
 * (entrance) tile — at 2.5 m tiles that's a 2.5×5 m bay, so every car variant fits inside the
 * painted lines with margin.
 */
function paintBayColumn(grid: TileGrid, col: number, closedRow: number, openRow: number, rot: number): TileGrid {
  let g = withTile(grid, col, closedRow, { type: "bay", rot });
  g = withTile(g, col, openRow, { type: "bay-open", rot: 0 });
  return g;
}

/** A car parked with its visible body centred at `centre`. */
function parkedCar(variantId: string, centre: Vec2, heading: number): LevelCar {
  const variant = allCarVariants.find((v) => v.id === variantId);
  if (!variant) throw new RangeError(`unknown car variant "${variantId}"`);
  return { variantId, position: rearAxleForBodyCentre({ centre, heading: heading as Radians, variant }), heading };
}

/** Centre of the 2-tile-deep bay at `col` spanning rows r0..r1. */
function bayCentre(grid: TileGrid, col: number, r0: number, r1: number): Vec2 {
  const a = cellCenter(grid, col, r0);
  const b = cellCenter(grid, col, r1);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Builds the demo lot's tile grid: grass border, two bay rows, a curbed grass island, trees. */
function buildLotGrid(): TileGrid {
  const cols = 24;
  const rows = 16;
  const tileSize = 2.5;
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
  // Top bays open south (rot 0), bottom bays open north (rot 2).
  for (let c = 4; c <= 13; c++) grid = paintBayColumn(grid, c, 1, 2, 0);
  for (let c = 8; c <= 17; c++) grid = paintBayColumn(grid, c, rows - 2, rows - 3, 2);

  // A curbed grass island mid-lot (shows off edge curbs + corner joins; it blocks the rig).
  for (let c = 16; c <= 19; c++) {
    for (let r = 6; r <= 7; r++) grid = withTile(grid, c, r, { type: "grass", rot: 0 });
  }
  for (let c = 16; c <= 19; c++) {
    grid = withCurb(grid, sideEdge(c, 6, "N"), true);
    grid = withCurb(grid, sideEdge(c, 7, "S"), true);
  }
  for (let r = 6; r <= 7; r++) {
    grid = withCurb(grid, sideEdge(16, r, "W"), true);
    grid = withCurb(grid, sideEdge(19, r, "E"), true);
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
  const topBay = (col: number) => bayCentre(grid, col, 1, 2);
  const bottomBay = (col: number) => bayCentre(grid, col, grid.rows - 2, grid.rows - 3);

  return {
    id: "lot-1",
    name: "The Big Lot",
    grid,
    drivable: {
      variantId: "sedan",
      position: cellCenter(grid, 6, 8),
      heading: 0,
      trailerVariantId: "caravan",
    },
    placedCars: [
      parkedCar("suv", topBay(5), -HALF_PI),
      parkedCar("hatchback", topBay(8), -HALF_PI),
      parkedCar("wagon", topBay(11), -HALF_PI),
      parkedCar("coupe", bottomBay(9), HALF_PI),
      parkedCar("wagon", bottomBay(12), HALF_PI),
      parkedCar("suv", bottomBay(15), HALF_PI),
    ],
    exit: { a: { x: hw, y: -3.5 }, b: { x: hw, y: 3.5 }, outward: { x: 1, y: 0 } },
    parSeconds: 90,
  };
}
