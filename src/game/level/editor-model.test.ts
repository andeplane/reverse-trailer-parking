import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import type { Level } from "./level-types";
import { emptyLevel, hitTest, pointInObb, rectFromDrag, snapExitToEdge } from "./editor-model";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

describe("emptyLevel", () => {
  it("produces a valid starter level with a drivable rig and an edge exit", () => {
    const lvl = emptyLevel("draft-1");
    expect(lvl.id).toBe("draft-1");
    expect(lvl.drivable.variantId).toBe("sedan");
    expect(lvl.placedCars).toEqual([]);
    expect(Math.abs(lvl.exit.a.x - lvl.size.width / 2)).toBeLessThan(1e-9);
  });
});

describe("pointInObb", () => {
  const obb = { center: { x: 0, y: 0 }, halfL: 2, halfW: 1, rotation: 0 as Radians };
  it("is inside within the box", () => {
    expect(pointInObb({ x: 1.5, y: 0.5 }, obb)).toBe(true);
  });
  it("is outside beyond the box", () => {
    expect(pointInObb({ x: 3, y: 0 }, obb)).toBe(false);
    expect(pointInObb({ x: 0, y: 1.5 }, obb)).toBe(false);
  });
  it("respects rotation", () => {
    const rotated = { center: { x: 0, y: 0 }, halfL: 2, halfW: 0.5, rotation: (Math.PI / 2) as Radians };
    expect(pointInObb({ x: 0, y: 1.8 }, rotated)).toBe(true); // long axis now vertical
    expect(pointInObb({ x: 1.8, y: 0 }, rotated)).toBe(false);
  });
});

describe("hitTest", () => {
  function level(): Level {
    return {
      id: "t",
      name: "T",
      size: { width: 40, height: 30 },
      drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0 },
      placedCars: [{ variantId: "suv", position: { x: 12, y: 0 }, heading: 0 }],
      props: [{ kind: "grass", position: { x: -12, y: 8 }, rotation: 0, size: { width: 4, length: 4 } }],
      exit: { a: { x: 20, y: -3 }, b: { x: 20, y: 3 }, outward: { x: 1, y: 0 } },
    };
  }

  it("hits the drivable car body", () => {
    expect(hitTest(level(), { x: 0.5, y: 0 }, catalog)).toEqual({ kind: "drivable" });
  });
  it("hits a placed car", () => {
    expect(hitTest(level(), { x: 12.5, y: 0 }, catalog)).toEqual({ kind: "placed", index: 0 });
  });
  it("hits a prop", () => {
    expect(hitTest(level(), { x: -12, y: 8 }, catalog)).toEqual({ kind: "prop", index: 0 });
  });
  it("returns null on empty ground", () => {
    expect(hitTest(level(), { x: 5, y: 12 }, catalog)).toBeNull();
  });
});

describe("rectFromDrag", () => {
  it("builds a centred rect from two corners", () => {
    const r = rectFromDrag({ x: 2, y: 3 }, { x: 8, y: 9 });
    expect(r.position).toEqual({ x: 5, y: 6 });
    expect(r.size).toEqual({ width: 6, length: 6 });
  });
  it("enforces a minimum size for a tiny drag", () => {
    const r = rectFromDrag({ x: 0, y: 0 }, { x: 0.1, y: 0.1 });
    expect(r.size.width).toBeGreaterThanOrEqual(0.5);
    expect(r.size.length).toBeGreaterThanOrEqual(0.5);
  });
});

describe("snapExitToEdge", () => {
  const size = { width: 40, height: 30 };
  it("snaps to the nearest (right) edge and points outward +x", () => {
    const exit = snapExitToEdge({ x: 19, y: -3 }, { x: 21, y: 3 }, size);
    expect(exit.a.x).toBeCloseTo(20);
    expect(exit.b.x).toBeCloseTo(20);
    expect(exit.outward).toEqual({ x: 1, y: 0 });
  });
  it("snaps to the bottom edge and points outward -y", () => {
    const exit = snapExitToEdge({ x: -3, y: -14 }, { x: 3, y: -16 }, size);
    expect(exit.a.y).toBeCloseTo(-15);
    expect(exit.outward).toEqual({ x: 0, y: -1 });
  });
  it("clamps endpoints to the playfield extent", () => {
    const exit = snapExitToEdge({ x: 100, y: 14.9 }, { x: -100, y: 15.1 }, size);
    expect(exit.a.x).toBeLessThanOrEqual(20);
    expect(exit.b.x).toBeGreaterThanOrEqual(-20);
    expect(exit.outward).toEqual({ x: 0, y: 1 });
  });
});
