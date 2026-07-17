import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import { bindSteeringIndicator, steerToRotation } from "./steering-indicator";

const STEER_MAX = 0.6 as Radians;

describe("steerToRotation", () => {
  it("returns 0 rotation at centre steer", () => {
    expect(steerToRotation(0 as Radians, STEER_MAX)).toBeCloseTo(0);
  });

  it("returns +π/2 at full lock one way", () => {
    expect(steerToRotation(STEER_MAX, STEER_MAX)).toBeCloseTo(Math.PI / 2);
  });

  it("returns −π/2 at full lock the other way", () => {
    expect(steerToRotation((-STEER_MAX) as Radians, STEER_MAX)).toBeCloseTo(-Math.PI / 2);
  });

  it("scales proportionally for a partial steer angle", () => {
    expect(steerToRotation((STEER_MAX / 2) as Radians, STEER_MAX)).toBeCloseTo(Math.PI / 4);
  });

  it("clamps beyond steerMax defensively", () => {
    expect(steerToRotation((STEER_MAX * 2) as Radians, STEER_MAX)).toBeCloseTo(Math.PI / 2);
  });
});

describe("bindSteeringIndicator", () => {
  it("sets a CSS rotate transform on the element", () => {
    const el = document.createElement("div");
    const update = bindSteeringIndicator(el);
    update((Math.PI / 4) as Radians);
    expect(el.style.transform).toBe(`rotate(${Math.PI / 4}rad)`);
  });

  it("updates the transform on repeated calls", () => {
    const el = document.createElement("div");
    const update = bindSteeringIndicator(el);
    update(0 as Radians);
    expect(el.style.transform).toBe("rotate(0rad)");
    update((-Math.PI / 2) as Radians);
    expect(el.style.transform).toBe(`rotate(${-Math.PI / 2}rad)`);
  });
});
