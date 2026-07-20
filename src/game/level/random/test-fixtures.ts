import type { Obb } from "../../../engine/math/obb";
import { boundaryWithExitGap } from "../level-to-world";
import type { ExitLine } from "../level-types";
import { filledGrid, gridHeight, gridWidth, withTile, type TileGrid } from "../tile-types";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../../vehicle/variants";
import type { DifficultyParams } from "./difficulty";

/** Shared fixtures for the random-generation test suite (exercised only from *.test.ts files). */

export const TEST_CATALOG = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

const TILE_SIZE = 2.5;

export interface TestSkeleton {
  grid: TileGrid;
  exit: ExitLine;
  boundary: Obb[];
}

/**
 * Deterministic empty-lot skeleton mirroring `buildSkeleton` in generate-level.ts, but with the
 * exit fixed on the south edge at the grid's centre tile (tests want a stable, known layout).
 */
export function makeSkeleton(params: Pick<DifficultyParams, "cols" | "rows" | "exitGapWidth">): TestSkeleton {
  const { cols, rows, exitGapWidth } = params;
  let grid = filledGrid(cols, rows, TILE_SIZE, "asphalt");
  for (let c = 0; c < cols; c++) {
    grid = withTile(grid, c, 0, { type: "grass", rot: 0 });
    grid = withTile(grid, c, rows - 1, { type: "grass", rot: 0 });
  }
  for (let r = 0; r < rows; r++) {
    grid = withTile(grid, 0, r, { type: "grass", rot: 0 });
    grid = withTile(grid, cols - 1, r, { type: "grass", rot: 0 });
  }

  const tileIndex = Math.floor(cols / 2);
  for (const t of [tileIndex - 1, tileIndex, tileIndex + 1]) {
    grid = withTile(grid, t, rows - 1, { type: "asphalt", rot: 0 });
  }

  const w = gridWidth(grid);
  const h = gridHeight(grid);
  const centre = -(w / 2) + (tileIndex + 0.5) * TILE_SIZE;
  const half = exitGapWidth / 2;
  const exit: ExitLine = {
    a: { x: centre - half, y: -h / 2 },
    b: { x: centre + half, y: -h / 2 },
    outward: { x: 0, y: -1 },
  };
  return { grid, exit, boundary: boundaryWithExitGap({ width: w, height: h }, exit) };
}
