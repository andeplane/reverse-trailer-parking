import { describe, expect, it } from "vitest";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import { builtInLevels } from "./built-in-levels";
import { createParkingLotLevel } from "./fallback-level";
import { levelToWorld } from "./level-to-world";
import { validateLevel } from "./level-validate";
import { obstacleFootprints, rigFootprints } from "../collision/collision-system";
import { drivableCar, toRig } from "../vehicle/vehicle-types";
import { obbMtv } from "../../engine/math/obb";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

/**
 * The bundled levels are no longer listed in the menu, but old `b.<id>` share URLs still open them,
 * so they have to stay playable — including after variant geometry changes.
 */
describe("bundled levels", () => {
  const levels = [...builtInLevels(), createParkingLotLevel()];

  it("ships at least one level", () => {
    expect(levels.length).toBeGreaterThan(0);
  });

  for (const level of levels) {
    it(`“${level.name}” validates against the catalog`, () => {
      expect(() => validateLevel(level, catalog)).not.toThrow();
    });

    it(`“${level.name}” starts with the player's rig clear of everything`, () => {
      const world = levelToWorld(level, catalog);
      const rig = rigFootprints(toRig(drivableCar(world)), catalog);
      const obstacles = obstacleFootprints(world);
      expect(rig.some((f) => obstacles.some((o) => obbMtv(f, o.obb) !== null))).toBe(false);
    });
  }
});
