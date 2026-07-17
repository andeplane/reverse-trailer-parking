import type { Radians } from "../../engine/math/angles";
import type { Metres } from "../../engine/math/units";
import type { Vec2 } from "../../engine/math/vec2";
import type { Entity, Renderer, RectStyle } from "../../engine/render/renderer";
import type { Level, LevelCar } from "../level/level-types";
import { levelToWorld } from "../level/level-to-world";
import { validateLevel } from "../level/level-validate";
import {
  carAt,
  carOverlaps,
  emptyLevel,
  exitGateAt,
  levelCarAtCentre,
  levelCarObb,
  resizeLevel,
  snapExitToEdge,
  type EditorHit,
} from "../level/editor-model";
import { length, sub } from "../../engine/math/vec2";
import {
  bayMarkedSides,
  bayOpeningOffset,
  bayOpenRotFor,
  cellCenter,
  curbAt,
  CURB_THICKNESS,
  edgeSegment,
  inBounds,
  nearestEdge,
  sideEdge,
  withCurb,
  withTile,
  worldToCell,
  type TileType,
} from "../level/tile-types";
import { BAY_LINE_WIDTH, tileGroundTexture } from "../view/tile-decor";
import { worldToLayers } from "../view/world-view";
import { worldToDebugEntities } from "../view/debug-view";
import { allCarVariants } from "../vehicle/variants";
import { findCarVariant, type VariantCatalog } from "../vehicle/vehicle-types";
import type { Screen } from "./screen";

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

/** A filled strip along segment a→b (used for curb + bay-line previews). */
function stripEntity(id: string, a: Vec2, b: Vec2, width: Metres, color: number, alpha: number): Entity {
  const seg = sub(b, a);
  return {
    id,
    position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    rotation: Math.atan2(seg.y, seg.x) as Radians,
    size: { width, length: (length(seg) + width) as Metres },
    visual: {
      kind: "rect",
      style: { fillColor: color, fillAlpha: alpha, strokeColor: color, strokeWidth: 0 as Metres, cornerRadius: (width / 2) as Metres },
    },
  };
}

const PIXELS_PER_METRE = 32; // must match create-phaser-surface
const HALF_PI = Math.PI / 2;
/** R rotates in 30° steps, clockwise on screen (issue: "rotate the other way"). */
const CAR_ROTATE_STEP = (-Math.PI / 6) as Radians;

type Tool =
  | { kind: "paint"; tile: TileType }
  | { kind: "curb" }
  | { kind: "car" }
  | { kind: "exit" }
  | { kind: "select" };

const CAR_VARIANT_IDS = allCarVariants.map((v) => v.id);
const TILE_BRUSHES: { tile: TileType; label: string }[] = [
  { tile: "asphalt", label: "Asphalt" },
  { tile: "grass", label: "Grass" },
  { tile: "bay", label: "Bay (closed end)" },
  { tile: "bay-open", label: "Bay (open)" },
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
 * Tile-based level editor. Paint the map with tile brushes (asphalt, grass, parking bays, hedges,
 * trees), draw curbs on the edges BETWEEN tiles, drop cars anywhere (continuous placement; they
 * can't overlap), drag the exit gate, then Test / Save. The topbar holds the level name and the
 * map size in tiles. Keys: R rotates the hovered thing (cars in 30° steps), Q picks up whatever
 * is hovered as the active tool (press again for Select/Move), ⌫ deletes the selected/hovered
 * car, ⌘Z undoes, Esc cancels, Space-drag (or Select-drag on empty) pans, wheel zooms.
 */
export function createEditorScreen(args: {
  renderer: Renderer;
  controlsRoot: HTMLElement;
  catalog: VariantCatalog;
  initial?: Level;
  /** Serialized last-persisted state, so the unsaved-changes guard survives a Test ▸ round-trip. */
  savedState?: string;
  onExitToMenu: () => void;
  /** Called with the draft AND the current persisted baseline (thread both back via `initial`/`savedState`). */
  onTest: (level: Level, savedState: string) => void;
  onSave: (level: Level) => void;
}): Screen {
  const { renderer, controlsRoot, catalog, onExitToMenu, onTest, onSave } = args;

  let level: Level = args.initial ?? emptyLevel(`custom-${Date.now().toString(36)}`);
  let tool: Tool = { kind: "paint", tile: "grass" };
  let brushRot = 0; // tile brush rotation, quarter turns
  let carHeading = 0; // car brush heading, radians (30° steps via R)
  let carVariantIndex = 0;
  let selection: EditorHit | null = null;
  let debug = false;
  const camera = { center: { x: 0, y: 0 } as Vec2, zoom: 1 };
  function fitCamera(): void {
    camera.center = { x: 0, y: 0 };
    camera.zoom = fitZoom(level.grid.cols * level.grid.tileSize, level.grid.rows * level.grid.tileSize);
  }
  fitCamera();

  const undoStack: Level[] = [];
  const redoStack: Level[] = [];
  function pushUndo(): void {
    undoStack.push(level);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0; // a new edit invalidates the redo history
  }
  function undo(): void {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(level);
    level = prev;
    selection = null;
    syncTopbar();
  }
  function redo(): void {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(level);
    level = next;
    selection = null;
    syncTopbar();
  }

  // Drag / hover state.
  let dragStart: Vec2 | null = null;
  let dragMode: "none" | "pan" | "paint" | "curb" | "move" | "rect" = "none";
  let curbValue = true; // whether the current curb drag paints or erases
  let lastClient: { x: number; y: number } | null = null;
  let spaceHeld = false;
  let hover: Vec2 | null = null; // latest cursor world position, for the placement preview
  let lastBrushPoint: Vec2 | null = null; // previous drag sample, for interpolation
  const painted = new Set<string>();

  /** Applies a brush at every point along the segment from the previous drag sample (fast drags skip cells). */
  function brushAlongDrag(p: Vec2, apply: (q: Vec2) => void): void {
    const from = lastBrushPoint ?? p;
    lastBrushPoint = p;
    const dist = length(sub(p, from));
    const step = level.grid.tileSize / 2;
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= steps; i++) {
      apply({ x: from.x + ((p.x - from.x) * i) / steps, y: from.y + ((p.y - from.y) * i) / steps });
    }
  }

  // --- DOM ---------------------------------------------------------------
  const root = document.createElement("div");
  root.className = "editor-screen";
  const capture = document.createElement("div");
  capture.className = "editor-capture";
  const palette = document.createElement("div");
  palette.className = "editor-palette";
  const topbar = document.createElement("div");
  topbar.className = "editor-topbar";
  const hints = document.createElement("div");
  hints.className = "editor-hints";
  hints.textContent = "Q pick/copy · R rotate · ⌫ delete car · ⌘Z undo · ⇧⌘Z redo · Space-drag pan · wheel zoom";
  root.append(capture, palette, topbar, hints);
  controlsRoot.appendChild(root);

  function toast(message: string, isError = false): void {
    const el = document.createElement("div");
    el.className = `editor-toast${isError ? " error" : ""}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.remove(), isError ? 3200 : 1600);
  }

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
  function setTool(next: Tool, el: HTMLElement): void {
    tool = next;
    if (next.kind !== "select") selection = null;
    markActive(el);
    if (next.kind !== "car") carFlyout.classList.remove("open");
  }

  const brushButtons = new Map<TileType, HTMLButtonElement>();
  for (const brush of TILE_BRUSHES) {
    const b = paletteButton(brush.label, "editor-tool", () => setTool({ kind: "paint", tile: brush.tile }, b));
    b.dataset.tile = brush.tile;
    brushButtons.set(brush.tile, b);
    toolEls.push(b);
  }

  const curbBtn = paletteButton("Curb (edges)", "editor-tool", () => setTool({ kind: "curb" }, curbBtn));
  curbBtn.dataset.tool = "curb";
  toolEls.push(curbBtn);

  // Car picker: a button that toggles a flyout of all car variants.
  const carBtn = paletteButton(`▾ Car: ${CAR_VARIANT_IDS[0]}`, "editor-tool editor-car", () => {
    setTool({ kind: "car" }, carBtn);
    carFlyout.classList.toggle("open");
  });
  carBtn.dataset.tool = "car";
  toolEls.push(carBtn);
  const carFlyout = document.createElement("div");
  carFlyout.className = "editor-car-flyout";
  function setCarVariant(index: number): void {
    carVariantIndex = index;
    carBtn.textContent = `▾ Car: ${CAR_VARIANT_IDS[index]}`;
  }
  CAR_VARIANT_IDS.forEach((id, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "editor-car-chip";
    chip.dataset.variant = id;
    chip.textContent = id;
    chip.addEventListener("click", () => {
      setCarVariant(i);
      setTool({ kind: "car" }, carBtn);
      carFlyout.classList.remove("open"); // picking a variant closes the flyout
    });
    carFlyout.appendChild(chip);
  });
  palette.appendChild(carFlyout);

  const exitBtn = paletteButton("Exit gate", "editor-tool", () => setTool({ kind: "exit" }, exitBtn));
  toolEls.push(exitBtn);
  const selectBtn = paletteButton("Select / Move", "editor-tool", () => setTool({ kind: "select" }, selectBtn));
  toolEls.push(selectBtn);
  markActive(toolEls[1]!); // grass brush active by default

  // Contextual delete button — appears when a placed car is selected.
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "editor-delete";
  deleteBtn.textContent = "🗑 Delete car (⌫)";
  deleteBtn.addEventListener("click", () => deleteSelection());
  root.appendChild(deleteBtn);

  // --- Topbar ------------------------------------------------------------
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "editor-name";
  nameInput.placeholder = "Level name";
  nameInput.maxLength = 40;
  nameInput.value = level.name;
  nameInput.addEventListener("focus", () => nameInput.select()); // one keystroke to rename
  nameInput.addEventListener("input", () => {
    level = { ...level, name: nameInput.value };
  });
  topbar.appendChild(nameInput);

  function sizeInput(value: number, title: string, onCommit: (v: number) => void): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "editor-size";
    input.min = "6";
    input.max = "80";
    input.step = "1";
    input.title = title;
    input.value = String(value);
    input.addEventListener("change", () => {
      const v = Math.round(Number(input.value));
      if (Number.isFinite(v) && v >= 6 && v <= 80) onCommit(v);
      else input.value = title.startsWith("Map width") ? String(level.grid.cols) : String(level.grid.rows);
    });
    return input;
  }
  const colsInput = sizeInput(level.grid.cols, "Map width (tiles)", (cols) => applyResize(cols, level.grid.rows));
  const rowsInput = sizeInput(level.grid.rows, "Map height (tiles)", (rows) => applyResize(level.grid.cols, rows));
  const sizeWrap = document.createElement("div");
  sizeWrap.className = "editor-size-wrap";
  const times = document.createElement("span");
  times.textContent = "×";
  sizeWrap.append(colsInput, times, rowsInput);
  topbar.appendChild(sizeWrap);

  function applyResize(cols: number, rows: number): void {
    pushUndo();
    level = resizeLevel(level, cols, rows);
    selection = null;
    syncTopbar();
    fitCamera();
  }
  function syncTopbar(): void {
    nameInput.value = level.name;
    colsInput.value = String(level.grid.cols);
    rowsInput.value = String(level.grid.rows);
  }

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
  const fitBtn = topButton("⛶", "editor-zoom editor-fit", () => fitCamera());
  fitBtn.title = "Fit the whole map in view";
  topButton("Test ▸", "editor-test", () => onTest(level, savedJson));

  // Dirty tracking: leaving the editor must NEVER silently lose work. The baseline is the
  // last-persisted state — threaded through Test ▸ round-trips via args.savedState.
  let savedJson = args.savedState ?? JSON.stringify(level);
  function isDirty(): boolean {
    return JSON.stringify(level) !== savedJson;
  }
  function trySave(): boolean {
    try {
      validateLevel(level, catalog);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), true);
      return false;
    }
    onSave(level);
    savedJson = JSON.stringify(level);
    toast(`Saved “${level.name}” ✓`);
    return true;
  }
  topButton("Save", "editor-save", () => void trySave());
  topButton("☰ Menu", "editor-menu", () => {
    if (isDirty()) showExitDialog();
    else onExitToMenu();
  });

  // In-app unsaved-changes dialog (never a native browser popup).
  const exitDialog = document.createElement("div");
  exitDialog.className = "editor-exit-dialog";
  const exitPanel = document.createElement("div");
  exitPanel.className = "editor-exit-panel";
  const exitMessage = document.createElement("p");
  exitPanel.appendChild(exitMessage);
  const exitButtons = document.createElement("div");
  exitButtons.className = "editor-exit-buttons";
  function exitDialogButton(label: string, className: string, onClick: () => void): void {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = label;
    b.addEventListener("click", onClick);
    exitButtons.appendChild(b);
  }
  exitDialogButton("Save & exit", "editor-exit-save", () => {
    if (trySave()) {
      hideExitDialog();
      onExitToMenu();
    }
  });
  exitDialogButton("Discard changes", "editor-exit-discard", () => {
    hideExitDialog();
    onExitToMenu();
  });
  exitDialogButton("Cancel", "editor-exit-cancel", () => hideExitDialog());
  exitPanel.appendChild(exitButtons);
  exitDialog.appendChild(exitPanel);
  exitDialog.addEventListener("click", (e) => {
    if (e.target === exitDialog) hideExitDialog(); // clicking the backdrop cancels
  });
  root.appendChild(exitDialog);
  function showExitDialog(): void {
    exitMessage.textContent = `Save changes to “${level.name || "this level"}”?`;
    exitDialog.classList.add("open");
  }
  function hideExitDialog(): void {
    exitDialog.classList.remove("open");
  }

  // --- Pointer handling --------------------------------------------------
  function worldAt(clientX: number, clientY: number): Vec2 {
    return renderer.screenToWorld(clientX, clientY);
  }

  function paintCell(p: Vec2): void {
    const cell = worldToCell(level.grid, p);
    if (!cell || tool.kind !== "paint") return;
    const key = `${cell.col},${cell.row}`;
    if (painted.has(key)) return;
    painted.add(key);
    level = { ...level, grid: withTile(level.grid, cell.col, cell.row, { type: tool.tile, rot: brushRot }) };
    if (tool.tile === "bay") {
      // A bay is closed end + entrance: paint the full pair in one stroke.
      const { dc, dr } = bayOpeningOffset(brushRot);
      const open = { col: cell.col + dc, row: cell.row + dr };
      painted.add(`${open.col},${open.row}`); // don't overwrite it later in the same stroke
      level = { ...level, grid: withTile(level.grid, open.col, open.row, { type: "bay-open", rot: bayOpenRotFor(brushRot) }) };
    }
  }

  function paintCurb(p: Vec2, prefer?: "h" | "v"): void {
    const edge = nearestEdge(level.grid, p, prefer);
    if (!edge) return;
    const key = `${edge.o}:${edge.col}:${edge.row}`;
    if (painted.has(key)) return;
    painted.add(key);
    level = { ...level, grid: withCurb(level.grid, edge, curbValue) };
  }

  function onPointerDown(e: Event): void {
    const pe = e as PointerEvent;
    pe.preventDefault();
    const p = worldAt(pe.clientX, pe.clientY);
    dragStart = p;
    lastClient = { x: pe.clientX, y: pe.clientY };
    painted.clear();
    lastBrushPoint = p;

    if (spaceHeld || pe.button === 1 || pe.button === 2) {
      dragMode = "pan";
    } else if (tool.kind === "paint") {
      pushUndo();
      dragMode = "paint";
      paintCell(p);
    } else if (tool.kind === "curb") {
      const edge = nearestEdge(level.grid, p);
      curbValue = edge ? !curbAt(level.grid, edge) : true; // starting on a curb erases
      pushUndo();
      dragMode = "curb";
      paintCurb(p);
    } else if (tool.kind === "exit") {
      dragMode = "rect";
    } else if (tool.kind === "select") {
      selection = carAt(level, p, catalog);
      dragMode = selection ? "move" : "pan";
    } else {
      dragMode = "none"; // car placement acts on pointerup
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
      brushAlongDrag(hover, paintCell);
    } else if (dragMode === "curb") {
      // Bias edge choice to the drag direction so brushing along a line never drops perpendicular stubs.
      const from = lastBrushPoint ?? hover;
      const dx = Math.abs(hover.x - from.x);
      const dy = Math.abs(hover.y - from.y);
      const prefer = dx > 2 * dy ? "h" : dy > 2 * dx ? "v" : undefined;
      brushAlongDrag(hover, (q) => paintCurb(q, prefer));
    } else if (dragMode === "move" && selection && dragStart) {
      moveSelection({ x: hover.x - dragStart.x, y: hover.y - dragStart.y });
      dragStart = hover;
    }
  }

  function onPointerUp(e: Event): void {
    const pe = e as PointerEvent;
    const p = worldAt(pe.clientX, pe.clientY);
    const start = dragStart ?? p;

    if (dragMode === "none" && tool.kind === "car") placeCar(p);
    else if (tool.kind === "exit" && dragMode === "rect") {
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

  function onContextMenu(e: Event): void {
    e.preventDefault();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) {
      if (e.key === "Enter" || e.key === "Escape") e.target.blur();
      return; // typing in the name/size inputs must not trigger editor shortcuts
    }
    if (e.key === " ") spaceHeld = true;
    if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === "Escape") {
      if (exitDialog.classList.contains("open")) {
        hideExitDialog();
        return;
      }
      selection = null;
      dragMode = "none";
      carFlyout.classList.remove("open");
      return;
    }
    if (e.key === "r" || e.key === "R") rotateUnderCursor();
    if (e.key === "q" || e.key === "Q") pickUnderCursor();
    if (e.key === "Delete" || e.key === "Backspace") deleteSelection();
    if (selection && e.key === "[") {
      pushUndo();
      rotateSelection(CAR_ROTATE_STEP);
    }
    if (selection && e.key === "]") {
      pushUndo();
      rotateSelection(-CAR_ROTATE_STEP as Radians);
    }
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === " ") spaceHeld = false;
  }

  capture.addEventListener("pointerdown", onPointerDown);
  capture.addEventListener("pointermove", onPointerMove);
  capture.addEventListener("pointerup", onPointerUp);
  capture.addEventListener("wheel", onWheel, { passive: false });
  capture.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // --- Mutations ---------------------------------------------------------
  function carBrushCandidate(p: Vec2): LevelCar {
    return levelCarAtCentre({ variantId: CAR_VARIANT_IDS[carVariantIndex]!, centre: p, heading: carHeading, catalog });
  }
  function placeCar(p: Vec2): void {
    const candidate = carBrushCandidate(p);
    if (carOverlaps(level, candidate, catalog)) return; // no car on top of another
    pushUndo();
    level = { ...level, placedCars: [...level.placedCars, candidate] };
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
    rotateCar(sel, delta);
  }
  function deleteSelection(): void {
    const sel = selection ?? (hover ? carAt(level, hover, catalog) : null);
    if (!sel || sel.kind === "drivable") return; // the player rig can't be deleted
    pushUndo();
    level = { ...level, placedCars: level.placedCars.filter((_, i) => i !== sel.index) };
    selection = null;
  }
  function rotateCar(hit: EditorHit, delta: Radians): void {
    // Rotate about the visible body centre (not the rear axle) so the car spins in place.
    if (hit.kind === "drivable") {
      const obb = levelCarObb(level.drivable, catalog);
      const heading = level.drivable.heading + delta;
      const next = levelCarAtCentre({ variantId: level.drivable.variantId, centre: obb.center, heading, catalog });
      level = { ...level, drivable: { ...level.drivable, position: next.position, heading } };
    } else {
      const car = level.placedCars[hit.index]!;
      const obb = levelCarObb(car, catalog);
      const heading = car.heading + delta;
      const next = levelCarAtCentre({ variantId: car.variantId, centre: obb.center, heading, catalog });
      level = {
        ...level,
        placedCars: level.placedCars.map((c, i) => (i === hit.index ? { ...c, position: next.position, heading } : c)),
      };
    }
  }
  function headingOf(hit: EditorHit): number {
    return hit.kind === "drivable" ? level.drivable.heading : level.placedCars[hit.index]!.heading;
  }

  /**
   * R rotates whatever is under the cursor — a car in 30° steps (also syncing the car brush so the
   * next placed car matches), or the hovered tile a quarter turn; with nothing hovered it rotates
   * the active brush.
   */
  function rotateUnderCursor(): void {
    const car = hover ? carAt(level, hover, catalog) : null;
    if (car) {
      pushUndo();
      rotateCar(car, CAR_ROTATE_STEP);
      carHeading = headingOf(car);
      return;
    }
    if (tool.kind === "paint" && hover) {
      const cell = worldToCell(level.grid, hover);
      if (cell) {
        const tile = level.grid.cells[cell.row * level.grid.cols + cell.col]!;
        pushUndo();
        const rot = (tile.rot + 3) % 4;
        level = { ...level, grid: withTile(level.grid, cell.col, cell.row, { type: tile.type, rot }) };
        brushRot = rot;
        return;
      }
    }
    if (tool.kind === "car") carHeading += CAR_ROTATE_STEP;
    else brushRot = (brushRot + 3) % 4;
  }

  /**
   * Q picks up whatever is under the cursor as the active tool (Factorio-style copy): a car copies
   * its variant AND heading into the car brush; a tile copies its type + rotation into the paint
   * brush. Pressing Q again on the same thing (or over nothing) toggles back to Select/Move.
   */
  function pickUnderCursor(): void {
    const pick = hover ? pickAt(hover) : null;
    if (!pick || toolMatchesPick(pick)) {
      setTool({ kind: "select" }, selectBtn);
      return;
    }
    if (pick.kind === "car") {
      setCarVariant(CAR_VARIANT_IDS.indexOf(pick.variantId));
      carHeading = pick.heading;
      setTool({ kind: "car" }, carBtn);
    } else {
      brushRot = pick.rot;
      setTool({ kind: "paint", tile: pick.tile }, brushButtons.get(pick.tile)!);
    }
  }
  type Pick = { kind: "car"; variantId: string; heading: number } | { kind: "tile"; tile: TileType; rot: number };
  function pickAt(p: Vec2): Pick | null {
    const car = carAt(level, p, catalog);
    if (car) {
      const c = car.kind === "drivable" ? level.drivable : level.placedCars[car.index]!;
      return { kind: "car", variantId: c.variantId, heading: c.heading };
    }
    const cell = worldToCell(level.grid, p);
    if (!cell) return null;
    const tile = level.grid.cells[cell.row * level.grid.cols + cell.col]!;
    return { kind: "tile", tile: tile.type, rot: tile.rot };
  }
  function toolMatchesPick(pick: Pick): boolean {
    if (pick.kind === "car") {
      return tool.kind === "car" && CAR_VARIANT_IDS[carVariantIndex] === pick.variantId && carHeading === pick.heading;
    }
    return tool.kind === "paint" && tool.tile === pick.tile && brushRot === pick.rot;
  }

  /**
   * A ghost of what the current tool will place at the cursor, outlined green (valid) / red.
   * Ghosts are slotted at the depth their real entity will occupy: a tile ghost sits above the
   * existing tiles but BELOW vehicles, a car ghost at vehicle depth, indicators on top of all.
   */
  interface PreviewLayers {
    ground: Entity[];
    vehicles: Entity[];
    overlay: Entity[];
  }
  function previewEntities(): PreviewLayers {
    const none: PreviewLayers = { ground: [], vehicles: [], overlay: [] };
    if (!hover || (dragMode !== "none" && dragMode !== "paint" && dragMode !== "curb")) return none;
    if (tool.kind === "paint") {
      const cell = worldToCell(level.grid, hover);
      if (!cell) return none;
      const center = cellCenter(level.grid, cell.col, cell.row);
      const size = level.grid.tileSize as Metres;
      const ground: Entity[] = [
        {
          id: "editor:preview:tile",
          position: center,
          rotation: (tool.tile === "tree" ? 0 : brushRot * HALF_PI) as Radians,
          size: { width: size, length: size },
          visual: { kind: "sprite", texture: tileGroundTexture(tool.tile) },
        },
      ];
      const overlay: Entity[] = [];
      if (tool.tile === "tree") {
        // Canopy draws above vehicles when placed, so its ghost does too.
        overlay.push({
          id: "editor:preview:canopy",
          position: center,
          rotation: 0 as Radians,
          size: { width: size, length: size },
          visual: { kind: "sprite", texture: "tile-tree" },
        });
      }
      const lineSides: { col: number; row: number; sides: ReturnType<typeof bayMarkedSides> }[] = [
        { col: cell.col, row: cell.row, sides: bayMarkedSides(tool.tile, brushRot) },
      ];
      // The bay brush paints the whole 2-tile bay, so its ghost shows both cells.
      const { dc, dr } = bayOpeningOffset(brushRot);
      const openCell = { col: cell.col + dc, row: cell.row + dr };
      const hasOpenCell = tool.tile === "bay" && inBounds(level.grid, openCell.col, openCell.row);
      if (hasOpenCell) {
        const openCenter = cellCenter(level.grid, openCell.col, openCell.row);
        ground.push({
          id: "editor:preview:tile2",
          position: openCenter,
          rotation: 0 as Radians,
          size: { width: size, length: size },
          visual: { kind: "sprite", texture: tileGroundTexture("bay-open") },
        });
        lineSides.push({ ...openCell, sides: bayMarkedSides("bay-open", bayOpenRotFor(brushRot)) });
        const mid = { x: (center.x + openCenter.x) / 2, y: (center.y + openCenter.y) / 2 };
        const isVertical = dc === 0;
        overlay.push(
          outlineEntity(
            "editor:preview:box",
            mid,
            0 as Radians,
            (isVertical ? size * 2 : size) as Metres,
            (isVertical ? size : size * 2) as Metres,
            0x39ff14,
          ),
        );
      } else {
        overlay.push(outlineEntity("editor:preview:box", center, 0 as Radians, size, size, 0x39ff14));
      }
      // Painted bay lines draw on top of the outline so the opening side reads clearly.
      lineSides.forEach(({ col, row, sides }, cellIndex) => {
        sides.forEach((side, i) => {
          const { a, b } = edgeSegment(level.grid, sideEdge(col, row, side));
          overlay.push(stripEntity(`editor:preview:line:${cellIndex}:${i}`, a, b, BAY_LINE_WIDTH, 0xffffff, 1));
        });
      });
      return { ground, vehicles: [], overlay };
    }
    if (tool.kind === "curb") {
      const edge = nearestEdge(level.grid, hover);
      if (!edge) return none;
      const { a, b } = edgeSegment(level.grid, edge);
      const erases = dragMode === "curb" ? !curbValue : curbAt(level.grid, edge);
      return {
        ...none,
        overlay: [stripEntity("editor:preview:curb", a, b, CURB_THICKNESS as Metres, erases ? 0xff3b30 : 0x39ff14, 0.6)],
      };
    }
    if (tool.kind === "car") {
      const candidate = carBrushCandidate(hover);
      const obb = levelCarObb(candidate, catalog);
      const ok = !carOverlaps(level, candidate, catalog);
      const variant = findCarVariant(catalog, candidate.variantId);
      return {
        ground: [],
        vehicles: [
          {
            id: "editor:preview:car",
            position: obb.center,
            rotation: obb.rotation,
            size: { width: variant.bodyWidth, length: variant.bodyLength },
            visual: { kind: "sprite", texture: variant.texture },
          },
        ],
        overlay: [
          outlineEntity("editor:preview:box", obb.center, obb.rotation, (obb.halfW * 2) as Metres, (obb.halfL * 2) as Metres, ok ? 0x39ff14 : 0xff3b30),
        ],
      };
    }
    if (tool.kind === "exit") {
      const gate = exitGateAt(hover, level.grid);
      const seg = sub(gate.b, gate.a);
      const len = Math.max(length(seg), 0.1) as Metres;
      const mid = { x: (gate.a.x + gate.b.x) / 2, y: (gate.a.y + gate.b.y) / 2 };
      return {
        ...none,
        overlay: [
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
        ],
      };
    }
    return none;
  }

  return {
    tick(): void {
      renderer.setCamera(camera.center, camera.zoom);
      const world = levelToWorld(level, catalog);
      const layers = worldToLayers(world, catalog);
      const preview = previewEntities();
      const top: Entity[] = [];
      if (debug) top.push(...worldToDebugEntities(world, catalog));
      if (selection) top.push(selectionEntity(level, selection, catalog));
      deleteBtn.classList.toggle("visible", selection?.kind === "placed");
      renderer.sync([
        ...layers.ground,
        ...preview.ground,
        ...layers.vehicles,
        ...preview.vehicles,
        ...layers.canopy,
        ...top,
        ...preview.overlay,
      ]);
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
