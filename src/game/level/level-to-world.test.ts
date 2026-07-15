import { describe, expect, it } from "vitest";
import { obbMtv } from "../../engine/math/obb";
import { createVariantCatalog, allCarVariants, allTrailerVariants } from "../vehicle/variants";
import { drivableCar, placedCars, toRig } from "../vehicle/vehicle-types";
import { obstacleFootprints, rigFootprints } from "../collision/collision-system";
import type { Level } from "./level-types";
import { boundaryWithExitGap, levelToWorld } from "./level-to-world";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function baseLevel(overrides: Partial<Level> = {}): Level {
  return {
    id: "t",
    name: "Test",
    size: { width: 40, height: 30 },
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [{ variantId: "suv", position: { x: 12, y: 8 }, heading: 0 }],
    props: [
      { kind: "curb", position: { x: -10, y: 5 }, rotation: 0, size: { width: 0.5, length: 6 } },
      { kind: "grass", position: { x: 10, y: -10 }, rotation: 0, size: { width: 4, length: 4 } },
    ],
    exit: { a: { x: 20, y: -3 }, b: { x: 20, y: 3 }, outward: { x: 1, y: 0 } },
    ...overrides,
  };
}

describe("levelToWorld", () => {
  it("spawns the drivable rig + placed cars and carries exit + bounds", () => {
    const world = levelToWorld(baseLevel(), catalog);
    expect(drivableCar(world).variantId).toBe("sedan");
    expect(drivableCar(world).trailer?.variantId).toBe("caravan");
    expect(placedCars(world)).toHaveLength(1);
    expect(world.bounds).toEqual({ width: 40, height: 30 });
    expect(world.exit).not.toBeNull();
  });

  it("converts solid props to collidable obstacles and decor props to non-collidable", () => {
    const world = levelToWorld(baseLevel(), catalog);
    expect(world.props).toHaveLength(2);
    expect(world.props.find((p) => p.kind === "curb")?.collidable).toBe(true);
    expect(world.props.find((p) => p.kind === "grass")?.collidable).toBe(false);
    // obstacle footprints include the collidable curb but not the grass.
    const start = obstacleFootprints(world).length;
    const noProps = levelToWorld(baseLevel({ props: [] }), catalog);
    expect(start).toBe(obstacleFootprints(noProps).length + 1);
  });

  it("starts with the rig clear of all obstacles", () => {
    const world = levelToWorld(baseLevel(), catalog);
    const rig = rigFootprints(toRig(drivableCar(world)), catalog);
    const obstacles = obstacleFootprints(world);
    expect(rig.some((f) => obstacles.some((o) => obbMtv(f, o) !== null))).toBe(false);
  });
});

describe("boundaryWithExitGap", () => {
  it("fully encloses the lot (4 walls) when there is no exit", () => {
    expect(boundaryWithExitGap({ width: 40, height: 30 }, null)).toHaveLength(4);
  });

  it("opens the edge the exit lies on (that edge becomes two wall segments)", () => {
    const walls = boundaryWithExitGap({ width: 40, height: 30 }, {
      a: { x: 20, y: -3 },
      b: { x: 20, y: 3 },
      outward: { x: 1, y: 0 },
    });
    // 3 solid edges + 2 segments on the opened right edge = 5.
    expect(walls).toHaveLength(5);
    // No wall covers the gap centre (20, 0).
    const gapPoint = { x: 20, y: 0 };
    const covers = walls.some(
      (w) => Math.abs(w.center.x - gapPoint.x) < w.halfL + 0.1 && Math.abs(w.center.y - gapPoint.y) < w.halfW + 0.1,
    );
    expect(covers).toBe(false);
  });
});
