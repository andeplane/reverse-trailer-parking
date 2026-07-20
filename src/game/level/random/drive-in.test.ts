import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../../engine/math/rng";
import { length, midpoint, sub } from "../../../engine/math/vec2";
import { difficultyParams } from "./difficulty";
import { recordDriveIn, type RecordedPath } from "./drive-in";
import { TEST_CATALOG, makeSkeleton } from "./test-fixtures";

const params = difficultyParams("easy");

function record(seed: number): RecordedPath | null {
  const { grid, exit, boundary } = makeSkeleton(params);
  return recordDriveIn({
    exit,
    boundary,
    grid,
    catalog: TEST_CATALOG,
    carVariantId: "sedan",
    trailerVariantId: "caravan",
    params,
    rng: mulberry32(seed),
  });
}

/** First seed in 1..30 that yields a recording (chain sampling can fail per-seed by design). */
function firstSuccessfulSeed(): number {
  for (let seed = 1; seed <= 30; seed++) if (record(seed)) return seed;
  throw new Error("no drive-in recorded for seeds 1..30");
}

describe("recordDriveIn", () => {
  it("records a monotone, straightened, floor-respecting path", { timeout: 60_000 }, () => {
    const path = record(firstSuccessfulSeed())!;
    expect(path.samples.length).toBeGreaterThan(2);
    expect(path.samples[0]!.s).toBe(0);
    for (let i = 1; i < path.samples.length; i++) {
      expect(path.samples[i]!.s).toBeGreaterThanOrEqual(path.samples[i - 1]!.s);
    }
    expect(path.samples[path.samples.length - 1]!.s).toBeCloseTo(path.arcLength, 10);

    // Ends parked: at rest, near-straight hitch, wheels straight.
    expect(path.finalRig.car.speed).toBe(0);
    const psi = path.finalRig.trailer
      ? Math.abs(path.finalRig.car.heading - path.finalRig.trailer.heading)
      : 0;
    expect(psi).toBeLessThan((3 * Math.PI) / 180);

    // Difficulty acceptance floors.
    const { exit } = makeSkeleton(params);
    const exitMid = midpoint(exit.a, exit.b);
    expect(path.arcLength).toBeGreaterThanOrEqual(params.minArcLength);
    expect(length(sub(path.finalRig.car.rearAxle, exitMid))).toBeGreaterThanOrEqual(params.minStartExitDistance);
  });

  it("is deterministic for a given seed", { timeout: 60_000 }, () => {
    const seed = firstSuccessfulSeed();
    expect(record(seed)).toEqual(record(seed));
  });

  it("returns null when the lot is too small for any waypoint chain", () => {
    const tiny = { ...params, cols: 6, rows: 6 };
    const { grid, exit, boundary } = makeSkeleton(tiny);
    const path = recordDriveIn({
      exit,
      boundary,
      grid,
      catalog: TEST_CATALOG,
      carVariantId: "sedan",
      trailerVariantId: "caravan",
      params: tiny,
      rng: mulberry32(1),
    });
    expect(path).toBeNull();
  });
});
