// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { Clock } from "../../engine/loop/clock";
import type { Entity, Renderer } from "../../engine/render/renderer";
import type { Vec2 } from "../../engine/math/vec2";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import type { Level } from "../level/level-types";
import { createApp } from "./app-shell";

class FakeClock implements Clock {
  private t = 0;
  now(): number {
    return this.t;
  }
}

function fakeRenderer(): Renderer & { syncs: Entity[][]; follows: Vec2[] } {
  const syncs: Entity[][] = [];
  const follows: Vec2[] = [];
  return {
    syncs,
    follows,
    sync: (e) => syncs.push(e),
    follow: (t) => follows.push(t),
    setCamera: () => {},
    screenToWorld: () => ({ x: 0, y: 0 }),
    dispose: () => {},
  };
}

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function level(id: string): Level {
  return {
    id,
    name: id,
    size: { width: 30, height: 30 },
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [],
    props: [],
    exit: { a: { x: 15, y: -3 }, b: { x: 15, y: 3 }, outward: { x: 1, y: 0 } },
  };
}

let controlsRoot: HTMLElement | undefined;
afterEach(() => controlsRoot?.remove());

function makeApp() {
  controlsRoot = document.createElement("div");
  document.body.appendChild(controlsRoot);
  const renderer = fakeRenderer();
  const app = createApp({
    clock: new FakeClock(),
    renderer,
    controlsRoot,
    catalog,
    levels: [level("a"), level("b")],
    isTouch: false,
  });
  return { app, renderer, controlsRoot };
}

describe("createApp", () => {
  it("shows the menu with a card per level", () => {
    const { app, controlsRoot } = makeApp();
    app.showMenu();
    expect(controlsRoot.querySelectorAll(".menu-level-card")).toHaveLength(2);
  });

  it("switches to play when a level card is clicked, and drives the world on tick", () => {
    const { app, controlsRoot, renderer } = makeApp();
    app.showMenu();
    (controlsRoot.querySelector(".menu-level-card") as HTMLElement).click();
    expect(controlsRoot.querySelector(".menu-screen")).toBeNull();
    expect(controlsRoot.querySelector(".play-back-button")).not.toBeNull();
    app.tick(1000 / 60);
    expect(renderer.syncs.length).toBeGreaterThan(0);
  });

  it("returns to the menu from the play back button", () => {
    const { app, controlsRoot } = makeApp();
    app.showMenu();
    (controlsRoot.querySelector(".menu-level-card") as HTMLElement).click();
    (controlsRoot.querySelector(".play-back-button") as HTMLElement).click();
    expect(controlsRoot.querySelector(".menu-screen")).not.toBeNull();
    expect(controlsRoot.querySelector(".play-back-button")).toBeNull();
  });

  it("clears the world render when returning to the menu", () => {
    const { app, renderer } = makeApp();
    app.showMenu();
    expect(renderer.syncs.at(-1)).toEqual([]); // cleared
  });

  it("opens the level editor from the menu's editor button", () => {
    const { app, controlsRoot } = makeApp();
    app.showMenu();
    (controlsRoot.querySelector(".menu-edit-button") as HTMLElement).click();
    expect(controlsRoot.querySelector(".editor-screen")).not.toBeNull();
    app.showMenu();
    expect(controlsRoot.querySelector(".editor-screen")).toBeNull();
  });
});
