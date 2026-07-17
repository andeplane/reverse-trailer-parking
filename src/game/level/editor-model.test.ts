import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import type { Level, LevelCar } from "./level-types";
import { curbAt, filledGrid, tileAt, withCurb, withTile } from "./tile-types";
import {
  carAt,
  carOverlaps,
  emptyLevel,
  exitGateAt,
  levelCarAtCentre,
  levelCarObb,
  pointInObb,
  resizeLevel,
  snapExitToEdge,
} from "./editor-model";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

describe("emptyLevel", () => {
  it("produces a starter level: an asphalt grid, a drivable rig, and an edge exit", () => {
    const lvl = emptyLevel("draft-1");
    expect(lvl.id).toBe("draft-1");
    expect(lvl.drivable.variantId).toBe("sedan");
    expect(lvl.placedCars).toEqual([]);
    expect(lvl.grid.cells.every((c) => c.type === "asphalt")).toBe(true);
    const hw = (lvl.grid.cols * lvl.grid.tileSize) / 2;
    expect(Math.abs(lvl.exit.a.x - hw)).toBeLessThan(1e-9);
  });
});

describe("pointInObb", () => {
  const obb = { center: { x: 0, y: 0 }, halfL: 2, halfW: 1, rotation: 0 as Radians };
  it("is inside within the box, outside beyond it", () => {
    expect(pointInObb({ x: 1.5, y: 0.5 }, obb)).toBe(true);
    expect(pointInObb({ x: 3, y: 0 }, obb)).toBe(false);
  });
  it("respects rotation", () => {
    const rotated = { center: { x: 0, y: 0 }, halfL: 2, halfW: 0.5, rotation: (Math.PI / 2) as Radians };
    expect(pointInObb({ x: 0, y: 1.8 }, rotated)).toBe(true);
    expect(pointInObb({ x: 1.8, y: 0 }, rotated)).toBe(false);
  });
});

function level(): Level {
  return {
    id: "t",
    name: "T",
    grid: filledGrid(8, 6, 5),
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0 },
    placedCars: [{ variantId: "suv", position: { x: 12, y: 0 }, heading: 0 }],
    exit: { a: { x: 20, y: -3 }, b: { x: 20, y: 3 }, outward: { x: 1, y: 0 } },
  };
}

describe("carAt", () => {
  it("hits the drivable car, a placed car, or nothing", () => {
    expect(carAt(level(), { x: 0.5, y: 0 }, catalog)).toEqual({ kind: "drivable" });
    expect(carAt(level(), { x: 12.5, y: 0 }, catalog)).toEqual({ kind: "placed", index: 0 });
    expect(carAt(level(), { x: 6, y: 12 }, catalog)).toBeNull();
  });
});

describe("carOverlaps", () => {
  it("detects when a candidate overlaps an existing car", () => {
    const onTopOfPlaced: LevelCar = { variantId: "sedan", position: { x: 12, y: 0 }, heading: 0 };
    expect(carOverlaps(level(), onTopOfPlaced, catalog)).toBe(true);
  });
  it("is clear when the candidate is well away from all cars", () => {
    const away: LevelCar = { variantId: "sedan", position: { x: 6, y: 12 }, heading: 0 };
    expect(carOverlaps(level(), away, catalog)).toBe(false);
  });
  it("ignores the given car when checking (so moving/rotating in place is allowed)", () => {
    const inPlace: LevelCar = { variantId: "suv", position: { x: 12, y: 0 }, heading: 0 };
    expect(carOverlaps(level(), inPlace, catalog, { kind: "placed", index: 0 })).toBe(false);
  });
});

describe("snapExitToEdge", () => {
  const grid = filledGrid(8, 6, 5); // 40 x 30
  it("snaps to the nearest (right) edge and points outward +x", () => {
    const exit = snapExitToEdge({ x: 19, y: -3 }, { x: 21, y: 3 }, grid);
    expect(exit.a.x).toBeCloseTo(20);
    expect(exit.outward).toEqual({ x: 1, y: 0 });
  });
  it("snaps to the bottom edge and points outward -y", () => {
    const exit = snapExitToEdge({ x: -3, y: -14 }, { x: 3, y: -16 }, grid);
    expect(exit.a.y).toBeCloseTo(-15);
    expect(exit.outward).toEqual({ x: 0, y: -1 });
  });
});

describe("levelCarAtCentre", () => {
  it("places the car so its visible body centre lands exactly on the requested point", () => {
    const centre = { x: 7, y: -3 };
    const car = levelCarAtCentre({ variantId: "suv", centre, heading: Math.PI / 6, catalog });
    const obb = levelCarObb(car, catalog);
    expect(obb.center.x).toBeCloseTo(centre.x);
    expect(obb.center.y).toBeCloseTo(centre.y);
    expect(car.heading).toBeCloseTo(Math.PI / 6);
  });
});

describe("resizeLevel", () => {
  function baseLevel(): Level {
    let grid = filledGrid(8, 6, 5); // 40 x 30
    grid = withTile(grid, 1, 1, { type: "grass", rot: 0 });
    grid = withCurb(grid, { o: "h", col: 1, row: 2 }, true);
    return {
      id: "t",
      name: "T",
      grid,
      drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0 },
      placedCars: [{ variantId: "suv", position: { x: 17, y: -12 }, heading: 0 }],
      exit: { a: { x: 20, y: -3 }, b: { x: 20, y: 3 }, outward: { x: 1, y: 0 } },
    };
  }

  it("keeps tiles, curbs, cars, and the exit glued to the grid when growing", () => {
    const lvl = resizeLevel(baseLevel(), 10, 6); // +2 cols → world shifts by dx=-5
    expect(tileAt(lvl.grid, 1, 1)?.type).toBe("grass");
    expect(curbAt(lvl.grid, { o: "h", col: 1, row: 2 })).toBe(true);
    expect(lvl.drivable.position.x).toBeCloseTo(-5); // translated with the tiles
    expect(lvl.placedCars[0]?.position.x).toBeCloseTo(12);
    expect(lvl.exit.a.x).toBeCloseTo(25); // re-snapped to the new right edge
    expect(lvl.exit.outward).toEqual({ x: 1, y: 0 });
  });

  it("drops placed cars that fall outside when shrinking, and clamps the rig inside", () => {
    const lvl = resizeLevel(baseLevel(), 4, 4); // 20 x 20
    expect(lvl.placedCars).toHaveLength(0);
    expect(Math.abs(lvl.drivable.position.x)).toBeLessThanOrEqual(10);
    expect(Math.abs(lvl.drivable.position.y)).toBeLessThanOrEqual(10);
  });
});

describe("exitGateAt", () => {
  const grid = filledGrid(8, 6, 5); // 40 x 30, hw=20, hh=15
  it("builds a fixed-width gate on the nearest edge centred on the cursor", () => {
    const gate = exitGateAt({ x: 19, y: 2 }, grid, 8);
    expect(gate.a.x).toBeCloseTo(20); // snapped to right edge
    expect(gate.b.x).toBeCloseTo(20);
    expect(Math.abs(gate.b.y - gate.a.y)).toBeCloseTo(8); // requested width
    expect(gate.outward).toEqual({ x: 1, y: 0 });
  });
});
