import { describe, expect, it } from "vitest";
import type { Radians } from "./angles";
import { length, vec2 } from "./vec2";
import { obbCorners, obbMtv, obbOverlap, type Obb } from "./obb";

function box(cx: number, cy: number, halfL: number, halfW: number, rotation = 0): Obb {
  return { center: vec2(cx, cy), halfL, halfW, rotation: rotation as Radians };
}

describe("obbCorners", () => {
  it("returns 4 corners at the expected extents for an unrotated box", () => {
    const corners = obbCorners(box(0, 0, 2, 1));
    expect(corners).toHaveLength(4);
    for (const c of corners) {
      expect(Math.abs(c.x)).toBeCloseTo(2);
      expect(Math.abs(c.y)).toBeCloseTo(1);
    }
  });

  it("offsets corners by the box center", () => {
    const corners = obbCorners(box(10, 5, 1, 1));
    for (const c of corners) {
      expect(Math.abs(c.x - 10)).toBeCloseTo(1);
      expect(Math.abs(c.y - 5)).toBeCloseTo(1);
    }
  });
});

describe("obbOverlap", () => {
  it("detects two overlapping axis-aligned boxes", () => {
    const a = box(0, 0, 1, 1);
    const b = box(1, 0, 1, 1);
    expect(obbOverlap(a, b)).toBe(true);
  });

  it("detects two disjoint axis-aligned boxes", () => {
    const a = box(0, 0, 1, 1);
    const b = box(10, 0, 1, 1);
    expect(obbOverlap(a, b)).toBe(false);
  });

  it("treats exactly-touching boxes as not overlapping", () => {
    const a = box(0, 0, 1, 1);
    const b = box(2, 0, 1, 1);
    expect(obbOverlap(a, b)).toBe(false);
  });

  it("detects containment (one box fully inside another)", () => {
    const outer = box(0, 0, 5, 5);
    const inner = box(0, 0, 1, 1);
    expect(obbOverlap(outer, inner)).toBe(true);
  });

  it("detects overlap between rotated boxes", () => {
    const a = box(0, 0, 1, 0.5, 0);
    const b = box(0.5, 0.5, 1, 0.5, Math.PI / 4);
    expect(obbOverlap(a, b)).toBe(true);
  });

  it("separates rotated boxes correctly along a corner-diagonal axis", () => {
    // Two unit squares rotated 45°, positioned so an SAT-only-on-face-normals corner case applies.
    const a = box(0, 0, 1, 1, Math.PI / 4);
    const b = box(3, 0, 1, 1, Math.PI / 4);
    expect(obbOverlap(a, b)).toBe(false);
  });

  it("is symmetric: overlap(a,b) === overlap(b,a)", () => {
    const a = box(0, 0, 1, 1);
    const b = box(1.5, 0, 1, 1);
    expect(obbOverlap(a, b)).toBe(obbOverlap(b, a));
  });
});

describe("obbMtv", () => {
  it("returns null for disjoint boxes", () => {
    expect(obbMtv(box(0, 0, 1, 1), box(10, 0, 1, 1))).toBeNull();
  });

  it("returns a push vector that separates overlapping boxes when applied", () => {
    const a = box(0, 0, 1, 1);
    const b = box(1.5, 0, 1, 1);
    const mtv = obbMtv(a, b);
    expect(mtv).not.toBeNull();
    const pushed = box(a.center.x + mtv!.x, a.center.y + mtv!.y, a.halfL, a.halfW, a.rotation);
    expect(obbOverlap(pushed, b)).toBe(false);
  });

  it("pushes along the axis of least penetration", () => {
    // Deep overlap in y (small halfW overlap band), shallow in x.
    const a = box(0, 0, 5, 5);
    const b = box(1, 0, 5, 5);
    const mtv = obbMtv(a, b);
    expect(mtv).not.toBeNull();
    // centers are offset only in x, so the minimal-overlap axis should be x-dominant.
    expect(Math.abs(mtv!.x)).toBeGreaterThan(0);
  });

  it("returns a zero-length-safe vector for exactly coincident boxes", () => {
    const a = box(0, 0, 1, 1);
    const b = box(0, 0, 1, 1);
    const mtv = obbMtv(a, b);
    expect(mtv).not.toBeNull();
    expect(Number.isFinite(mtv!.x)).toBe(true);
    expect(Number.isFinite(mtv!.y)).toBe(true);
    expect(length(mtv!)).toBeGreaterThan(0);
  });

  it("is anti-symmetric: mtv(a,b) === -mtv(b,a)", () => {
    const a = box(0, 0, 1, 1);
    const b = box(1.5, 0, 1, 1);
    const ab = obbMtv(a, b)!;
    const ba = obbMtv(b, a)!;
    expect(ab.x).toBeCloseTo(-ba.x);
    expect(ab.y).toBeCloseTo(-ba.y);
  });
});
