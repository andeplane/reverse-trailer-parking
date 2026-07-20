import { describe, expect, it } from "vitest";
import { fitZoom, PIXELS_PER_METRE } from "./camera-fit";

describe("fitZoom", () => {
  // Without a window (node environment) fitZoom assumes a 1000×800 viewport.
  it("fits the tighter axis with a 8% margin", () => {
    // 31.25 m × 32 px/m = 1000 px wide → width is the limiting axis at exactly 1.
    expect(fitZoom(31.25, 5)).toBeCloseTo(0.92);
    // 25 m × 32 px/m = 800 px tall → height limits.
    expect(fitZoom(5, 25)).toBeCloseTo(0.92);
  });

  it("scales inversely with the map size", () => {
    expect(fitZoom(62.5, 5)).toBeCloseTo(0.46);
  });

  it("exposes the engine's render scale", () => {
    expect(PIXELS_PER_METRE).toBe(32);
  });
});
