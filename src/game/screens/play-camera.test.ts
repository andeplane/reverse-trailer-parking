import { describe, expect, it } from "vitest";
import { createPlayCamera } from "./play-camera";

function cam(overrides: Partial<{ minZoom: number; maxZoom: number; maxPanRadius: number }> = {}) {
  return createPlayCamera({ minZoom: 0.5, maxZoom: 3, maxPanRadius: 100, ...overrides });
}

describe("createPlayCamera", () => {
  it("defaults to the follow view: centred on the rig at zoom 1, not adjusted", () => {
    const c = cam();
    expect(c.frameFor({ x: 2, y: 3 })).toEqual({ center: { x: 2, y: 3 }, zoom: 1 });
    expect(c.isAdjusted()).toBe(false);
  });

  it("panBy offsets the view, and the offset rides along with the rig", () => {
    const c = cam();
    c.panBy({ x: 1, y: -2 });
    expect(c.frameFor({ x: 0, y: 0 }).center).toEqual({ x: 1, y: -2 });
    expect(c.frameFor({ x: 10, y: 10 }).center).toEqual({ x: 11, y: 8 });
    expect(c.isAdjusted()).toBe(true);
  });

  it("resetPan returns the view to the rig but keeps the zoom", () => {
    const c = cam();
    c.panBy({ x: 5, y: 5 });
    c.zoomAt({ anchor: { x: 0, y: 0 }, factor: 2, rig: { x: 0, y: 0 } });
    c.resetPan();
    const frame = c.frameFor({ x: 1, y: 1 });
    expect(frame.center).toEqual({ x: 1, y: 1 });
    expect(frame.zoom).toBe(2);
    expect(c.isAdjusted()).toBe(true); // zoom still differs from the default
  });

  it("zoomAt keeps the anchor's screen position fixed", () => {
    const c = cam();
    const rig = { x: 0, y: 0 };
    const anchor = { x: 4, y: 2 };
    const before = c.frameFor(rig);
    c.zoomAt({ anchor, factor: 2, rig });
    const after = c.frameFor(rig);
    expect(after.zoom).toBe(2);
    // Screen offset of the anchor from the centre is (anchor - center) * zoom — must be unchanged.
    expect((anchor.x - after.center.x) * after.zoom).toBeCloseTo((anchor.x - before.center.x) * before.zoom);
    expect((anchor.y - after.center.y) * after.zoom).toBeCloseTo((anchor.y - before.center.y) * before.zoom);
    expect(after.center).toEqual({ x: 2, y: 1 });
  });

  it("clamps zoom to [minZoom, maxZoom], leaving the centre alone when fully clamped", () => {
    const c = cam();
    c.zoomAt({ anchor: { x: 4, y: 2 }, factor: 100, rig: { x: 0, y: 0 } });
    expect(c.frameFor({ x: 0, y: 0 }).zoom).toBe(3);
    const centreAtMax = c.frameFor({ x: 0, y: 0 }).center;
    c.zoomAt({ anchor: { x: 4, y: 2 }, factor: 2, rig: { x: 0, y: 0 } }); // already at max
    expect(c.frameFor({ x: 0, y: 0 }).center).toEqual(centreAtMax);
    c.zoomAt({ anchor: { x: 0, y: 0 }, factor: 0.0001, rig: { x: 0, y: 0 } });
    expect(c.frameFor({ x: 0, y: 0 }).zoom).toBe(0.5);
  });

  it("clamps the pan offset to maxPanRadius so the map stays findable", () => {
    const c = cam({ maxPanRadius: 10 });
    c.panBy({ x: 1000, y: 0 });
    expect(c.frameFor({ x: 0, y: 0 }).center).toEqual({ x: 10, y: 0 });
  });

  it("reset restores the default follow view", () => {
    const c = cam();
    c.panBy({ x: 3, y: 4 });
    c.zoomAt({ anchor: { x: 1, y: 1 }, factor: 2, rig: { x: 0, y: 0 } });
    c.reset();
    expect(c.frameFor({ x: 0, y: 0 })).toEqual({ center: { x: 0, y: 0 }, zoom: 1 });
    expect(c.isAdjusted()).toBe(false);
  });
});
