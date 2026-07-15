import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import type { Obb } from "../../engine/math/obb";
import type { ExitLine } from "./level-types";
import { hasRigCrossedExit, hasRigStartedCrossing, outwardNormalAwayFrom } from "./win";

function box(cx: number, cy: number, halfL: number, halfW: number): Obb {
  return { center: { x: cx, y: cy }, halfL, halfW, rotation: 0 as Radians };
}

// A vertical exit line at x=10, outward pointing +x (winning side is x > 10).
const exit: ExitLine = { a: { x: 10, y: -5 }, b: { x: 10, y: 5 }, outward: { x: 1, y: 0 } };

describe("outwardNormalAwayFrom", () => {
  it("returns a unit normal pointing away from the interior reference", () => {
    const n = outwardNormalAwayFrom({ x: 10, y: -5 }, { x: 10, y: 5 }, { x: 0, y: 0 });
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1);
    expect(n.x).toBeGreaterThan(0); // interior is at x=0, so outward is +x
  });

  it("flips to the opposite side when the interior is on the other side", () => {
    const n = outwardNormalAwayFrom({ x: 10, y: -5 }, { x: 10, y: 5 }, { x: 20, y: 0 });
    expect(n.x).toBeLessThan(0); // interior at x=20 → outward is −x
  });
});

describe("hasRigCrossedExit", () => {
  it("is false when the rig is entirely on the inside", () => {
    expect(hasRigCrossedExit([box(3, 0, 2, 1)], exit)).toBe(false);
  });

  it("is false while straddling the line (some corners still inside)", () => {
    expect(hasRigCrossedExit([box(10, 0, 2, 1)], exit)).toBe(false);
  });

  it("is true only once every corner of every footprint is past the line", () => {
    expect(hasRigCrossedExit([box(13, 0, 2, 1)], exit)).toBe(true);
  });

  it("requires BOTH car and trailer footprints to have fully crossed", () => {
    const car = box(13, 0, 2, 1); // across
    const trailer = box(8, 0, 2, 1); // still inside
    expect(hasRigCrossedExit([car, trailer], exit)).toBe(false);
    const trailerAcross = box(14, 0, 2, 1);
    expect(hasRigCrossedExit([car, trailerAcross], exit)).toBe(true);
  });

  it("is false for an empty footprint list", () => {
    expect(hasRigCrossedExit([], exit)).toBe(false);
  });
});

describe("hasRigStartedCrossing", () => {
  it("is false entirely inside, true once any corner pokes across", () => {
    expect(hasRigStartedCrossing([box(3, 0, 2, 1)], exit)).toBe(false);
    expect(hasRigStartedCrossing([box(9.5, 0, 2, 1)], exit)).toBe(true);
  });
});
