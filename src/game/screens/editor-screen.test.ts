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
  return {
    screen,
    controlsRoot,
    renderer,
    getTested: () => tested,
    getSaved: () => saved,
    getMenu: () => menu,
  };
}

function capture(root: HTMLElement): HTMLElement {
  return root.querySelector(".editor-capture") as HTMLElement;
}

describe("createEditorScreen", () => {
  it("mounts a tool palette and a topbar", () => {
    const { controlsRoot } = mount();
    expect(controlsRoot.querySelectorAll(".editor-tool").length).toBeGreaterThanOrEqual(6);
    expect(controlsRoot.querySelector(".editor-test")).not.toBeNull();
    expect(controlsRoot.querySelector(".editor-save")).not.toBeNull();
  });

  it("activates the clicked tool", () => {
    const { controlsRoot } = mount();
    const grass = controlsRoot.querySelector('[data-tool="grass"]') as HTMLElement;
    grass.click();
    expect(grass.classList.contains("active")).toBe(true);
  });

  it("places a car with the car tool and includes it when saved", () => {
    const { controlsRoot, getSaved } = mount({ x: 6, y: 3 });
    (controlsRoot.querySelector('[data-tool="car"]') as HTMLElement).click();
    const cap = capture(controlsRoot);
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    expect(getSaved()?.placedCars).toHaveLength(1);
    expect(getSaved()?.placedCars[0]?.position).toEqual({ x: 6, y: 3 });
  });

  it("adds a grass area by dragging a rectangle", () => {
    const { controlsRoot, getSaved } = mount();
    (controlsRoot.querySelector('[data-tool="grass"]') as HTMLElement).click();
    const cap = capture(controlsRoot);
    cap.dispatchEvent(pointer("pointerdown", 100, 100));
    cap.dispatchEvent(pointer("pointerup", 300, 300));
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    expect(getSaved()?.props.some((p) => p.kind === "grass")).toBe(true);
  });

  it("erases a placed car with the erase tool", () => {
    const { controlsRoot, getSaved } = mount({ x: 6, y: 3 });
    (controlsRoot.querySelector('[data-tool="car"]') as HTMLElement).click();
    const cap = capture(controlsRoot);
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    (controlsRoot.querySelector('[data-tool="erase"]') as HTMLElement).click();
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    expect(getSaved()?.placedCars).toHaveLength(0);
  });

  it("calls onTest with the current level", () => {
    const { controlsRoot, getTested } = mount();
    (controlsRoot.querySelector(".editor-test") as HTMLElement).click();
    expect(getTested()?.drivable.variantId).toBe("sedan");
  });

  it("calls onExitToMenu from the Menu button", () => {
    const { controlsRoot, getMenu } = mount();
    (controlsRoot.querySelector(".editor-menu") as HTMLElement).click();
    expect(getMenu()).toBe(1);
  });

  it("renders and sets the camera each tick", () => {
    const { screen, renderer } = mount();
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
