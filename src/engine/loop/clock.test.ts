import { describe, expect, it } from "vitest";
import { performanceClock } from "./clock";

describe("performanceClock", () => {
  it("returns a finite number from now()", () => {
    const t = performanceClock.now();
    expect(typeof t).toBe("number");
    expect(Number.isFinite(t)).toBe(true);
  });

  it("does not decrease across calls (monotonic)", () => {
    const a = performanceClock.now();
    const b = performanceClock.now();
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
