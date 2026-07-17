import { describe, expect, it } from "vitest";
import type { Radians } from "./angles";
import { add, dot, length, midpoint, normalise, perp, rotate, scale, sub, vec2 } from "./vec2";

describe("vec2 basic ops", () => {
  it("adds", () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
  });

  it("subtracts", () => {
    expect(sub(vec2(5, 6), vec2(1, 2))).toEqual({ x: 4, y: 4 });
  });

  it("scales", () => {
    expect(scale(vec2(2, 3), 2)).toEqual({ x: 4, y: 6 });
    expect(scale(vec2(2, 3), 0)).toEqual({ x: 0, y: 0 });
  });

  it("dot products", () => {
    expect(dot(vec2(1, 0), vec2(0, 1))).toBe(0);
    expect(dot(vec2(2, 3), vec2(4, 5))).toBe(23);
  });

  it("perp rotates +90°", () => {
    const p = perp(vec2(1, 0));
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it("computes length", () => {
    expect(length(vec2(3, 4))).toBe(5);
    expect(length(vec2(0, 0))).toBe(0);
  });

  it("computes midpoint", () => {
    expect(midpoint(vec2(0, 0), vec2(4, 2))).toEqual({ x: 2, y: 1 });
  });
});

describe("rotate", () => {
  it("rotates by 0 unchanged", () => {
    const v = rotate(vec2(1, 0), 0 as Radians);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });

  it("rotates by π/2 counter-clockwise", () => {
    const v = rotate(vec2(1, 0), (Math.PI / 2) as Radians);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });

  it("rotates by π", () => {
    const v = rotate(vec2(1, 0), Math.PI as Radians);
    expect(v.x).toBeCloseTo(-1);
    expect(v.y).toBeCloseTo(0);
  });

  it("handles the zero vector", () => {
    const v = rotate(vec2(0, 0), (Math.PI / 3) as Radians);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
  });
});

describe("normalise", () => {
  it("returns a unit vector for a non-zero input", () => {
    const v = normalise(vec2(3, 4));
    expect(length(v)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
  });

  it("returns the zero vector for a zero-length input (edge case)", () => {
    expect(normalise(vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });
});
