import { describe, expect, it } from "vitest";
import { mulberry32, type Rng } from "../../../engine/math/rng";
import { obbOverlap } from "../../../engine/math/obb";
import { carFootprint, hitchWorld, trailerFootprint } from "../../vehicle/vehicle-geometry";
import { findCarVariant, findTrailerVariant, type CarState } from "../../vehicle/vehicle-types";
import type { MPerS } from "../../../engine/math/units";
import type { Radians } from "../../../engine/math/angles";
import type { LevelCar } from "../level-types";
import { bayOpeningOffset, cellIndex, inBounds, tileAt, type TileGrid } from "../tile-types";
import { buildCorridor, corridorIntersectsObb, type Corridor } from "./corridor";
import { decorate } from "./decorate";
import { difficultyParams, type Difficulty } from "./difficulty";
import { recordDriveIn, type RecordedPath } from "./drive-in";
import { TEST_CATALOG, makeSkeleton, type TestSkeleton } from "./test-fixtures";

interface Decorated {
  skeleton: TestSkeleton;
  path: RecordedPath;
  corridor: Corridor;
  grid: TileGrid;
  placedCars: LevelCar[];
}

/** Runs the real pipeline (skeleton → drive-in → corridor → decorate) until decoration succeeds. */
function decorateFixture(difficulty: Difficulty): Decorated {
  const params = difficultyParams(difficulty);
  for (let seed = 1; seed <= 40; seed++) {
    const skeleton = makeSkeleton(params);
    const rng: Rng = mulberry32(seed);
    const path = recordDriveIn({
      exit: skeleton.exit,
      boundary: skeleton.boundary,
      grid: skeleton.grid,
      catalog: TEST_CATALOG,
      carVariantId: "sedan",
      trailerVariantId: "caravan",
      params,
      rng,
    });
    if (!path) continue;
    for (const marginScale of [1, 1.5]) {
      const corridor = buildCorridor({ path, grid: skeleton.grid, params, marginScale });
      const decorated = decorate({
        grid: skeleton.grid,
        corridor,
        path,
        exit: skeleton.exit,
        params,
        marginScale,
        catalog: TEST_CATALOG,
        rng,
      });
      if (decorated) return { skeleton, path, corridor, ...decorated };
    }
  }
  throw new Error(`decorate never succeeded for ${difficulty} (seeds 1..40)`);
}

function placedCarObbs(car: LevelCar) {
  const variant = findCarVariant(TEST_CATALOG, car.variantId);
  const state: CarState = {
    variantId: car.variantId,
    role: "placed",
    rearAxle: car.position,
    heading: car.heading as Radians,
    speed: 0 as MPerS,
    steer: 0 as Radians,
    trailer: car.trailerVariantId ? { variantId: car.trailerVariantId, heading: car.heading as Radians } : null,
  };
  const obbs = [carFootprint(state, variant)];
  if (state.trailer) {
    obbs.push(
      trailerFootprint(state.trailer, hitchWorld(state, variant), findTrailerVariant(TEST_CATALOG, state.trailer.variantId)),
    );
  }
  return obbs;
}

describe("decorate", () => {
  const fixtures = { easy: decorateFixture("easy"), medium: decorateFixture("medium") };

  it("keeps the grid dimensions and the solution corridor clear", { timeout: 120_000 }, () => {
    for (const { skeleton, corridor, grid } of Object.values(fixtures)) {
      expect(grid.cols).toBe(skeleton.grid.cols);
      expect(grid.rows).toBe(skeleton.grid.rows);
      // No corridor-shadowed cell may hold anything that blocks driving.
      for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
          if (!corridor.cellShadow.has(cellIndex(grid, col, row))) continue;
          const type = tileAt(grid, col, row)?.type;
          expect(["grass", "hedge", "tree"]).not.toContain(type);
        }
      }
    }
  });

  it("never places a car inside the corridor or overlapping another car", { timeout: 120_000 }, () => {
    for (const { corridor, placedCars } of Object.values(fixtures)) {
      const all = placedCars.flatMap(placedCarObbs);
      for (const obb of all) expect(corridorIntersectsObb(corridor, obb)).toBe(false);
      const perCar = placedCars.map(placedCarObbs);
      for (let i = 0; i < perCar.length; i++) {
        for (let j = i + 1; j < perCar.length; j++) {
          for (const a of perCar[i]!) for (const b of perCar[j]!) expect(obbOverlap(a, b)).toBe(false);
        }
      }
    }
  });

  it("paints bays as coherent closed/open pairs", { timeout: 120_000 }, () => {
    for (const { grid } of Object.values(fixtures)) {
      for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
          const tile = tileAt(grid, col, row);
          if (tile?.type !== "bay") continue;
          const o = bayOpeningOffset(tile.rot);
          const open = { col: col + o.dc, row: row + o.dr };
          expect(inBounds(grid, open.col, open.row)).toBe(true);
          expect(tileAt(grid, open.col, open.row)?.type).toBe("bay-open");
        }
      }
    }
  });

  it("adds decoration beyond the skeleton (islands, bays or cars)", { timeout: 120_000 }, () => {
    for (const { skeleton, grid, placedCars } of Object.values(fixtures)) {
      let changedTiles = 0;
      for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
          if (tileAt(grid, col, row)?.type !== tileAt(skeleton.grid, col, row)?.type) changedTiles++;
        }
      }
      expect(changedTiles + placedCars.length).toBeGreaterThan(0);
    }
  });
});
