// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Entity, Renderer } from "../../engine/render/renderer";
import type { Vec2 } from "../../engine/math/vec2";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import { createAttractMode } from "./attract-mode";

type CameraCall = { center: Vec2; zoom: number };

function fakeRenderer(): Renderer & { syncs: Entity[][]; cameraCalls: CameraCall[] } {
  const syncs: Entity[][] = [];
  const cameraCalls: CameraCall[] = [];
  return {
    syncs,
    cameraCalls,
    sync: (e) => syncs.push(e),
    follow: () => {},
    setCamera: (center, zoom) => cameraCalls.push({ center, zoom }),
    screenToWorld: () => ({ x: 0, y: 0 }),
    worldToScreen: () => ({ x: 0, y: 0 }),
    dispose: () => {},
  };
}

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

describe("createAttractMode", () => {
  it("renders nothing until the deferred generation has run", () => {
    vi.useFakeTimers();
    try {
      const renderer = fakeRenderer();
      const attract = createAttractMode({ renderer, catalog, seed: 1 });
      attract.tick(16);
      expect(renderer.syncs).toHaveLength(0); // still pending — the menu paints first
      attract.dispose();
      vi.runAllTimers(); // a disposed demo never generates
      attract.tick(16);
      expect(renderer.syncs).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("generates, then plays the autopilot solution back frame by frame", { timeout: 60_000 }, () => {
    vi.useFakeTimers();
    try {
      const renderer = fakeRenderer();
      const attract = createAttractMode({ renderer, catalog, seed: 1 });
      vi.runAllTimers(); // fire the deferred (synchronous) generation
      attract.tick(16);
      expect(renderer.syncs).toHaveLength(1);
      expect(renderer.syncs[0]!.length).toBeGreaterThan(0); // tiles + rig entities
      expect(renderer.cameraCalls[0]?.center).toEqual({ x: 0, y: 0 }); // fits the whole map
      const first = renderer.syncs[0]!;
      for (let i = 0; i < 120; i++) attract.tick(16); // ~2s of playback
      const later = renderer.syncs.at(-1)!;
      // The drivable rig has moved between frames (the demo actually animates).
      const posOf = (entities: Entity[]) => JSON.stringify(entities.map((e) => e.position));
      expect(posOf(later)).not.toBe(posOf(first));
      attract.dispose();
      const count = renderer.syncs.length;
      attract.tick(16); // disposed — no further rendering
      expect(renderer.syncs).toHaveLength(count);
    } finally {
      vi.useRealTimers();
    }
  });
});
