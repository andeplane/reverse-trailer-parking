import { describe, expect, it } from "vitest";
import { wheelZoomFactor } from "./wheel-zoom";

describe("wheelZoomFactor", () => {
  it("zooms in when scrolling up and out when scrolling down", () => {
    expect(wheelZoomFactor({ deltaY: -100 })).toBeGreaterThan(1);
    expect(wheelZoomFactor({ deltaY: 100 })).toBeLessThan(1);
  });

  it("is symmetric: scrolling back exactly undoes the zoom", () => {
    expect(wheelZoomFactor({ deltaY: -60 }) * wheelZoomFactor({ deltaY: 60 })).toBeCloseTo(1, 10);
  });

  it("does nothing for a zero delta", () => {
    expect(wheelZoomFactor({ deltaY: 0 })).toBe(1);
  });

  it("scales with the distance scrolled, not the number of events", () => {
    // A trackpad's many tiny events must add up to the same zoom as one big mouse notch.
    const oneNotch = wheelZoomFactor({ deltaY: -100 });
    let trackpad = 1;
    for (let i = 0; i < 50; i++) trackpad *= wheelZoomFactor({ deltaY: -2 });
    expect(trackpad).toBeCloseTo(oneNotch, 10);
  });

  it("keeps a mouse notch to a modest step", () => {
    expect(wheelZoomFactor({ deltaY: -100 })).toBeLessThan(1.25);
    expect(wheelZoomFactor({ deltaY: -100 })).toBeGreaterThan(1.1);
  });

  it("converts line and page deltas to pixels", () => {
    expect(wheelZoomFactor({ deltaY: -3, deltaMode: 1 })).toBeGreaterThan(wheelZoomFactor({ deltaY: -3 }));
    expect(wheelZoomFactor({ deltaY: -1, deltaMode: 2 })).toBeGreaterThan(wheelZoomFactor({ deltaY: -1, deltaMode: 1 }));
  });

  it("caps a single momentum burst so the view cannot snap", () => {
    expect(wheelZoomFactor({ deltaY: -5000 })).toBe(wheelZoomFactor({ deltaY: -120 }));
    expect(wheelZoomFactor({ deltaY: 5000 })).toBe(wheelZoomFactor({ deltaY: 120 }));
  });

  it("ignores a non-finite delta rather than producing NaN zoom", () => {
    expect(wheelZoomFactor({ deltaY: Number.NaN })).toBe(1);
  });
});
