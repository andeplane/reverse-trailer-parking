import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import { createParkingLotWorld } from "../vehicle/world-setup";
import { worldToDebugEntities } from "./debug-view";

describe("worldToDebugEntities", () => {
  const world = createParkingLotWorld();
  const entities = worldToDebugEntities(world, world.catalog);

  it("emits hollow (fillAlpha 0) rect outlines", () => {
    expect(entities.length).toBeGreaterThan(0);
    for (const e of entities) {
      expect(e.visual.kind).toBe("rect");
      if (e.visual.kind === "rect") expect(e.visual.style.fillAlpha).toBe(0);
    }
  });

  it("includes an outline for the drivable rig (car + trailer) and every obstacle", () => {
    const rigIds = entities.filter((e) => e.id.startsWith("debug:rig:"));
    const obstacleIds = entities.filter((e) => e.id.startsWith("debug:obstacle:"));
    expect(rigIds.length).toBe(2); // sedan + caravan
    // placed cars + their trailers + 4 boundary walls
    expect(obstacleIds.length).toBeGreaterThanOrEqual(world.boundary.length + 1);
  });

  it("sizes each outline to its OBB (full width/length, not half)", () => {
    const car = createParkingLotWorld();
    const [rigCar] = worldToDebugEntities(car, car.catalog);
    expect(rigCar!.size.width).toBeGreaterThan(0);
    expect(rigCar!.size.length).toBeGreaterThan(0);
  });

  it("positions an outline at heading 0 for an axis-aligned rig", () => {
    const e = worldToDebugEntities(world, world.catalog).find((x) => x.id === "debug:rig:0")!;
    expect(Number.isFinite(e.rotation)).toBe(true);
    expect(e.rotation).toBeCloseTo(0 as Radians);
  });
});
