// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Radians } from "../engine/math/angles";
import type { Seconds } from "../engine/math/units";
import type { Clock } from "../engine/loop/clock";
import type { ControlInput, InputSource } from "../engine/input/input-source";
import type { Entity } from "../engine/render/renderer";
import type { Renderer } from "../engine/render/renderer";
import type { Vec2 } from "../engine/math/vec2";
import { createVariantCatalog } from "./vehicle/variants";
import type { CarSpawn } from "./vehicle/vehicle-types";
import { createWorld } from "./vehicle/world";
import { createSandbox } from "./sandbox";

class FakeClock implements Clock {
  private time = 0;
  now(): number {
    return this.time;
  }
  set(t: number): void {
    this.time = t;
  }
}

function fakeInput(input: ControlInput): InputSource {
  let disposed = false;
  return {
    read: () => input,
    dispose: () => {
      disposed = true;
    },
    get wasDisposed() {
      return disposed;
    },
  } as InputSource & { wasDisposed: boolean };
}

function fakeRenderer(): Renderer & { syncCalls: Entity[][]; followCalls: Vec2[]; disposed: boolean } {
  const syncCalls: Entity[][] = [];
  const followCalls: Vec2[] = [];
  return {
    syncCalls,
    followCalls,
    disposed: false,
    sync(entities) {
      syncCalls.push(entities);
    },
    follow(target) {
      followCalls.push(target);
    },
    dispose() {
      this.disposed = true;
    },
  };
}

function buildWorld() {
  const catalog = createVariantCatalog();
  const cars: CarSpawn[] = [
    { variantId: "sedan", role: "drivable", position: { x: 0, y: 0 }, heading: 0 as Radians },
  ];
  return createWorld({ cars, boundary: [], catalog });
}

describe("createSandbox", () => {
  it("advances the world and syncs the renderer each fixed step", () => {
    const clock = new FakeClock();
    const input = fakeInput({ throttle: 1, steer: 0 });
    const renderer = fakeRenderer();
    const world = buildWorld();
    const sandbox = createSandbox({ clock, input, renderer, world, dt: (1 / 60) as Seconds });

    sandbox.tick(1000 / 60);

    expect(renderer.syncCalls).toHaveLength(1);
    expect(renderer.followCalls).toHaveLength(1);
    expect(renderer.followCalls[0]).not.toEqual({ x: 0, y: 0 });
  });

  it("does not advance the rig across ticks with zero elapsed time", () => {
    const clock = new FakeClock();
    const input = fakeInput({ throttle: 1, steer: 0 });
    const renderer = fakeRenderer();
    const world = buildWorld();
    const sandbox = createSandbox({ clock, input, renderer, world, dt: (1 / 60) as Seconds });

    sandbox.tick(0);
    expect(renderer.followCalls[0]).toEqual({ x: 0, y: 0 });
  });

  it("reset() restores the world to its state at creation", () => {
    const clock = new FakeClock();
    const input = fakeInput({ throttle: 1, steer: 0 });
    const renderer = fakeRenderer();
    const world = buildWorld();
    const sandbox = createSandbox({ clock, input, renderer, world, dt: (1 / 60) as Seconds });

    sandbox.tick(1000); // drive far away
    const movedFollow = renderer.followCalls.at(-1)!;
    expect(movedFollow).not.toEqual({ x: 0, y: 0 });

    sandbox.reset();
    const resetFollow = renderer.followCalls.at(-1)!;
    expect(resetFollow).toEqual({ x: 0, y: 0 });
  });

  it("reset() invokes the onReset callback", () => {
    const clock = new FakeClock();
    const input = fakeInput({ throttle: 0, steer: 0 });
    const renderer = fakeRenderer();
    const world = buildWorld();
    let resetCalled = false;
    const sandbox = createSandbox({
      clock,
      input,
      renderer,
      world,
      dt: (1 / 60) as Seconds,
      onReset: () => {
        resetCalled = true;
      },
    });

    sandbox.reset();
    expect(resetCalled).toBe(true);
  });

  it("dispose() disposes both the input and the renderer", () => {
    const clock = new FakeClock();
    const input = fakeInput({ throttle: 0, steer: 0 }) as InputSource & { wasDisposed: boolean };
    const renderer = fakeRenderer();
    const world = buildWorld();
    const sandbox = createSandbox({ clock, input, renderer, world, dt: (1 / 60) as Seconds });

    sandbox.dispose();
    expect(input.wasDisposed).toBe(true);
    expect(renderer.disposed).toBe(true);
  });

  it("falls back to the default fixed timestep when dt is omitted", () => {
    const clock = new FakeClock();
    const input = fakeInput({ throttle: 1, steer: 0 });
    const renderer = fakeRenderer();
    const world = buildWorld();
    const sandbox = createSandbox({ clock, input, renderer, world });
    expect(() => sandbox.tick(1000 / 60)).not.toThrow();
    expect(renderer.syncCalls.length).toBeGreaterThan(0);
  });

  it("ticks without a steering element bound (no HUD wiring)", () => {
    const clock = new FakeClock();
    const input = fakeInput({ throttle: 1, steer: 0.5 });
    const renderer = fakeRenderer();
    const world = buildWorld();
    const sandbox = createSandbox({ clock, input, renderer, world, dt: (1 / 60) as Seconds });
    expect(() => sandbox.tick(1000 / 60)).not.toThrow();
    expect(renderer.syncCalls.length).toBeGreaterThan(0);
  });

  it("updates a bound steering indicator element", () => {
    const clock = new FakeClock();
    const input = fakeInput({ throttle: 0, steer: 1 });
    const renderer = fakeRenderer();
    const world = buildWorld();
    const el = document.createElement("div");
    const sandbox = createSandbox({ clock, input, renderer, world, dt: (1 / 60) as Seconds, steeringEl: el });

    sandbox.tick(1000 / 60);
    expect(el.style.transform).not.toBe("");
  });
});
