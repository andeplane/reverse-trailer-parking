// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { filledGrid } from "../level/tile-types";
import type { Clock } from "../../engine/loop/clock";
import type { Entity, Renderer } from "../../engine/render/renderer";
import type { Vec2 } from "../../engine/math/vec2";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import type { Level } from "../level/level-types";
import { saveCustomLevel, type LevelStorage } from "../level/level-store";
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
    worldToScreen: () => ({ x: 0, y: 0 }),
    dispose: () => {},
  };
}

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function level(id: string): Level {
  return {
    id,
    name: id,
    grid: filledGrid(6, 6, 5),
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [],
    exit: { a: { x: 15, y: -3 }, b: { x: 15, y: 3 }, outward: { x: 1, y: 0 } },
  };
}

let controlsRoot: HTMLElement | undefined;
afterEach(() => controlsRoot?.remove());

function fakeStorage(): LevelStorage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
}

function makeApp(storage?: LevelStorage) {
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
    ...(storage ? { storage } : {}),
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

  it("merges custom levels from storage on top of bundled ones", () => {
    const storage = fakeStorage();
    saveCustomLevel({ ...level("a"), name: "a (custom)" }, storage);
    saveCustomLevel(level("mine"), storage);
    const { app, controlsRoot } = makeApp(storage);
    app.showMenu();
    const cards = [...controlsRoot.querySelectorAll(".menu-level-card")];
    expect(cards).toHaveLength(3); // a (overridden), b, mine
    expect(cards.find((c) => (c as HTMLElement).dataset.levelId === "a")?.textContent).toContain("a (custom)");
  });

  it("opens an existing level in the editor and deletes a custom level from the menu", () => {
    const storage = fakeStorage();
    saveCustomLevel(level("mine"), storage);
    const { app, controlsRoot } = makeApp(storage);
    app.showMenu();
    (controlsRoot.querySelector(".menu-level-edit") as HTMLElement).click();
    expect((controlsRoot.querySelector(".editor-name") as HTMLInputElement).value).toBe("a");

    app.showMenu();
    const del = controlsRoot.querySelector(".menu-level-delete") as HTMLElement;
    del.click(); // arm the inline confirm
    del.click(); // confirm
    expect(controlsRoot.querySelectorAll(".menu-level-card")).toHaveLength(2); // mine is gone
  });

  it("saving in the editor persists to storage and shows on the menu", () => {
    const storage = fakeStorage();
    const { app, controlsRoot } = makeApp(storage);
    app.openEditor();
    const name = controlsRoot.querySelector(".editor-name") as HTMLInputElement;
    name.value = "Fresh";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    app.showMenu();
    const names = [...controlsRoot.querySelectorAll(".menu-level-card")].map((c) => c.textContent);
    expect(names.some((n) => n?.includes("Fresh"))).toBe(true);
  });

  it("gives every new draft a unique default name", () => {
    const storage = fakeStorage();
    const { app, controlsRoot } = makeApp(storage);
    app.openEditor();
    expect((controlsRoot.querySelector(".editor-name") as HTMLInputElement).value).toBe("New level");
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    app.openEditor();
    expect((controlsRoot.querySelector(".editor-name") as HTMLInputElement).value).toBe("New level 2");
  });

  it("testing an editor draft returns to the editor (not the menu) with the draft intact", () => {
    const { app, controlsRoot } = makeApp();
    app.openEditor();
    const name = controlsRoot.querySelector(".editor-name") as HTMLInputElement;
    name.value = "Draft under test";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    (controlsRoot.querySelector(".editor-test") as HTMLElement).click();
    expect(controlsRoot.querySelector(".play-back-button")).not.toBeNull();
    (controlsRoot.querySelector(".play-back-button") as HTMLElement).click();
    expect(controlsRoot.querySelector(".editor-screen")).not.toBeNull();
    expect((controlsRoot.querySelector(".editor-name") as HTMLInputElement).value).toBe("Draft under test");
  });

  it("still guards unsaved changes after a Test round-trip (baseline survives)", () => {
    const { app, controlsRoot } = makeApp();
    app.openEditor();
    const name = controlsRoot.querySelector(".editor-name") as HTMLInputElement;
    name.value = "Never saved";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    (controlsRoot.querySelector(".editor-test") as HTMLElement).click();
    (controlsRoot.querySelector(".play-back-button") as HTMLElement).click();
    // Back in the editor: the draft was never persisted, so exiting must still prompt.
    (controlsRoot.querySelector(".editor-menu") as HTMLElement).click();
    expect(controlsRoot.querySelector(".editor-exit-dialog.open")).not.toBeNull();
    expect(controlsRoot.querySelector(".menu-screen")).toBeNull();
  });
});
