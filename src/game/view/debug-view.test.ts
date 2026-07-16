import { describe, expect, it } from "vitest";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import { createParkingLotLevel } from "../level/fallback-level";
import { levelToWorld } from "../level/level-to-world";
import { worldToDebugEntities } from "./debug-view";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

describe("worldToDebugEntities", () => {
  const world = levelToWorld(createParkingLotLevel(), catalog);
  const entities = worldToDebugEntities(world, catalog);

  it("emits hollow (fillAlpha 0) rect outlines", () => {
    expect(entities.length).toBeGreaterThan(0);
    for (const e of entities) {
      expect(e.visual.kind).toBe("rect");
      if (e.visual.kind === "rect") expect(e.visual.style.fillAlpha).toBe(0);
    }
  });

  it("includes the field bounds, the drivable rig, and every obstacle", () => {
    expect(entities.find((e) => e.id === "debug:bounds")?.size).toEqual({
      width: world.bounds.width,
      length: world.bounds.height,
    });
    expect(entities.filter((e) => e.id.startsWith("debug:rig:")).length).toBe(2); // sedan + caravan
    expect(entities.filter((e) => e.id.startsWith("debug:obstacle:")).length).toBeGreaterThanOrEqual(
      world.boundary.length,
    );
  });

  it("positions the rig outline at a finite rotation", () => {
    const e = entities.find((x) => x.id === "debug:rig:0")!;
    expect(Number.isFinite(e.rotation)).toBe(true);
  });
});
