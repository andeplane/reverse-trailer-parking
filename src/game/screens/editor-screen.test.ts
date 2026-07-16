// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { Entity, Renderer } from "../../engine/render/renderer";
import type { Vec2 } from "../../engine/math/vec2";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import type { Level } from "../level/level-types";
import { createEditorScreen } from "./editor-screen";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function fakeRenderer(worldPoint: Vec2): Renderer & { syncs: number; camera: number } {
  const r = {
    syncs: 0,
    camera: 0,
    sync: (_e: Entity[]) => {
      r.syncs += 1;
    },
    follow: () => {},
    setCamera: () => {
      r.camera += 1;
    },
    screenToWorld: () => worldPoint,
    dispose: () => {},
  };
  return r;
}

function pointer(type: string, clientX = 100, clientY = 100): Event {
  return new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true });
}

let controlsRoot: HTMLElement | undefined;
afterEach(() => controlsRoot?.remove());

function mount(worldPoint: Vec2 = { x: 5, y: 4 }) {
  controlsRoot = document.createElement("div");
  document.body.appendChild(controlsRoot);
  let tested: Level | undefined;
  let saved: Level | undefined;
  let menu = 0;
  const renderer = fakeRenderer(worldPoint);
  const screen = createEditorScreen({
    renderer,
    controlsRoot,
    catalog,
    onExitToMenu: () => (menu += 1),
    onTest: (l) => (tested = l),
    onSave: (l) => (saved = l),
  });
  return { screen, controlsRoot, renderer, getTested: () => tested, getSaved: () => saved, getMenu: () => menu };
}

function capture(root: HTMLElement): HTMLElement {
  return root.querySelector(".editor-capture") as HTMLElement;
}

describe("createEditorScreen", () => {
  it("mounts a tile-brush palette, a car picker, and a topbar", () => {
    const { controlsRoot } = mount();
    expect(controlsRoot.querySelector('[data-tile="grass"]')).not.toBeNull();
    expect(controlsRoot.querySelector('[data-tile="bay"]')).not.toBeNull();
    expect(controlsRoot.querySelector(".editor-car")).not.toBeNull();
    expect(controlsRoot.querySelectorAll(".editor-car-chip").length).toBe(allCarVariants.length);
    expect(controlsRoot.querySelector(".editor-test")).not.toBeNull();
  });

  it("paints a tile onto the grid where the pointer maps", () => {
    const { controlsRoot, getSaved } = mount({ x: 0, y: 0 });
    (controlsRoot.querySelector('[data-tile="grass"]') as HTMLElement).click();
    const cap = capture(controlsRoot);
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    expect(getSaved()?.grid.cells.some((c) => c.type === "grass")).toBe(true);
  });

  it("places a car from the picker and includes it when saved", () => {
    const { controlsRoot, getSaved } = mount({ x: 6, y: 3 });
    (controlsRoot.querySelector('.editor-car-chip[data-variant="suv"]') as HTMLElement).click();
    const cap = capture(controlsRoot);
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    expect(getSaved()?.placedCars).toHaveLength(1);
    expect(getSaved()?.placedCars[0]?.variantId).toBe("suv");
  });

  it("refuses to place a car on top of another car", () => {
    const { controlsRoot, getSaved } = mount({ x: 6, y: 3 });
    const cap = capture(controlsRoot);
    (controlsRoot.querySelector(".editor-car") as HTMLElement).click();
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    cap.dispatchEvent(pointer("pointerdown")); // second attempt at the same spot
    cap.dispatchEvent(pointer("pointerup"));
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    expect(getSaved()?.placedCars).toHaveLength(1); // not two
  });

  it("undoes the last change with Ctrl/Cmd+Z", () => {
    const { controlsRoot, getSaved } = mount({ x: 6, y: 3 });
    const cap = capture(controlsRoot);
    (controlsRoot.querySelector(".editor-car") as HTMLElement).click();
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    expect(getSaved()?.placedCars).toHaveLength(0);
  });

  it("toggles the debug overlay, adding debug entities to the render", () => {
    const { screen, controlsRoot, renderer } = mount();
    screen.tick();
    (controlsRoot.querySelector(".editor-debug") as HTMLElement).click();
    screen.tick();
    expect(renderer.syncs).toBeGreaterThan(0);
    expect((controlsRoot.querySelector(".editor-debug") as HTMLElement).classList.contains("active")).toBe(true);
  });

  it("calls onTest / onExitToMenu / renders each tick", () => {
    const { screen, controlsRoot, getTested, getMenu, renderer } = mount();
    (controlsRoot.querySelector(".editor-test") as HTMLElement).click();
    expect(getTested()?.drivable.variantId).toBe("sedan");
    (controlsRoot.querySelector(".editor-menu") as HTMLElement).click();
    expect(getMenu()).toBe(1);
    screen.tick();
    expect(renderer.syncs).toBeGreaterThan(0);
    expect(renderer.camera).toBeGreaterThan(0);
  });

  it("removes its DOM on dispose", () => {
    const { screen, controlsRoot } = mount();
    screen.dispose();
    expect(controlsRoot.querySelector(".editor-screen")).toBeNull();
  });
});
