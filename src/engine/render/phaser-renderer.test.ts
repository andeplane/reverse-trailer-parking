import { describe, expect, it } from "vitest";
import type { Radians } from "../math/angles";
import type { Metres } from "../math/units";
import type { Entity, EntityVisual } from "./renderer";
import type { PhaserSurface } from "./phaser-surface";
import { createPhaserRenderer } from "./phaser-renderer";

type Call =
  | { op: "sprite"; id: string; texture: string; width: number; length: number; tint?: number }
  | { op: "rect"; id: string; fillColor: number }
  | { op: "transform"; id: string; x: number; y: number; rotation: number }
  | { op: "remove"; id: string }
  | { op: "camera"; x: number; y: number };

function fakeSurface(): { surface: PhaserSurface; calls: Call[] } {
  const calls: Call[] = [];
  const surface: PhaserSurface = {
    addSprite: (id, texture, spec) =>
      calls.push({
        op: "sprite",
        id,
        texture,
        width: spec.width,
        length: spec.length,
        ...(spec.tint !== undefined ? { tint: spec.tint } : {}),
      }),
    addRect: (id, spec) => calls.push({ op: "rect", id, fillColor: spec.fillColor }),
    setTransform: (id, x, y, rotation) => calls.push({ op: "transform", id, x, y, rotation }),
    remove: (id) => calls.push({ op: "remove", id }),
    centerCamera: (x, y) => calls.push({ op: "camera", x, y }),
    worldToClient: () => ({ x: 0, y: 0 }),
    setCamera: () => {},
    clientToWorld: () => ({ x: 0, y: 0 }),
  };
  return { surface, calls };
}

const SPRITE: EntityVisual = { kind: "sprite", texture: "car-sedan" };
const RECT: EntityVisual = {
  kind: "rect",
  style: { fillColor: 0x123456, strokeColor: 0, strokeWidth: 0 as Metres, cornerRadius: 0 as Metres },
};

function entity(id: string, visual: EntityVisual, x = 0, y = 0, rotation = 0): Entity {
  return {
    id,
    position: { x, y },
    rotation: rotation as Radians,
    size: { width: 2 as Metres, length: 4 as Metres },
    visual,
  };
}

describe("createPhaserRenderer", () => {
  it("adds a sprite + sets its transform the first time a sprite entity is seen", () => {
    const { surface, calls } = fakeSurface();
    createPhaserRenderer({ surface }).sync([entity("a", SPRITE, 1, 2, 0.5)]);
    expect(calls).toEqual([
      { op: "sprite", id: "a", texture: "car-sedan", width: 2, length: 4 },
      { op: "transform", id: "a", x: 1, y: 2, rotation: 0.5 },
    ]);
  });

  it("passes a sprite's tint through, and repaints it when the tint changes", () => {
    const { surface, calls } = fakeSurface();
    const renderer = createPhaserRenderer({ surface });
    const blue: EntityVisual = { kind: "sprite", texture: "car-sedan", tint: 0x2f6fb5 };
    const green: EntityVisual = { kind: "sprite", texture: "car-sedan", tint: 0x2f7d5f };
    renderer.sync([entity("a", blue)]);
    expect(calls[0]).toEqual({ op: "sprite", id: "a", texture: "car-sedan", width: 2, length: 4, tint: 0x2f6fb5 });

    calls.length = 0;
    renderer.sync([entity("a", blue)]);
    expect(calls.some((c) => c.op === "sprite")).toBe(false); // same paint → no rebuild

    renderer.sync([entity("a", green)]);
    expect(calls).toContainEqual({ op: "remove", id: "a" });
    expect(calls).toContainEqual({ op: "sprite", id: "a", texture: "car-sedan", width: 2, length: 4, tint: 0x2f7d5f });
  });

  it("adds a rect for a rect-visual entity", () => {
    const { surface, calls } = fakeSurface();
    createPhaserRenderer({ surface }).sync([entity("bar", RECT)]);
    expect(calls[0]).toEqual({ op: "rect", id: "bar", fillColor: 0x123456 });
  });

  it("only updates the transform (no re-add) on subsequent syncs of the same id", () => {
    const { surface, calls } = fakeSurface();
    const renderer = createPhaserRenderer({ surface });
    renderer.sync([entity("a", SPRITE)]);
    calls.length = 0;
    renderer.sync([entity("a", SPRITE, 5, 5, 1)]);
    expect(calls).toEqual([{ op: "transform", id: "a", x: 5, y: 5, rotation: 1 }]);
  });

  it("removes an item once its entity disappears from the sync list", () => {
    const { surface, calls } = fakeSurface();
    const renderer = createPhaserRenderer({ surface });
    renderer.sync([entity("a", SPRITE), entity("b", SPRITE)]);
    calls.length = 0;
    renderer.sync([entity("a", SPRITE)]);
    expect(calls).toEqual([
      { op: "remove", id: "b" },
      { op: "transform", id: "a", x: 0, y: 0, rotation: 0 },
    ]);
  });

  it("centres the camera via follow()", () => {
    const { surface, calls } = fakeSurface();
    createPhaserRenderer({ surface }).follow({ x: 3, y: 4 });
    expect(calls).toEqual([{ op: "camera", x: 3, y: 4 }]);
  });

  it("removes every live item on dispose()", () => {
    const { surface, calls } = fakeSurface();
    const renderer = createPhaserRenderer({ surface });
    renderer.sync([entity("a", SPRITE), entity("b", RECT)]);
    calls.length = 0;
    renderer.dispose();
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.op === "remove")).toBe(true);
  });
});
