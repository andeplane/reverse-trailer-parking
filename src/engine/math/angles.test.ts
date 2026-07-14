import { describe, expect, it } from "vitest";
import { clamp, lerp, normaliseAngle, safeTan } from "./angles";

describe("normaliseAngle", () => {
  it("leaves in-range angles unchanged", () => {
    expect(normaliseAngle(0)).toBeCloseTo(0);
    expect(normaliseAngle(1)).toBeCloseTo(1);
    expect(normaliseAngle(Math.PI)).toBeCloseTo(Math.PI);
  });

  it("wraps angles above π down into (−π, π]", () => {
    expect(normaliseAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1);
    expect(normaliseAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
  });

  it("wraps angles at/below −π up into (−π, π]", () => {
    expect(normaliseAngle(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1);
    expect(normaliseAngle(-Math.PI)).toBeCloseTo(Math.PI);
  });

  it("handles large multiples of tau", () => {
    expect(normaliseAngle(10 * Math.PI + 0.2)).toBeCloseTo(0.2);
    expect(normaliseAngle(-10 * Math.PI - 0.2)).toBeCloseTo(-0.2);
  });

  it("is always finite and within (−π, π]", () => {
    for (const a of [0, 1, -1, 100, -100, Math.PI, -Math.PI, 1e6, -1e6]) {
      const n = normaliseAngle(a);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThan(-Math.PI - 1e-9);
      expect(n).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});

describe("clamp", () => {
  it("passes through in-range values", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps below min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps above max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("handles negative ranges", () => {
    expect(clamp(-1, -10, -2)).toBe(-2);
  });
});

describe("lerp", () => {
  it("returns a at t=0 and b at t=1", () => {
    expect(lerp(2, 8, 0)).toBe(2);
    expect(lerp(2, 8, 1)).toBe(8);
  });

  it("interpolates at t=0.5", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it("extrapolates outside [0,1]", () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });
});

describe("safeTan", () => {
  it("matches Math.tan away from the asymptote", () => {
    expect(safeTan(0)).toBeCloseTo(0);
    expect(safeTan(Math.PI / 4)).toBeCloseTo(1);
    expect(safeTan(-Math.PI / 4)).toBeCloseTo(-1);
  });

  it("stays finite near +π/2", () => {
    const result = safeTan(Math.PI / 2);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("stays finite near −π/2", () => {
    const result = safeTan(-Math.PI / 2);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("stays finite far beyond the asymptote", () => {
    expect(Number.isFinite(safeTan(10))).toBe(true);
    expect(Number.isFinite(safeTan(-10))).toBe(true);
  });
});
