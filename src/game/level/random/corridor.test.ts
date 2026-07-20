import { describe, expect, it } from "vitest";
import type { Radians } from "../../../engine/math/angles";
import type { Obb } from "../../../engine/math/obb";
import { createInitialRig } from "../../vehicle/world";
import { cellIndex, worldToCell } from "../tile-types";
import { buildCorridor, corridorIntersectsObb } from "./corridor";
import { difficultyParams } from "./difficulty";
import type { PathSample, RecordedPath } from "./drive-in";
import { makeSkeleton } from "./test-fixtures";

/** A fabricated straight west→east recording along y = 0 (rear axle spans x −10 … +10). */
function straightPath(): RecordedPath {
  const samples: PathSample[] = [];
  for (let s = 0; s <= 20; s += 0.5) {
    const x = s - 10;
    samples.push({
      s,
      rearAxle: { x, y: 0 },
      heading: 0,
      trailerHeading: 0,
      psi: 0,
      steer: 0,
      trailerAxle: { x: x - 4, y: 0 },
      carObb: { center: { x: x + 1, y: 0 }, halfL: 2.2, halfW: 0.9, rotation: 0 as Radians },
      trailerObb: { center: { x: x - 3, y: 0 }, halfL: 1.6, halfW: 0.9, rotation: 0 as Radians },
    });
  }
  return {
    samples,
    arcLength: 20,
    durationSeconds: 20 / 3,
    finalRig: createInitialRig({
      variantId: "sedan",
      trailerVariantId: "caravan",
      position: { x: 10, y: 0 },
      heading: 0 as Radians,
    }),
  };
}

const params = difficultyParams("easy");

describe("buildCorridor", () => {
  const { grid } = makeSkeleton(params);
  const corridor = buildCorridor({ path: straightPath(), grid, params });

  it("emits inflated OBBs with matching AABBs", () => {
    expect(corridor.obbs.length).toBeGreaterThan(0);
    expect(corridor.aabbs.length).toBe(corridor.obbs.length);
    for (let i = 0; i < corridor.obbs.length; i++) {
      const obb = corridor.obbs[i]!;
      const aabb = corridor.aabbs[i]!;
      expect(aabb.minX).toBeLessThan(obb.center.x);
      expect(aabb.maxX).toBeGreaterThan(obb.center.x);
      expect(aabb.minY).toBeLessThan(obb.center.y);
      expect(aabb.maxY).toBeGreaterThan(obb.center.y);
    }
  });

  it("covers the path and rejects far-away boxes", () => {
    const onPath: Obb = { center: { x: 0, y: 0 }, halfL: 1, halfW: 1, rotation: 0 as Radians };
    const farAway: Obb = { center: { x: 0, y: 10 }, halfL: 1, halfW: 1, rotation: 0 as Radians };
    expect(corridorIntersectsObb(corridor, onPath)).toBe(true);
    expect(corridorIntersectsObb(corridor, farAway)).toBe(false);
  });

  it("shadows the grid cells under the path but not remote corners", () => {
    const under = worldToCell(grid, { x: 0, y: 0 })!;
    expect(corridor.cellShadow.has(cellIndex(grid, under.col, under.row))).toBe(true);
    expect(corridor.cellShadow.has(cellIndex(grid, 0, 0))).toBe(false);
  });

  it("tapers: the margin near the player start is thinner than mid-path", () => {
    // Lateral probe 2.5 m off the path: inside the full-margin corridor (base 2.0 → half-width
    // 0.9 + 2.0 = 2.9) far from the start, outside the tapered corridor (0.3 → 1.2) near it.
    const nearStart: Obb = { center: { x: 9.5, y: 2.5 }, halfL: 0.5, halfW: 0.1, rotation: 0 as Radians };
    const midPath: Obb = { center: { x: -9, y: 2.5 }, halfL: 0.5, halfW: 0.1, rotation: 0 as Radians };
    expect(corridorIntersectsObb(corridor, midPath)).toBe(true);
    expect(corridorIntersectsObb(corridor, nearStart)).toBe(false);
  });

  it("marginScale widens the corridor", () => {
    const wide = buildCorridor({ path: straightPath(), grid, params, marginScale: 1.5 });
    const probe: Obb = { center: { x: -9, y: 3.9 }, halfL: 0.5, halfW: 0.1, rotation: 0 as Radians };
    expect(corridorIntersectsObb(corridor, probe)).toBe(false); // 2.9 < 3.8
    expect(corridorIntersectsObb(wide, probe)).toBe(true); // 0.9 + 3.0 = 3.9 ≥ 3.8
  });
});
