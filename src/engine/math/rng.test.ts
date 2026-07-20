import { describe, expect, it } from "vitest";
import { mulberry32, rngInt, rngPick, rngRange } from "./rng";

describe("mulberry32", () => {
  it("produces the same sequence for the same seed", () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const diffs = Array.from({ length: 10 }, () => a.next() !== b.next());
    expect(diffs).toContain(true);
  });

  it("always yields floats in [0, 1)", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("coerces the seed to uint32 (negative seeds are valid)", () => {
    expect(mulberry32(-1).next()).toBe(mulberry32(0xffffffff).next());
  });
});

describe("rngRange", () => {
  it("stays within [min, max)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = rngRange({ rng, min: -3, max: 5 });
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(5);
    }
  });

  it("degenerates to min when min === max", () => {
    expect(rngRange({ rng: mulberry32(1), min: 4, max: 4 })).toBe(4);
  });
});

describe("rngInt", () => {
  it("is inclusive of both endpoints", () => {
    const rng = mulberry32(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rngInt({ rng, min: 2, max: 5 }));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it("returns min for a single-value range", () => {
    expect(rngInt({ rng: mulberry32(1), min: 9, max: 9 })).toBe(9);
  });
});

describe("rngPick", () => {
  it("eventually picks every element", () => {
    const rng = mulberry32(11);
    const items = ["a", "b", "c"] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(rngPick(rng, items));
    expect(seen.size).toBe(3);
  });

  it("throws a RangeError on an empty list", () => {
    expect(() => rngPick(mulberry32(1), [])).toThrow(RangeError);
  });
});
