import type { Radians } from "../../engine/math/angles";
import type { Renderer, RectStyle } from "../../engine/render/renderer";
import type { Metres } from "../../engine/math/units";
import type { Vec2 } from "../../engine/math/vec2";
import type { Entity } from "../../engine/render/renderer";
import type { Level, LevelProp, PropKind } from "../level/level-types";
import { levelToWorld } from "../level/level-to-world";
import {
  emptyLevel,
  hitTest,
  levelCarObb,
  propObb,
  rectFromDrag,
  snapExitToEdge,
  type EditorHit,
} from "../level/editor-model";
import { worldToEntities } from "../view/world-view";
import { allCarVariants } from "../vehicle/variants";
import type { VariantCatalog } from "../vehicle/vehicle-types";
import type { Screen } from "./screen";

const PIXELS_PER_METRE = 32; // must match create-phaser-surface

type Tool = "select" | "car" | "grass" | "tree" | "curb" | "exit" | "erase";

const CAR_VARIANT_IDS = allCarVariants.map((v) => v.id);

const SELECT_STYLE: RectStyle = {
  fillColor: 0x39ff14,
  fillAlpha: 0,
  strokeColor: 0x39ff14,
  strokeWidth: 0.12 as Metres,
  cornerRadius: 0 as Metres,
};

function selectionObb(level: Level, sel: EditorHit, catalog: VariantCatalog): Entity | null {
  const obb =
    sel.kind === "drivable"
      ? levelCarObb(level.drivable, catalog)
      : sel.kind === "placed"
        ? levelCarObb(level.placedCars[sel.index]!, catalog)
        : propObb(level.props[sel.index]!);
  return {
    id: "editor:selection",
    position: obb.center,
    rotation: obb.rotation,
    size: { width: (obb.halfW * 2) as Metres, length: (obb.halfL * 2) as Metres },
    visual: { kind: "rect", style: SELECT_STYLE },
  };
}

/**
 * The level editor: build a map by placing cars, grass/curb areas (drag a rectangle), trees, and
 * the exit, then Save / Test. Select-tool drags empty space to pan and the mouse wheel zooms.
 * Camera/pointer glue leans on the renderer (screenToWorld / setCamera); the pure model
 * (hit-test, snapping, rects) is unit-tested separately.
 */
export function createEditorScreen(args: {
  renderer: Renderer;
  controlsRoot: HTMLElement;
  catalog: VariantCatalog;
  initial?: Level;
  onExitToMenu: () => void;
  onTest: (level: Level) => void;
  onSave: (level: Level) => void;
}): Screen {
  const { renderer, controlsRoot, catalog, onExitToMenu, onTest, onSave } = args;

  let level: Level = args.initial ?? emptyLevel(`custom-${idSuffix()}`);
  let tool: Tool = "select";
  let carVariantIndex = 0;
  let selection: EditorHit | null = null;
  const camera = { center: { x: 0, y: 0 } as Vec2, zoom: fitZoom(level.size) };

  // Drag state.
  let dragStart: Vec2 | null = null;
  let dragMode: "none" | "pan" | "move" | "rect" = "none";
  let lastClient: { x: number; y: number } | null = null;

  // --- DOM ---------------------------------------------------------------
  const root = document.createElement("div");
  root.className = "editor-screen";

  const capture = document.createElement("div");
  capture.className = "editor-capture";
  root.appendChild(capture);

  const palette = document.createElement("div");
  palette.className = "editor-palette";
  root.appendChild(palette);

  const topbar = document.createElement("div");
  topbar.className = "editor-topbar";
  root.appendChild(topbar);

  controlsRoot.appendChild(root);

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  function toolButton(t: Tool, label: string): void {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "editor-tool";
    b.dataset.tool = t;
    b.textContent = label;
    b.addEventListener("click", () => setTool(t));
    palette.appendChild(b);
    toolButtons.set(t, b);
  }
  const carButton = (() => {
    toolButton("car", `Car: ${CAR_VARIANT_IDS[0]}`);
    return toolButtons.get("car")!;
  })();
  toolButton("select", "Select / Move");
  toolButton("grass", "Grass area");
  toolButton("tree", "Tree");
  toolButton("curb", "Curb");
  toolButton("exit", "Exit");
  toolButton("erase", "Erase");

  const cycleVariant = document.createElement("button");
  cycleVariant.type = "button";
  cycleVariant.className = "editor-cycle";
  cycleVariant.textContent = "↻ variant";
  cycleVariant.addEventListener("click", () => {
    carVariantIndex = (carVariantIndex + 1) % CAR_VARIANT_IDS.length;
    carButton.textContent = `Car: ${CAR_VARIANT_IDS[carVariantIndex]}`;
    setTool("car");
  });
  palette.appendChild(cycleVariant);

  function topButton(label: string, className: string, onClick: () => void): void {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = label;
    b.addEventListener("click", onClick);
    topbar.appendChild(b);
  }
  topButton("＋", "editor-zoom", () => {
    camera.zoom *= 1.2;
  });
  topButton("－", "editor-zoom", () => {
    camera.zoom /= 1.2;
  });
  topButton("Test ▸", "editor-test", () => onTest(level));
  topButton("Save", "editor-save", () => onSave(level));
  topButton("☰ Menu", "editor-menu", () => onExitToMenu());

  function setTool(t: Tool): void {
    tool = t;
    selection = null;
    for (const [key, btn] of toolButtons) btn.classList.toggle("active", key === t);
  }
  setTool("select");

  // --- Pointer handling --------------------------------------------------
  function worldAt(e: PointerEvent): Vec2 {
    return renderer.screenToWorld(e.clientX, e.clientY);
  }

  function onPointerDown(e: Event): void {
    const pe = e as PointerEvent;
    pe.preventDefault();
    const p = worldAt(pe);
    dragStart = p;
    lastClient = { x: pe.clientX, y: pe.clientY };

    if (tool === "select") {
      selection = hitTest(level, p, catalog);
      dragMode = selection ? "move" : "pan";
    } else if (tool === "grass" || tool === "curb" || tool === "exit") {
      dragMode = "rect";
    } else {
      dragMode = "none"; // click-place tools act on pointerup
    }
  }

  function onPointerMove(e: Event): void {
    const pe = e as PointerEvent;
    if (dragMode === "pan" && lastClient) {
      const dx = (pe.clientX - lastClient.x) / (PIXELS_PER_METRE * camera.zoom);
      const dy = (pe.clientY - lastClient.y) / (PIXELS_PER_METRE * camera.zoom);
      camera.center = { x: camera.center.x - dx, y: camera.center.y + dy };
      lastClient = { x: pe.clientX, y: pe.clientY };
    } else if (dragMode === "move" && selection && dragStart) {
      const p = worldAt(pe);
      moveSelection({ x: p.x - dragStart.x, y: p.y - dragStart.y });
      dragStart = p;
    }
  }

  function onPointerUp(e: Event): void {
    const pe = e as PointerEvent;
    const p = worldAt(pe);
    const start = dragStart ?? p;

    if (tool === "car") addPlacedCar(p, start);
    else if (tool === "tree") addTree(p);
    else if ((tool === "grass" || tool === "curb") && dragMode === "rect") addRectProp(tool, start, p);
    else if (tool === "exit" && dragMode === "rect") level = { ...level, exit: snapExitToEdge(start, p, level.size) };
    else if (tool === "erase") eraseAt(p);

    dragMode = "none";
    dragStart = null;
    lastClient = null;
  }

  function onWheel(e: Event): void {
    const we = e as WheelEvent;
    we.preventDefault();
    camera.zoom *= we.deltaY < 0 ? 1.1 : 1 / 1.1;
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!selection) return;
    if (e.key === "[") rotateSelection((-Math.PI / 12) as Radians);
    else if (e.key === "]") rotateSelection((Math.PI / 12) as Radians);
    else if (e.key === "Delete" || e.key === "Backspace") deleteSelection();
  }

  capture.addEventListener("pointerdown", onPointerDown);
  capture.addEventListener("pointermove", onPointerMove);
  capture.addEventListener("pointerup", onPointerUp);
  capture.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);

  // --- Mutations ---------------------------------------------------------
  function headingFromDrag(from: Vec2, to: Vec2): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.hypot(dx, dy) > 1 ? Math.atan2(dy, dx) : 0;
  }
  function addPlacedCar(p: Vec2, start: Vec2): void {
    const heading = headingFromDrag(start, p);
    level = {
      ...level,
      placedCars: [...level.placedCars, { variantId: CAR_VARIANT_IDS[carVariantIndex]!, position: p, heading }],
    };
  }
  function addTree(p: Vec2): void {
    level = { ...level, props: [...level.props, { kind: "tree", position: p, rotation: 0, size: { width: 2.4, length: 2.4 } }] };
  }
  function addRectProp(kind: PropKind, a: Vec2, b: Vec2): void {
    const rect = rectFromDrag(a, b);
    const prop: LevelProp = { kind, position: rect.position, rotation: 0, size: rect.size };
    level = { ...level, props: [...level.props, prop] };
  }
  function eraseAt(p: Vec2): void {
    const hit = hitTest(level, p, catalog);
    if (!hit || hit.kind === "drivable") return;
    if (hit.kind === "placed") level = { ...level, placedCars: level.placedCars.filter((_, i) => i !== hit.index) };
    else level = { ...level, props: level.props.filter((_, i) => i !== hit.index) };
    selection = null;
  }
  function moveSelection(delta: Vec2): void {
    const sel = selection;
    if (!sel) return;
    if (sel.kind === "drivable") {
      level = { ...level, drivable: { ...level.drivable, position: add(level.drivable.position, delta) } };
    } else if (sel.kind === "placed") {
      level = {
        ...level,
        placedCars: level.placedCars.map((c, i) => (i === sel.index ? { ...c, position: add(c.position, delta) } : c)),
      };
    } else {
      level = {
        ...level,
        props: level.props.map((pr, i) => (i === sel.index ? { ...pr, position: add(pr.position, delta) } : pr)),
      };
    }
  }
  function rotateSelection(delta: number): void {
    const sel = selection;
    if (!sel) return;
    if (sel.kind === "drivable")
      level = { ...level, drivable: { ...level.drivable, heading: level.drivable.heading + delta } };
    else if (sel.kind === "placed")
      level = { ...level, placedCars: level.placedCars.map((c, i) => (i === sel.index ? { ...c, heading: c.heading + delta } : c)) };
    else level = { ...level, props: level.props.map((pr, i) => (i === sel.index ? { ...pr, rotation: pr.rotation + delta } : pr)) };
  }
  function deleteSelection(): void {
    const sel = selection;
    if (!sel || sel.kind === "drivable") return;
    if (sel.kind === "placed") level = { ...level, placedCars: level.placedCars.filter((_, i) => i !== sel.index) };
    else level = { ...level, props: level.props.filter((_, i) => i !== sel.index) };
    selection = null;
  }

  return {
    tick(): void {
      renderer.setCamera(camera.center, camera.zoom);
      const world = levelToWorld(level, catalog);
      const entities = worldToEntities(world, catalog);
      const withSelection = selection ? [...entities, selectionObb(level, selection, catalog)!] : entities;
      renderer.sync(withSelection);
    },
    dispose(): void {
      window.removeEventListener("keydown", onKeyDown);
      root.remove();
      renderer.setCamera({ x: 0, y: 0 }, 1);
    },
  };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function fitZoom(size: { width: number; height: number }): number {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const zx = vw / (size.width * PIXELS_PER_METRE);
  const zy = vh / (size.height * PIXELS_PER_METRE);
  return Math.min(zx, zy) * 0.9;
}

function idSuffix(): string {
  // Deterministic-enough unique-ish suffix from the current time is unavailable (Date.now blocked in
  // some contexts); use a counter persisted on the function object.
  const holder = idSuffix as unknown as { n?: number };
  holder.n = (holder.n ?? 0) + 1;
  return String(holder.n);
}
