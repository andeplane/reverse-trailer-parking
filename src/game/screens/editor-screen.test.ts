// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { Entity, Renderer } from "../../engine/render/renderer";
import type { Vec2 } from "../../engine/math/vec2";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import { levelCarObb } from "../level/editor-model";
import type { Level } from "../level/level-types";
import { createEditorScreen } from "./editor-screen";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function fakeRenderer(worldPoint: Vec2): Renderer & { syncs: number; camera: number; last: Entity[] } {
  const r = {
    syncs: 0,
    camera: 0,
    last: [] as Entity[],
    sync: (e: Entity[]) => {
      r.syncs += 1;
      r.last = e;
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

function mount(worldPoint: Vec2 = { x: 5, y: 4 }, initial?: Level) {
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
    ...(initial ? { initial } : {}),
    onExitToMenu: () => (menu += 1),
    onTest: (l) => (tested = l),
    onSave: (l) => (saved = l),
  });
  return { screen, controlsRoot, renderer, getTested: () => tested, getSaved: () => saved, getMenu: () => menu };
}

function capture(root: HTMLElement): HTMLElement {
  return root.querySelector(".editor-capture") as HTMLElement;
}
function save(root: HTMLElement): void {
  (root.querySelector(".editor-save") as HTMLElement).click();
}

describe("createEditorScreen", () => {
  it("mounts a tile-brush palette, curb tool, car picker, topbar, and hint bar", () => {
    const { controlsRoot } = mount();
    expect(controlsRoot.querySelector('[data-tile="grass"]')).not.toBeNull();
    expect(controlsRoot.querySelector('[data-tile="bay"]')).not.toBeNull();
    expect(controlsRoot.querySelector('[data-tool="curb"]')).not.toBeNull();
    expect(controlsRoot.querySelector(".editor-car")).not.toBeNull();
    expect(controlsRoot.querySelectorAll(".editor-car-chip").length).toBe(allCarVariants.length);
    expect(controlsRoot.querySelector(".editor-test")).not.toBeNull();
    expect(controlsRoot.querySelector(".editor-name")).not.toBeNull();
    expect(controlsRoot.querySelector(".editor-hints")).not.toBeNull();
    // The confusing "Start (player)" tool and the ⟳ rotate button are gone.
    const labels = [...controlsRoot.querySelectorAll(".editor-tool")].map((b) => b.textContent);
    expect(labels.some((l) => l?.includes("Start"))).toBe(false);
    expect(labels.some((l) => l?.includes("rotate"))).toBe(false);
  });

  it("edits the level name via the topbar input", () => {
    const { controlsRoot, getSaved } = mount();
    const name = controlsRoot.querySelector(".editor-name") as HTMLInputElement;
    name.value = "Tricky Lot";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    save(controlsRoot);
    expect(getSaved()?.name).toBe("Tricky Lot");
  });

  it("resizes the map from the topbar size inputs, keeping content", () => {
    const { controlsRoot, getSaved } = mount({ x: 0, y: 0 });
    (controlsRoot.querySelector('[data-tile="grass"]') as HTMLElement).click();
    const cap = capture(controlsRoot);
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    const inputs = controlsRoot.querySelectorAll(".editor-size");
    const cols = inputs[0] as HTMLInputElement;
    cols.value = "30";
    cols.dispatchEvent(new Event("change", { bubbles: true }));
    save(controlsRoot);
    expect(getSaved()?.grid.cols).toBe(30);
    expect(getSaved()?.grid.cells.some((c) => c.type === "grass")).toBe(true);
  });

  it("paints a tile onto the grid where the pointer maps", () => {
    const { controlsRoot, getSaved } = mount({ x: 0, y: 0 });
    (controlsRoot.querySelector('[data-tile="grass"]') as HTMLElement).click();
    const cap = capture(controlsRoot);
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    save(controlsRoot);
    expect(getSaved()?.grid.cells.some((c) => c.type === "grass")).toBe(true);
  });

  it("paints and erases curbs on the nearest cell edge", () => {
    const { controlsRoot, getSaved } = mount({ x: 0.5, y: 2.5 }); // on a horizontal edge line, off any vertical one
    (controlsRoot.querySelector('[data-tool="curb"]') as HTMLElement).click();
    const cap = capture(controlsRoot);
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    save(controlsRoot);
    const curbs = (getSaved()?.grid.hCurbs ?? []).filter(Boolean).length;
    expect(curbs).toBe(1);
    // A second click on the same edge erases it.
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    save(controlsRoot);
    expect((getSaved()?.grid.hCurbs ?? []).filter(Boolean)).toHaveLength(0);
  });

  it("places a car continuously (body centre at the cursor, no grid snap)", () => {
    const { controlsRoot, getSaved } = mount({ x: 6.3, y: 3.4 });
    (controlsRoot.querySelector('.editor-car-chip[data-variant="suv"]') as HTMLElement).click();
    const cap = capture(controlsRoot);
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    save(controlsRoot);
    expect(getSaved()?.placedCars).toHaveLength(1);
    expect(getSaved()?.placedCars[0]?.variantId).toBe("suv");
    const obb = levelCarObb(getSaved()!.placedCars[0]!, catalog);
    expect(obb.center.x).toBeCloseTo(6.3);
    expect(obb.center.y).toBeCloseTo(3.4);
  });

  it("refuses to place a car on top of another car", () => {
    const { controlsRoot, getSaved } = mount({ x: 6, y: 3 });
    const cap = capture(controlsRoot);
    (controlsRoot.querySelector(".editor-car") as HTMLElement).click();
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    cap.dispatchEvent(pointer("pointerdown")); // second attempt at the same spot
    cap.dispatchEvent(pointer("pointerup"));
    save(controlsRoot);
    expect(getSaved()?.placedCars).toHaveLength(1); // not two
  });

  it("undoes the last change with Ctrl/Cmd+Z", () => {
    const { controlsRoot, getSaved } = mount({ x: 6, y: 3 });
    const cap = capture(controlsRoot);
    (controlsRoot.querySelector(".editor-car") as HTMLElement).click();
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    save(controlsRoot);
    expect(getSaved()?.placedCars).toHaveLength(0);
  });

  it("rotates the car under the cursor with R in −30° steps (clockwise on screen)", () => {
    const { controlsRoot, getSaved } = mount({ x: 6.5, y: 2 });
    const cap = capture(controlsRoot);
    (controlsRoot.querySelector('.editor-car-chip[data-variant="suv"]') as HTMLElement).click();
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    cap.dispatchEvent(pointer("pointermove")); // hover it
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    save(controlsRoot);
    expect(getSaved()?.placedCars[0]?.heading).toBeCloseTo(-Math.PI / 6);
    // Rotating in place keeps the body centre put.
    const obb = levelCarObb(getSaved()!.placedCars[0]!, catalog);
    expect(obb.center.x).toBeCloseTo(6.5);
    expect(obb.center.y).toBeCloseTo(2);
  });

  it("Q picks the hovered car into the car brush; Q again toggles Select/Move", () => {
    const { controlsRoot } = mount({ x: 6, y: 3 });
    const cap = capture(controlsRoot);
    (controlsRoot.querySelector('.editor-car-chip[data-variant="suv"]') as HTMLElement).click();
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    // Switch away to a tile brush, hover the car, and pick it up with Q.
    (controlsRoot.querySelector('[data-tile="grass"]') as HTMLElement).click();
    cap.dispatchEvent(pointer("pointermove"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    const carBtn = controlsRoot.querySelector(".editor-car") as HTMLElement;
    expect(carBtn.classList.contains("active")).toBe(true);
    expect(carBtn.textContent).toContain("suv");
    // Q again (same thing hovered) → Select/Move.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    const selectBtn = [...controlsRoot.querySelectorAll(".editor-tool")].find((b) => b.textContent === "Select / Move");
    expect(selectBtn?.classList.contains("active")).toBe(true);
  });

  it("Q over a tile picks the paint brush with the tile's type", () => {
    const { controlsRoot } = mount({ x: 0, y: 0 });
    const cap = capture(controlsRoot);
    (controlsRoot.querySelector('[data-tile="hedge"]') as HTMLElement).click();
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    (controlsRoot.querySelector('[data-tile="grass"]') as HTMLElement).click();
    cap.dispatchEvent(pointer("pointermove"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    expect((controlsRoot.querySelector('[data-tile="hedge"]') as HTMLElement).classList.contains("active")).toBe(true);
  });

  it("deletes the selected car with ⌫ and shows the contextual delete button", () => {
    const { screen, controlsRoot, getSaved } = mount({ x: 6, y: 3 });
    const cap = capture(controlsRoot);
    (controlsRoot.querySelector(".editor-car") as HTMLElement).click();
    cap.dispatchEvent(pointer("pointerdown"));
    cap.dispatchEvent(pointer("pointerup"));
    const selectBtn = [...controlsRoot.querySelectorAll(".editor-tool")].find((b) => b.textContent === "Select / Move") as HTMLElement;
    selectBtn.click();
    cap.dispatchEvent(pointer("pointerdown")); // select the car under the cursor
    cap.dispatchEvent(pointer("pointerup"));
    screen.tick();
    expect((controlsRoot.querySelector(".editor-delete") as HTMLElement).classList.contains("visible")).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    save(controlsRoot);
    expect(getSaved()?.placedCars).toHaveLength(0);
  });

  it("shows a save toast and refuses to save an invalid level", () => {
    const { controlsRoot, getSaved } = mount();
    save(controlsRoot);
    expect(getSaved()).toBeDefined();
    expect(controlsRoot.querySelector(".editor-toast")?.textContent).toContain("Saved");
    const name = controlsRoot.querySelector(".editor-name") as HTMLInputElement;
    name.value = "";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    save(controlsRoot);
    expect(controlsRoot.querySelector(".editor-toast.error")).not.toBeNull();
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

  it("shows a placement preview at the hovered location", () => {
    const { screen, controlsRoot, renderer } = mount({ x: 6, y: 3 });
    (controlsRoot.querySelector('[data-tile="bay"]') as HTMLElement).click();
    capture(controlsRoot).dispatchEvent(pointer("pointermove"));
    screen.tick();
    expect(renderer.last.some((e) => e.id.startsWith("editor:preview"))).toBe(true);
    // Bay preview includes its painted lines so the opening direction is visible.
    expect(renderer.last.some((e) => e.id.startsWith("editor:preview:line"))).toBe(true);
  });

  it("shows an exit-gate preview when hovering with the Exit tool", () => {
    const { screen, controlsRoot, renderer } = mount({ x: 30, y: 2 });
    const exitBtn = [...controlsRoot.querySelectorAll(".editor-tool")].find((b) => b.textContent === "Exit gate") as HTMLElement;
    exitBtn.click();
    capture(controlsRoot).dispatchEvent(pointer("pointermove"));
    screen.tick();
    expect(renderer.last.some((e) => e.id === "editor:preview:exit")).toBe(true);
  });

  it("starts from the given initial level when editing an existing one", () => {
    const { controlsRoot, getSaved } = mount({ x: 5, y: 4 });
    save(controlsRoot);
    const first = getSaved()!;
    controlsRoot!.remove();
    const second = mount({ x: 5, y: 4 }, { ...first, name: "Existing" });
    expect((second.controlsRoot.querySelector(".editor-name") as HTMLInputElement).value).toBe("Existing");
    save(second.controlsRoot);
    expect(second.getSaved()?.id).toBe(first.id);
  });

  it("removes its DOM on dispose", () => {
    const { screen, controlsRoot } = mount();
    screen.dispose();
    expect(controlsRoot.querySelector(".editor-screen")).toBeNull();
  });
});
