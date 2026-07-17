import { describe, expect, it } from "vitest";
import { clampControlInput } from "./input-source";

describe("clampControlInput", () => {
  it("passes through in-range values", () => {
    expect(clampControlInput({ throttle: 0.5, steer: -0.5 })).toEqual({ throttle: 0.5, steer: -0.5 });
  });

  it("clamps throttle above 1", () => {
    expect(clampControlInput({ throttle: 2, steer: 0 }).throttle).toBe(1);
  });

  it("clamps throttle below -1", () => {
    expect(clampControlInput({ throttle: -5, steer: 0 }).throttle).toBe(-1);
  });

  it("clamps steer above 1", () => {
    expect(clampControlInput({ throttle: 0, steer: 3 }).steer).toBe(1);
  });

  it("clamps steer below -1", () => {
    expect(clampControlInput({ throttle: 0, steer: -3 }).steer).toBe(-1);
  });
});
