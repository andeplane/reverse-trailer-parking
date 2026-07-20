import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../../engine/math/rng";
import { add, rotate, scale } from "../../../engine/math/vec2";
import type { Radians } from "../../../engine/math/angles";
import { rearAxleForBodyCentre } from "../../vehicle/vehicle-geometry";
import { findCarVariant } from "../../vehicle/vehicle-types";
import type { Level } from "../level-types";
import { buildCorridor } from "./corridor";
import { decorate } from "./decorate";
import { difficultyParams, type DifficultyParams } from "./difficulty";
import { recordDriveIn, type RecordedPath } from "./drive-in";
import { replaySolutionReverse } from "./reverse-tracker";
import { TEST_CATALOG, makeSkeleton } from "./test-fixtures";

interface VerifiedFixture {
  level: Level;
  path: RecordedPath;
  params: DifficultyParams;
  marginScale: number;
}

let cached: VerifiedFixture | null = null;

/** Real pipeline through to a WINNING replay — the fixture every failure-mode test perturbs. */
function verifiedFixture(): VerifiedFixture {
  if (cached) return cached;
  const params = difficultyParams("easy");
  for (let seed = 1; seed <= 40; seed++) {
    const { grid, exit, boundary } = makeSkeleton(params);
    const rng = mulberry32(seed);
    const path = recordDriveIn({
      exit,
      boundary,
      grid,
      catalog: TEST_CATALOG,
      carVariantId: "sedan",
      trailerVariantId: "caravan",
      params,
      rng,
    });
    if (!path) continue;
    for (const marginScale of [1, 1.5]) {
      const corridor = buildCorridor({ path, grid, params, marginScale });
      const decorated = decorate({ grid, corridor, path, exit, params, marginScale, catalog: TEST_CATALOG, rng });
      if (!decorated) continue;
      const level: Level = {
        id: "test-random",
        name: "test-random",
        grid: decorated.grid,
        drivable: {
          variantId: "sedan",
          position: path.finalRig.car.rearAxle,
          heading: path.finalRig.car.heading,
          trailerVariantId: "caravan",
        },
        placedCars: decorated.placedCars,
        exit,
      };
      const replay = replaySolutionReverse({ level, path, params, catalog: TEST_CATALOG, marginScale });
      if (replay.won) {
        cached = { level, path, params, marginScale };
        return cached;
      }
    }
  }
  throw new Error("no verified fixture found for seeds 1..40");
}

describe("replaySolutionReverse", () => {
  it("wins on a generated level by backing along the recording", { timeout: 120_000 }, () => {
    const { level, path, params, marginScale } = verifiedFixture();
    const replay = replaySolutionReverse({ level, path, params, catalog: TEST_CATALOG, marginScale });
    expect(replay.won).toBe(true);
    expect(replay.reason).toBe("won");
    expect(replay.seconds).toBeGreaterThan(0);
    // Deterministic: the exact same replay again.
    expect(replaySolutionReverse({ level, path, params, catalog: TEST_CATALOG, marginScale })).toEqual(replay);
  });

  it("reports timeout for a degenerate recording (fewer than 2 samples)", { timeout: 120_000 }, () => {
    const { level, path, params, marginScale } = verifiedFixture();
    const degenerate: RecordedPath = { ...path, samples: path.samples.slice(0, 1), arcLength: 0 };
    const replay = replaySolutionReverse({ level, path: degenerate, params, catalog: TEST_CATALOG, marginScale });
    expect(replay).toEqual({ won: false, seconds: 0, reason: "timeout" });
  });

  it("fails without winning when an obstacle blocks the recorded path", { timeout: 120_000 }, () => {
    const { level, path, params, marginScale } = verifiedFixture();
    const half = path.arcLength / 2;
    const mid = path.samples.reduce((best, s) => (Math.abs(s.s - half) < Math.abs(best.s - half) ? s : best));
    // Body centred ON the trailer's future position, broadside — the backing rig dead-stops on it.
    const variant = findCarVariant(TEST_CATALOG, "suv");
    const blockerHeading = (mid.trailerHeading + Math.PI / 2) as Radians;
    const blocked: Level = {
      ...level,
      placedCars: [
        ...level.placedCars,
        {
          variantId: "suv",
          position: rearAxleForBodyCentre({ centre: mid.trailerAxle, heading: blockerHeading, variant }),
          heading: blockerHeading,
        },
      ],
    };
    const replay = replaySolutionReverse({ level: blocked, path, params, catalog: TEST_CATALOG, marginScale });
    expect(replay.won).toBe(false);
    expect(["stall", "cross-track", "timeout", "jackknife"]).toContain(replay.reason);
  });

  it("fails with cross-track when the reference path does not match the level", { timeout: 120_000 }, () => {
    const { level, path, params, marginScale } = verifiedFixture();
    // Shift every reference 2 m laterally (per-sample left normal): the rig starts 2 m off-path.
    const shifted: RecordedPath = {
      ...path,
      samples: path.samples.map((s) => ({
        ...s,
        trailerAxle: add(s.trailerAxle, scale(rotate({ x: 0, y: 1 }, s.trailerHeading as Radians), 2)),
      })),
    };
    const replay = replaySolutionReverse({ level, path: shifted, params, catalog: TEST_CATALOG, marginScale });
    expect(replay.won).toBe(false);
    expect(replay.reason).toBe("cross-track");
  });
});
