import { describe, expect, it } from "vitest";
import { obbMtv } from "../../engine/math/obb";
import { createVariantCatalog, allCarVariants, allTrailerVariants } from "../vehicle/variants";
import { drivableCar, placedCars, toRig } from "../vehicle/vehicle-types";
import { obstacleFootprints, rigFootprints } from "../collision/collision-system";
import type { Level } from "./level-types";
import { filledGrid, withTile } from "./tile-types";
import { boundaryWithExitGap, levelToWorld, solidTileFootprints } from "./level-to-world";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function baseLevel(overrides: Partial<Level> = {}): Level {
  // 40 x 30 grid with two solid tiles (a curb and a hedge).
  let grid = filledGrid(8, 6, 5);
  grid = withTile(grid, 0, 0, { type: "curb", rot: 0 });
  grid = withTile(grid, 1, 0, { type: "hedge", rot: 0 });
  return {
    id: "t",
    name: "Test",
    grid,
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [{ variantId: "suv", position: { x: 12, y: 8 }, heading: 0 }],
    exit: { a: { x: 20, y: -3 }, b: { x: 20, y: 3 }, outward: { x: 1, y: 0 } },
    ...overrides,
  };
}

describe("levelToWorld", () => {
  it("spawns the drivable rig + placed cars and carries the grid, exit, and bounds", () => {
    const world = levelToWorld(baseLevel(), catalog);
    expect(drivableCar(world).variantId).toBe("sedan");
    expect(drivableCar(world).trailer?.variantId).toBe("caravan");
    expect(placedCars(world)).toHaveLength(1);
    expect(world.bounds).toEqual({ width: 40, height: 30 });
    expect(world.exit).not.toBeNull();
    expect(world.grid.cols).toBe(8);
  });

  it("turns solid tiles into collidable footprints", () => {
    const world = levelToWorld(baseLevel(), catalog);
    expect(world.solids).toHaveLength(2); // curb + hedge
    const withoutSolids = levelToWorld(baseLevel({ grid: filledGrid(8, 6, 5) }), catalog);
    expect(obstacleFootprints(world).length).toBe(obstacleFootprints(withoutSolids).length + 2);
  });

  it("starts with the rig clear of all obstacles", () => {
    const world = levelToWorld(baseLevel(), catalog);
    const rig = rigFootprints(toRig(drivableCar(world)), catalog);
    const obstacles = obstacleFootprints(world);
    expect(rig.some((f) => obstacles.some((o) => obbMtv(f, o) !== null))).toBe(false);
  });
});

describe("solidTileFootprints", () => {
  it("returns one OBB per solid tile, sized to the cell", () => {
    let grid = filledGrid(3, 3, 4);
    grid = withTile(grid, 1, 1, { type: "tree", rot: 0 });
    const obbs = solidTileFootprints(grid);
    expect(obbs).toHaveLength(1);
    expect(obbs[0]?.halfL).toBe(2);
    expect(obbs[0]?.center).toEqual({ x: 0, y: 0 }); // centre cell of a 3x3 grid
  });
});

describe("boundaryWithExitGap", () => {
  it("fully encloses the lot (4 walls) when there is no exit", () => {
    expect(boundaryWithExitGap({ width: 40, height: 30 }, null)).toHaveLength(4);
  });

  it("opens the edge the exit lies on", () => {
    const walls = boundaryWithExitGap({ width: 40, height: 30 }, {
      a: { x: 20, y: -3 },
      b: { x: 20, y: 3 },
      outward: { x: 1, y: 0 },
    });
    expect(walls).toHaveLength(5); // 3 solid edges + 2 segments on the opened edge
    const gap = { x: 20, y: 0 };
    const covers = walls.some(
      (w) => Math.abs(w.center.x - gap.x) < w.halfL + 0.1 && Math.abs(w.center.y - gap.y) < w.halfW + 0.1,
    );
    expect(covers).toBe(false);
  });
});
