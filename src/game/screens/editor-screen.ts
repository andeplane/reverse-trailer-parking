import type { Radians } from "../../engine/math/angles";
import type { Metres } from "../../engine/math/units";
import type { Vec2 } from "../../engine/math/vec2";
import type { Entity, Renderer, RectStyle } from "../../engine/render/renderer";
import type { Level, LevelCar } from "../level/level-types";
import { levelToWorld } from "../level/level-to-world";
import {
  carAt,
  carOverlaps,
  emptyLevel,
  exitGateAt,
  levelCarObb,
  snapExitToEdge,
  type EditorHit,
} from "../level/editor-model";
import { length, sub } from "../../engine/math/vec2";
import { cellCenter, withTile, worldToCell, type TileType } from "../level/tile-types";
import { worldToEntities } from "../view/world-view";
import { worldToDebugEntities } from "../view/debug-view";
import { allCarVariants } from "../vehicle/variants";
import { findCarVariant, type VariantCatalog } from "../vehicle/vehicle-types";
import type { Screen } from "./screen";

function previewTileTexture(type: TileType): string {
  return `tile-${type === "tree" ? "grass" : type}`;
}

function outlineEntity(id: string, position: Vec2, rotation: Radians, width: Metres, length: Metres, color: number): Entity {
  return {
    id,
    position,
    rotation,
    size: { width, length },
    visual: {
      kind: "rect",
      style: { fillColor: color, fillAlpha: 0, strokeColor: color, strokeWidth: 0.16 as Metres, cornerRadius: 0 as Metres },
    },
  };
}

const PIXELS_PER_METRE = 32; // must match create-phaser-surface
const HALF_PI = Math.PI / 2;

type Tool = { kind: "paint"; tile: TileType } | { kind: "car" } | { kind: "drivable" } | { kind: "exit" } | { kind: "select" };

const CAR_VARIANT_IDS = allCarVariants.map((v) => v.id);
const TILE_BRUSHES: { tile: TileType; label: string }[] = [
  { tile: "asphalt", label: "Asphalt" },
  { tile: "grass", label: "Grass" },
  { tile: "bay", label: "Bay (closed end)" },
  { tile: "bay-open", label: "Bay (open)" },
  { tile: "curb", label: "Curb" },
  { tile: "curb-corner", label: "Curb corner" },
  { tile: "hedge", label: "Hedge" },
  { tile: "tree", label: "Tree" },
];

const SELECT_STYLE: RectStyle = {
  fillColor: 0x39ff14,
  fillAlpha: 0,
  strokeColor: 0x39ff14,
  strokeWidth: 0.14 as Metres,
  cornerRadius: 0 as Metres,
};

function selectionEntity(level: Level, sel: EditorHit, catalog: VariantCatalog): Entity {
  const obb = sel.kind === "drivable" ? levelCarObb(level.drivable, catalog) : levelCarObb(level.placedCars[sel.index]!, catalog);
  return {
    id: "editor:selection",
    position: obb.center,
    rotation: obb.rotation,
    size: { width: (obb.halfW * 2) as Metres, length: (obb.halfL * 2) as Metres },
    visual: { kind: "rect", style: SELECT_STYLE },
  };
}

/**
 * Tile-based level editor. Paint the map with tile brushes (asphalt, grass, parking bays, curbs,
 * hedges, trees — rotate directional tiles with ⟳ / R), drop cars from a variant picker (can't
 * overlap another car), set the exit, then Test / Save. Space-drag or Select-drag empty pans;
 * wheel zooms; ⌘Z / Ctrl+Z undo; Esc cancels; the Debug button shows collision boxes.
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
  let tool: Tool = { kind: "paint", tile: "grass" };
  let brushRot = 0;
  let carVariantIndex = 0;
  let selection: EditorHit | null = null;
  let debug = false;
  const camera = { center: { x: 0, y: 0 } as Vec2, zoom: fitZoom(level.grid.cols * level.grid.tileSize, level.grid.rows * level.grid.tileSize) };

  const undoStack: Level[] = [];
  function pushUndo(): void {
    undoStack.push(level);
    if (undoStack.length > 100) undoStack.shift();
  }

  // Drag / hover state.
  let dragStart: Vec2 | null = null;
  let dragMode: "none" | "pan" | "paint" | "move" | "rect" = "none";
  let lastClient: { x: number; y: number } | null = null;
  let spaceHeld = false;
  let hover: Vec2 | null = null; // latest cursor world position, for the placement preview
  const painted = new Set<string>();

  // --- DOM ---------------------------------------------------------------
  const root = document.createElement("div");
  root.className = "editor-screen";
  const capture = document.createElement("div");
  capture.className = "editor-capture";
  const palette = document.createElement("div");
  palette.className = "editor-palette";
  const topbar = document.createElement("div");
  topbar.className = "editor-topbar";
  root.append(capture, palette, topbar);
  controlsRoot.appendChild(root);

  const toolEls: HTMLElement[] = [];
  function paletteButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = label;
    b.addEventListener("click", onClick);
    palette.appendChild(b);
    return b;
  }
  function markActive(el: HTMLElement): void {
    for (const e of toolEls) e.classList.toggle("active", e === el);
  }

  for (const brush of TILE_BRUSHES) {
    const b = paletteButton(brush.label, "editor-tool", () => {
      tool = { kind: "paint", tile: brush.tile };
      selection = null;
      markActive(b);
    });
    b.dataset.tile = brush.tile;
    toolEls.push(b);
  }

  function setBrushRot(rot: number): void {
    brushRot = ((rot % 4) + 4) % 4;
    rotateBtn.textContent = `⟳ rotate (${brushRot * 90}°)`;
  }
  const rotateBtn = paletteButton("⟳ rotate (0°)", "editor-cycle", () => setBrushRot(brushRot + 1));

  // Car picker: a button that toggles a flyout of all car variants.
  const carBtn = paletteButton(`▾ Car: ${CAR_VARIANT_IDS[0]}`, "editor-tool editor-car", () => {
    tool = { kind: "car" };
    selection = null;
    markActive(carBtn);
    carFlyout.classList.toggle("open");
  });
  carBtn.dataset.tool = "car";
  toolEls.push(carBtn);
  const carFlyout = document.createElement("div");
  carFlyout.className = "editor-car-flyout";
  CAR_VARIANT_IDS.forEach((id, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "editor-car-chip";
    chip.dataset.variant = id;
    chip.textContent = id;
    chip.addEventListener("click", () => {
      carVariantIndex = i;
      carBtn.textContent = `▾ Car: ${id}`;
      tool = { kind: "car" };
      markActive(carBtn);
      carFlyout.classList.remove("open");
    });
    carFlyout.appendChild(chip);
  });
  palette.appendChild(carFlyout);

  const startBtn = paletteButton("Start (player)", "editor-tool", () => {
    tool = { kind: "drivable" };
    selection = null;
    markActive(startBtn);
  });
  toolEls.push(startBtn);
  const exitBtn = paletteButton("Exit gate", "editor-tool", () => {
    tool = { kind: "exit" };
    selection = null;
    markActive(exitBtn);
  });
  toolEls.push(exitBtn);
  const selectBtn = paletteButton("Select / Move", "editor-tool", () => {
    tool = { kind: "select" };
    markActive(selectBtn);
  });
  toolEls.push(selectBtn);
  markActive(toolEls[1]!); // grass brush active by default

  function topButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = label;
    b.addEventListener("click", onClick);
    topbar.appendChild(b);
    return b;
  }
  const debugBtn = topButton("Debug", "editor-debug", () => {
    debug = !debug;
    debugBtn.classList.toggle("active", debug);
  });
  topButton("＋", "editor-zoom", () => (camera.zoom *= 1.2));
  topButton("－", "editor-zoom", () => (camera.zoom /= 1.2));
  topButton("Test ▸", "editor-test", () => onTest(level));
  topButton("Save", "editor-save", () => onSave(level));
  topButton("☰ Menu", "editor-menu", () => onExitToMenu());

  // --- Pointer handling --------------------------------------------------
  function worldAt(clientX: number, clientY: number): Vec2 {
    return renderer.screenToWorld(clientX, clientY);
  }

  function paintCell(p: Vec2): void {
    const cell = worldToCell(level.grid, p);
    if (!cell) return;
    const key = `${cell.col},${cell.row}`;
    if (painted.has(key)) return;
    painted.add(key);
    if (tool.kind !== "paint") return;
    level = { ...level, grid: withTile(level.grid, cell.col, cell.row, { type: tool.tile, rot: brushRot }) };
  }

  function onPointerDown(e: Event): void {
    const pe = e as PointerEvent;
    pe.preventDefault();
    const p = worldAt(pe.clientX, pe.clientY);
    dragStart = p;
    lastClient = { x: pe.clientX, y: pe.clientY };
    painted.clear();

    if (spaceHeld) {
      dragMode = "pan";
    } else if (tool.kind === "paint") {
      pushUndo();
      dragMode = "paint";
      paintCell(p);
    } else if (tool.kind === "exit") {
      dragMode = "rect";
    } else if (tool.kind === "select") {
      selection = carAt(level, p, catalog);
      dragMode = selection ? "move" : "pan";
    } else {
      dragMode = "none"; // car / drivable act on pointerup
    }
  }

  function onPointerMove(e: Event): void {
    const pe = e as PointerEvent;
    hover = worldAt(pe.clientX, pe.clientY);
    if (dragMode === "pan" && lastClient) {
      const dx = (pe.clientX - lastClient.x) / (PIXELS_PER_METRE * camera.zoom);
      const dy = (pe.clientY - lastClient.y) / (PIXELS_PER_METRE * camera.zoom);
      camera.center = { x: camera.center.x - dx, y: camera.center.y + dy };
      lastClient = { x: pe.clientX, y: pe.clientY };
    } else if (dragMode === "paint") {
      paintCell(worldAt(pe.clientX, pe.clientY));
    } else if (dragMode === "move" && selection && dragStart) {
      const p = worldAt(pe.clientX, pe.clientY);
      moveSelection({ x: p.x - dragStart.x, y: p.y - dragStart.y });
      dragStart = p;
    }
  }

  function onPointerUp(e: Event): void {
    const pe = e as PointerEvent;
    const p = worldAt(pe.clientX, pe.clientY);
    const start = dragStart ?? p;

    if (tool.kind === "car") placeCar(p);
    else if (tool.kind === "drivable") moveDrivable(p);
    else if (tool.kind === "exit") {
      pushUndo();
      // A drag sets a custom-width gate; a click drops a standard-width gate at the nearest edge.
      const dragged = length(sub(p, start)) > 1.5;
      level = { ...level, exit: dragged ? snapExitToEdge(start, p, level.grid) : exitGateAt(p, level.grid) };
    }

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
    if (e.key === " ") spaceHeld = true;
    if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      const prev = undoStack.pop();
      if (prev) {
        level = prev;
        selection = null;
      }
      return;
    }
    if (e.key === "Escape") {
      selection = null;
      dragMode = "none";
      carFlyout.classList.remove("open");
      return;
    }
    if (e.key === "r" || e.key === "R") rotateUnderCursor();
    if (selection && (e.key === "Delete" || e.key === "Backspace")) deleteSelection();
    if (selection && e.key === "[") {
      pushUndo();
      rotateSelection(-HALF_PI as Radians);
    }
    if (selection && e.key === "]") {
      pushUndo();
      rotateSelection(HALF_PI as Radians);
    }
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === " ") spaceHeld = false;
  }

  capture.addEventListener("pointerdown", onPointerDown);
  capture.addEventListener("pointermove", onPointerMove);
  capture.addEventListener("pointerup", onPointerUp);
  capture.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // --- Mutations ---------------------------------------------------------
  function snapToCell(p: Vec2): Vec2 {
    const cell = worldToCell(level.grid, p);
    return cell ? cellCenter(level.grid, cell.col, cell.row) : p;
  }
  function placeCar(p: Vec2): void {
    const candidate: LevelCar = {
      variantId: CAR_VARIANT_IDS[carVariantIndex]!,
      position: snapToCell(p),
      heading: brushRot * HALF_PI,
    };
    if (carOverlaps(level, candidate, catalog)) return; // no car on top of another
    pushUndo();
    level = { ...level, placedCars: [...level.placedCars, candidate] };
  }
  function moveDrivable(p: Vec2): void {
    const candidate: LevelCar = { ...level.drivable, position: snapToCell(p) };
    if (carOverlaps(level, candidate, catalog, { kind: "drivable" })) return;
    pushUndo();
    level = { ...level, drivable: candidate };
  }
  function moveSelection(delta: Vec2): void {
    const sel = selection;
    if (!sel) return;
    if (sel.kind === "drivable") {
      const candidate = { ...level.drivable, position: add(level.drivable.position, delta) };
      if (!carOverlaps(level, candidate, catalog, sel)) level = { ...level, drivable: candidate };
    } else {
      const car = level.placedCars[sel.index]!;
      const candidate = { ...car, position: add(car.position, delta) };
      if (!carOverlaps(level, candidate, catalog, sel)) {
        level = { ...level, placedCars: level.placedCars.map((c, i) => (i === sel.index ? candidate : c)) };
      }
    }
  }
  function rotateSelection(delta: Radians): void {
    const sel = selection;
    if (!sel) return;
    if (sel.kind === "drivable") level = { ...level, drivable: { ...level.drivable, heading: level.drivable.heading + delta } };
    else level = { ...level, placedCars: level.placedCars.map((c, i) => (i === sel.index ? { ...c, heading: c.heading + delta } : c)) };
  }
  function deleteSelection(): void {
    const sel = selection;
    if (!sel || sel.kind === "drivable") return;
    pushUndo();
    level = { ...level, placedCars: level.placedCars.filter((_, i) => i !== sel.index) };
    selection = null;
  }
  function rotateCar(hit: EditorHit, delta: Radians): void {
    if (hit.kind === "drivable") level = { ...level, drivable: { ...level.drivable, heading: level.drivable.heading + delta } };
    else level = { ...level, placedCars: level.placedCars.map((c, i) => (i === hit.index ? { ...c, heading: c.heading + delta } : c)) };
  }
  function headingOf(hit: EditorHit): number {
    return hit.kind === "drivable" ? level.drivable.heading : level.placedCars[hit.index]!.heading;
  }

  /**
   * R rotates whatever is under the cursor: a car (also syncing the brush so the next placed car
   * matches), or the tile in the hovered cell; otherwise it just cycles the brush rotation.
   */
  function rotateUnderCursor(): void {
    const car = hover ? carAt(level, hover, catalog) : null;
    if (car) {
      pushUndo();
      rotateCar(car, HALF_PI as Radians);
      setBrushRot(Math.round(headingOf(car) / HALF_PI));
      return;
    }
    if (tool.kind === "paint" && hover) {
      const cell = worldToCell(level.grid, hover);
      if (cell) {
        const tile = level.grid.cells[cell.row * level.grid.cols + cell.col]!;
        pushUndo();
        level = { ...level, grid: withTile(level.grid, cell.col, cell.row, { type: tile.type, rot: (tile.rot + 1) % 4 }) };
        setBrushRot(tile.rot + 1);
        return;
      }
    }
    setBrushRot(brushRot + 1);
  }

  /** A ghost of what the current tool will place at the cursor, outlined green (valid) / red. */
  function previewEntities(): Entity[] {
    if (!hover || dragMode !== "none") return [];
    if (tool.kind === "paint") {
      const cell = worldToCell(level.grid, hover);
      if (!cell) return [];
      const center = cellCenter(level.grid, cell.col, cell.row);
      const size = level.grid.tileSize as Metres;
      const out: Entity[] = [
        {
          id: "editor:preview:tile",
          position: center,
          rotation: (tool.tile === "tree" ? 0 : brushRot * HALF_PI) as Radians,
          size: { width: size, length: size },
          visual: { kind: "sprite", texture: previewTileTexture(tool.tile) },
        },
      ];
      if (tool.tile === "tree") {
        out.push({
          id: "editor:preview:canopy",
          position: center,
          rotation: 0 as Radians,
          size: { width: size, length: size },
          visual: { kind: "sprite", texture: "tile-tree" },
        });
      }
      out.push(outlineEntity("editor:preview:box", center, 0 as Radians, size, size, 0x39ff14));
      return out;
    }
    if (tool.kind === "car" || tool.kind === "drivable") {
      const variantId = tool.kind === "car" ? CAR_VARIANT_IDS[carVariantIndex]! : level.drivable.variantId;
      const heading = tool.kind === "car" ? brushRot * HALF_PI : level.drivable.heading;
      const candidate: LevelCar = { variantId, position: snapToCell(hover), heading };
      const obb = levelCarObb(candidate, catalog);
      const ignore = tool.kind === "drivable" ? ({ kind: "drivable" } as const) : undefined;
      const ok = !carOverlaps(level, candidate, catalog, ignore);
      const variant = findCarVariant(catalog, variantId);
      return [
        {
          id: "editor:preview:car",
          position: obb.center,
          rotation: obb.rotation,
          size: { width: variant.bodyWidth, length: variant.bodyLength },
          visual: { kind: "sprite", texture: variant.texture },
        },
        outlineEntity("editor:preview:box", obb.center, obb.rotation, (obb.halfW * 2) as Metres, (obb.halfL * 2) as Metres, ok ? 0x39ff14 : 0xff3b30),
      ];
    }
    if (tool.kind === "exit") {
      const gate = exitGateAt(hover, level.grid);
      const seg = sub(gate.b, gate.a);
      const len = Math.max(length(seg), 0.1) as Metres;
      const mid = { x: (gate.a.x + gate.b.x) / 2, y: (gate.a.y + gate.b.y) / 2 };
      return [
        {
          id: "editor:preview:exit",
          position: mid,
          rotation: Math.atan2(seg.y, seg.x) as Radians,
          size: { width: 0.7 as Metres, length: len },
          visual: {
            kind: "rect",
            style: { fillColor: 0xffd23f, fillAlpha: 0.55, strokeColor: 0x39ff14, strokeWidth: 0.16 as Metres, cornerRadius: 0.1 as Metres },
          },
        },
      ];
    }
    return [];
  }

  return {
    tick(): void {
      renderer.setCamera(camera.center, camera.zoom);
      const world = levelToWorld(level, catalog);
      const entities = worldToEntities(world, catalog);
      const extra: Entity[] = [];
      if (debug) extra.push(...worldToDebugEntities(world, catalog));
      if (selection) extra.push(selectionEntity(level, selection, catalog));
      extra.push(...previewEntities());
      renderer.sync([...entities, ...extra]);
    },
    dispose(): void {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      root.remove();
      renderer.setCamera({ x: 0, y: 0 }, 1);
    },
  };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function fitZoom(widthMetres: number, heightMetres: number): number {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  return Math.min(vw / (widthMetres * PIXELS_PER_METRE), vh / (heightMetres * PIXELS_PER_METRE)) * 0.92;
}

function idSuffix(): string {
  const holder = idSuffix as unknown as { n?: number };
  holder.n = (holder.n ?? 0) + 1;
  return String(holder.n);
}
