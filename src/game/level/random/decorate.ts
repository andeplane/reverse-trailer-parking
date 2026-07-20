import { type Radians } from "../../../engine/math/angles";
import type { Obb } from "../../../engine/math/obb";
import { obbOverlap } from "../../../engine/math/obb";
import type { Rng } from "../../../engine/math/rng";
import { rngInt, rngPick } from "../../../engine/math/rng";
import type { MPerS } from "../../../engine/math/units";
import { add, midpoint, perp, rotate, scale, sub, type Vec2 } from "../../../engine/math/vec2";
import { carFootprint, hitchWorld, rearAxleForBodyCentre, trailerFootprint } from "../../vehicle/vehicle-geometry";
import { findCarVariant, findTrailerVariant, type CarState, type VariantCatalog } from "../../vehicle/vehicle-types";
import type { ExitLine, LevelCar } from "../level-types";
import { boundaryWithExitGap, curbFootprints, solidTileFootprints } from "../level-to-world";
import {
  bayOpeningOffset,
  cellCenter,
  cellIndex,
  gridHeight,
  gridWidth,
  inBounds,
  sideEdge,
  tileAt,
  withCurb,
  withTile,
  worldToCell,
  CURB_THICKNESS,
  type TileGrid,
  type TileSide,
} from "../tile-types";
import { localMargin, type DifficultyParams } from "./difficulty";
import { corridorIntersectsObb, type Corridor } from "./corridor";
import type { RecordedPath } from "./drive-in";

/**
 * Decoration: turns the empty skeleton + corridor into a believable parking lot — curbed grass
 * islands, bay rows with parked cars (aisle rules), loose cars, ring curbs and trees — then
 * enforces the difficulty's pinch-point guarantee. Every candidate is rejected if it intersects
 * the corridor. Pure; all randomness from the injected RNG in a fixed order.
 * Returns null when pinch enforcement cannot satisfy the difficulty (caller re-rolls).
 */

const HALF_PI = Math.PI / 2;
const PARKED_VARIANTS = ["suv", "hatchback", "coupe", "wagon"];
const BAY_OCCUPANCY = 0.6;
const PINCH_MIN_SEPARATION = 8;
const PINCH_END_EXCLUSION = 10;

interface DecorState {
  grid: TileGrid;
  placedCars: LevelCar[];
  carObbs: Obb[];
  /** Aisle cells in front of painted bay entrances — nothing may be painted on them. */
  reservedAisle: Set<number>;
}

function placedCarState(car: LevelCar): CarState {
  return {
    variantId: car.variantId,
    role: "placed",
    rearAxle: car.position,
    heading: car.heading as Radians,
    speed: 0 as MPerS,
    steer: 0 as Radians,
    trailer: car.trailerVariantId ? { variantId: car.trailerVariantId, heading: car.heading as Radians } : null,
  };
}

function carFootprints(car: LevelCar, catalog: VariantCatalog): Obb[] {
  const state = placedCarState(car);
  const variant = findCarVariant(catalog, car.variantId);
  const obbs = [carFootprint(state, variant)];
  if (state.trailer) {
    const trailerVariant = findTrailerVariant(catalog, state.trailer.variantId);
    obbs.push(trailerFootprint(state.trailer, hitchWorld(state, variant), trailerVariant));
  }
  return obbs;
}

function isPlainAsphalt(grid: TileGrid, col: number, row: number): boolean {
  return tileAt(grid, col, row)?.type === "asphalt";
}

function isRing(grid: TileGrid, col: number, row: number): boolean {
  return col === 0 || row === 0 || col === grid.cols - 1 || row === grid.rows - 1;
}

function cellObb(grid: TileGrid, col: number, row: number): Obb {
  const half = grid.tileSize / 2;
  return { center: cellCenter(grid, col, row), halfL: half, halfW: half, rotation: 0 as Radians };
}

/** The bay rot whose opening faces the given grid offset. */
function bayRotForOpening(offset: { dc: number; dr: number }): number {
  for (let rot = 0; rot < 4; rot++) {
    const o = bayOpeningOffset(rot);
    if (o.dc === offset.dc && o.dr === offset.dr) return rot;
  }
  throw new Error(`bayRotForOpening: no bay rotation opens toward (${offset.dc}, ${offset.dr})`);
}

/** Convert corridor-grazed ring grass to asphalt so the solution path never runs over grass. */
function clearCorridorCells(state: DecorState, corridor: Corridor): void {
  for (const idx of corridor.cellShadow) {
    const col = idx % state.grid.cols;
    const row = Math.floor(idx / state.grid.cols);
    if (tileAt(state.grid, col, row)?.type === "grass") {
      state.grid = withTile(state.grid, col, row, { type: "asphalt", rot: 0 });
    }
  }
}

function tryPlaceParkedCar(args: {
  state: DecorState;
  corridor: Corridor;
  catalog: VariantCatalog;
  centre: Vec2;
  heading: number;
  variantId: string;
  trailerVariantId?: string;
  extraObstacles: Obb[];
}): boolean {
  const { state, corridor, catalog, centre, heading, variantId, extraObstacles } = args;
  const variant = findCarVariant(catalog, variantId);
  const car: LevelCar = {
    variantId,
    position: rearAxleForBodyCentre({ centre, heading: heading as Radians, variant }),
    heading,
    ...(args.trailerVariantId !== undefined ? { trailerVariantId: args.trailerVariantId } : {}),
  };
  const obbs = carFootprints(car, catalog);
  for (const obb of obbs) {
    if (corridorIntersectsObb(corridor, obb)) return false;
    if (state.carObbs.some((o) => obbOverlap(o, obb))) return false;
    if (extraObstacles.some((o) => obbOverlap(o, obb))) return false;
  }
  state.placedCars.push(car);
  state.carObbs.push(...obbs);
  return true;
}

/** Paint one 2-deep bay pair; reserves its aisle. Assumes cells were already validated. */
function paintBay(state: DecorState, closed: { col: number; row: number }, opening: { dc: number; dr: number }): void {
  const rot = bayRotForOpening(opening);
  const open = { col: closed.col + opening.dc, row: closed.row + opening.dr };
  state.grid = withTile(state.grid, closed.col, closed.row, { type: "bay", rot });
  state.grid = withTile(state.grid, open.col, open.row, { type: "bay-open", rot: rot % 2 === 0 ? 0 : 1 });
  for (const step of [1, 2]) {
    const aisle = { col: open.col + opening.dc * step, row: open.row + opening.dr * step };
    if (inBounds(state.grid, aisle.col, aisle.row)) {
      state.reservedAisle.add(cellIndex(state.grid, aisle.col, aisle.row));
    }
  }
}

function bayPairUsable(state: DecorState, corridor: Corridor, closed: { col: number; row: number }, opening: { dc: number; dr: number }): boolean {
  const open = { col: closed.col + opening.dc, row: closed.row + opening.dr };
  for (const cell of [closed, open]) {
    if (!inBounds(state.grid, cell.col, cell.row)) return false;
    if (isRing(state.grid, cell.col, cell.row)) return false;
    if (!isPlainAsphalt(state.grid, cell.col, cell.row)) return false;
    const idx = cellIndex(state.grid, cell.col, cell.row);
    if (corridor.cellShadow.has(idx) || state.reservedAisle.has(idx)) return false;
  }
  // Aisle rule: the two tiles in front of the entrance must be asphalt (the corridor counts).
  for (const step of [1, 2]) {
    const aisle = { col: open.col + opening.dc * step, row: open.row + opening.dr * step };
    if (!inBounds(state.grid, aisle.col, aisle.row)) return false;
    if (!isPlainAsphalt(state.grid, aisle.col, aisle.row)) return false;
  }
  return true;
}

/** The player-start dock: paint a bay under the car and try to flank it with parked cars. */
function decorateDock(args: {
  state: DecorState;
  corridor: Corridor;
  path: RecordedPath;
  catalog: VariantCatalog;
  rng: Rng;
}): void {
  const { state, corridor, path, catalog, rng } = args;
  const last = path.samples[path.samples.length - 1];
  if (!last) return;
  const axis = Math.round(last.heading / HALF_PI) * HALF_PI;
  if (Math.abs(last.heading - axis) > 0.05) return; // not axis-aligned; skip the dressing
  const dir = { x: Math.round(Math.cos(axis)), y: Math.round(Math.sin(axis)) };
  const opening = { dc: -dir.x, dr: dir.y }; // opening faces backwards (grid rows grow south)
  const centre = last.carObb.center;
  const tile = state.grid.tileSize;
  const noseCell = worldToCell(state.grid, add(centre, scale(dir, tile * 0.45)));
  if (!noseCell) return;
  const closed = noseCell;
  const open = { col: closed.col + opening.dc, row: closed.row + opening.dr };
  const openIsBehind =
    worldToCell(state.grid, add(centre, scale(dir, -tile * 0.45)))?.col === open.col &&
    worldToCell(state.grid, add(centre, scale(dir, -tile * 0.45)))?.row === open.row;
  if (!openIsBehind) return;
  if (!bayPairUsable(state, corridor, closed, opening)) {
    // The player's own cells sit under the corridor shadow — paint anyway if they're plain
    // interior asphalt (still never on the ring/access road or a reserved aisle).
    for (const cell of [closed, open]) {
      if (!inBounds(state.grid, cell.col, cell.row) || !isPlainAsphalt(state.grid, cell.col, cell.row)) return;
      if (isRing(state.grid, cell.col, cell.row)) return;
      if (state.reservedAisle.has(cellIndex(state.grid, cell.col, cell.row))) return;
    }
  }
  paintBay(state, closed, opening);

  // Flanking bays + cars at ±1 column (perpendicular to the lane).
  const lateral = { dc: Math.abs(dir.y), dr: Math.abs(dir.x) };
  for (const side of [1, -1]) {
    const flankClosed = { col: closed.col + lateral.dc * side, row: closed.row + lateral.dr * side };
    if (!bayPairUsable(state, corridor, flankClosed, opening)) continue;
    paintBay(state, flankClosed, opening);
    const flankOpen = { col: flankClosed.col + opening.dc, row: flankClosed.row + opening.dr };
    const bayCentre = midpoint(
      cellCenter(state.grid, flankClosed.col, flankClosed.row),
      cellCenter(state.grid, flankOpen.col, flankOpen.row),
    );
    tryPlaceParkedCar({
      state,
      corridor,
      catalog,
      centre: bayCentre,
      heading: axis,
      variantId: rngPick(rng, PARKED_VARIANTS),
      extraObstacles: [],
    });
  }
}

interface IslandSpec {
  col: number;
  row: number;
  w: number;
  h: number;
}

function tryPlaceIsland(args: {
  state: DecorState;
  corridor: Corridor;
  rng: Rng;
  spec: IslandSpec;
}): boolean {
  const { state, corridor, rng, spec } = args;
  const cells: { col: number; row: number }[] = [];
  for (let dc = 0; dc < spec.w; dc++) {
    for (let dr = 0; dr < spec.h; dr++) {
      const col = spec.col + dc;
      const row = spec.row + dr;
      if (!inBounds(state.grid, col, row) || isRing(state.grid, col, row)) return false;
      if (!isPlainAsphalt(state.grid, col, row)) return false;
      const idx = cellIndex(state.grid, col, row);
      if (corridor.cellShadow.has(idx) || state.reservedAisle.has(idx)) return false;
      cells.push({ col, row });
    }
  }
  // Whole-island footprint must clear placed cars too.
  const islandObb: Obb = {
    center: midpoint(
      cellCenter(state.grid, spec.col, spec.row),
      cellCenter(state.grid, spec.col + spec.w - 1, spec.row + spec.h - 1),
    ),
    halfL: (spec.w * state.grid.tileSize) / 2,
    halfW: (spec.h * state.grid.tileSize) / 2,
    rotation: 0 as Radians,
  };
  if (state.carObbs.some((o) => obbOverlap(o, islandObb))) return false;

  for (const cell of cells) {
    state.grid = withTile(state.grid, cell.col, cell.row, { type: "grass", rot: 0 });
  }
  // 1–2 trees/hedges inside.
  const solids = rngInt({ rng, min: 1, max: Math.min(2, cells.length) });
  for (let i = 0; i < solids; i++) {
    const cell = rngPick(rng, cells);
    state.grid = withTile(state.grid, cell.col, cell.row, { type: rng.next() < 0.5 ? "tree" : "hedge", rot: 0 });
  }
  // Full-perimeter curbs (drop any segment that would graze the corridor).
  for (const cell of cells) {
    const neighbours: { side: TileSide; dc: number; dr: number }[] = [
      { side: "N", dc: 0, dr: -1 },
      { side: "S", dc: 0, dr: 1 },
      { side: "W", dc: -1, dr: 0 },
      { side: "E", dc: 1, dr: 0 },
    ];
    for (const n of neighbours) {
      const nc = cell.col + n.dc;
      const nr = cell.row + n.dr;
      const inside =
        nc >= spec.col && nc < spec.col + spec.w && nr >= spec.row && nr < spec.row + spec.h;
      if (inside) continue;
      // No curb against another green cell — adjacent islands merge into one shape (also drop
      // the older island's curb on the now-shared edge).
      const neighbourType = tileAt(state.grid, nc, nr)?.type;
      if (neighbourType === "grass" || neighbourType === "hedge" || neighbourType === "tree") {
        if (!isRing(state.grid, nc, nr)) {
          state.grid = withCurb(state.grid, sideEdge(cell.col, cell.row, n.side), false);
        }
        continue;
      }
      const edge = sideEdge(cell.col, cell.row, n.side);
      const strip = curbStripObb(state.grid, cell, n);
      if (!corridorIntersectsObb(corridor, strip)) {
        state.grid = withCurb(state.grid, edge, true);
      }
    }
  }
  return true;
}

function curbStripObb(grid: TileGrid, cell: { col: number; row: number }, n: { dc: number; dr: number }): Obb {
  const centre = cellCenter(grid, cell.col, cell.row);
  const half = grid.tileSize / 2;
  const mid = add(centre, { x: n.dc * half, y: -n.dr * half });
  const horizontal = n.dr !== 0;
  return {
    center: mid,
    halfL: horizontal ? half : CURB_THICKNESS / 2,
    halfW: horizontal ? CURB_THICKNESS / 2 : half,
    rotation: 0 as Radians,
  };
}

function decorateIslands(args: {
  state: DecorState;
  corridor: Corridor;
  params: DifficultyParams;
  rng: Rng;
}): void {
  const { state, corridor, params, rng } = args;
  const target = rngInt({ rng, min: params.islandsMin, max: params.islandsMax });
  let placed = 0;
  for (let attempt = 0; attempt < target * 8 && placed < target; attempt++) {
    const horizontal = rng.next() < 0.5;
    const w = horizontal ? rngInt({ rng, min: 3, max: 5 }) : rngInt({ rng, min: 2, max: 3 });
    const h = horizontal ? rngInt({ rng, min: 2, max: 3 }) : rngInt({ rng, min: 3, max: 5 });
    const spec: IslandSpec = {
      col: rngInt({ rng, min: 2, max: Math.max(2, state.grid.cols - 2 - w) }),
      row: rngInt({ rng, min: 2, max: Math.max(2, state.grid.rows - 2 - h) }),
      w,
      h,
    };
    if (tryPlaceIsland({ state, corridor, rng, spec })) placed++;
  }
}

/** Bay rows along the grass ring, honouring the aisle rules. */
function decorateBayRows(args: {
  state: DecorState;
  corridor: Corridor;
  catalog: VariantCatalog;
  rng: Rng;
}): void {
  const { state, corridor, catalog, rng } = args;
  const { cols, rows } = state.grid;
  const sides = [
    { opening: { dc: 0, dr: 1 }, heading: HALF_PI, cells: range(1, cols - 2).map((c) => ({ col: c, row: 1 })) },
    { opening: { dc: 0, dr: -1 }, heading: -HALF_PI, cells: range(1, cols - 2).map((c) => ({ col: c, row: rows - 2 })) },
    { opening: { dc: 1, dr: 0 }, heading: Math.PI, cells: range(1, rows - 2).map((r) => ({ col: 1, row: r })) },
    { opening: { dc: -1, dr: 0 }, heading: 0, cells: range(1, rows - 2).map((r) => ({ col: cols - 2, row: r })) },
  ];
  for (const side of sides) {
    if (rng.next() > 0.75) continue;
    // Find maximal runs of usable bay positions, paint runs of length >= 3.
    let run: { col: number; row: number }[] = [];
    const flush = (): void => {
      if (run.length >= 3) {
        for (const closed of run) {
          paintBay(state, closed, side.opening);
          if (rng.next() < BAY_OCCUPANCY) {
            const open = { col: closed.col + side.opening.dc, row: closed.row + side.opening.dr };
            const centre = midpoint(
              cellCenter(state.grid, closed.col, closed.row),
              cellCenter(state.grid, open.col, open.row),
            );
            tryPlaceParkedCar({
              state,
              corridor,
              catalog,
              centre,
              heading: side.heading,
              variantId: rngPick(rng, PARKED_VARIANTS),
              extraObstacles: [],
            });
          }
        }
      }
      run = [];
    };
    for (const cell of side.cells) {
      if (bayPairUsable(state, corridor, cell, side.opening)) run.push(cell);
      else flush();
    }
    flush();
  }
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

function decorateLooseCars(args: {
  state: DecorState;
  corridor: Corridor;
  catalog: VariantCatalog;
  params: DifficultyParams;
  rng: Rng;
  boundary: Obb[];
}): void {
  const { state, corridor, catalog, params, rng, boundary } = args;
  const target = rngInt({ rng, min: params.looseCarsMin, max: params.looseCarsMax });
  if (target === 0) return;
  const nonAsphaltObbs = (): Obb[] => {
    const obbs: Obb[] = [];
    for (let row = 0; row < state.grid.rows; row++) {
      for (let col = 0; col < state.grid.cols; col++) {
        if (!isPlainAsphalt(state.grid, col, row)) obbs.push(cellObb(state.grid, col, row));
      }
    }
    return obbs;
  };
  const blockers = [...nonAsphaltObbs(), ...curbFootprints(state.grid), ...boundary];
  let placed = 0;
  for (let attempt = 0; attempt < target * 10 && placed < target; attempt++) {
    const col = rngInt({ rng, min: 2, max: state.grid.cols - 3 });
    const row = rngInt({ rng, min: 2, max: state.grid.rows - 3 });
    if (!isPlainAsphalt(state.grid, col, row)) continue;
    const heading = rngPick(rng, [0, HALF_PI, Math.PI, -HALF_PI]);
    const tows = rng.next() < 0.3;
    if (
      tryPlaceParkedCar({
        state,
        corridor,
        catalog,
        centre: cellCenter(state.grid, col, row),
        heading,
        variantId: rngPick(rng, PARKED_VARIANTS),
        ...(tows ? { trailerVariantId: rngPick(rng, ["utility", "caravan"]) } : {}),
        extraObstacles: blockers,
      })
    ) {
      placed++;
    }
  }
}

/**
 * Fraction of interior non-corridor cells that are still plain asphalt. This is the "escape room"
 * a player can use to bypass the intended corridor entirely, so it is a difficulty measure.
 */
export function openFraction(grid: TileGrid, corridor: Corridor): number {
  let open = 0;
  let total = 0;
  for (let row = 1; row < grid.rows - 1; row++) {
    for (let col = 1; col < grid.cols - 1; col++) {
      if (corridor.cellShadow.has(cellIndex(grid, col, row))) continue;
      total++;
      if (isPlainAsphalt(grid, col, row)) open++;
    }
  }
  return total === 0 ? 0 : open / total;
}

const FILL_ATTEMPTS = 400;

/**
 * Consume leftover open asphalt with curbed islands until the difficulty's openness ceiling is
 * met (best-effort: reserved bay aisles stay open, so the ceiling may not be exactly reachable).
 * Without this, everything outside the corridor is an empty field and the guaranteed pinch
 * points are trivially avoidable.
 */
function fillOpenSpace(args: {
  state: DecorState;
  corridor: Corridor;
  params: DifficultyParams;
  rng: Rng;
}): void {
  const { state, corridor, params, rng } = args;
  if (params.maxOpenFraction >= 1) return;
  for (let attempt = 0; attempt < FILL_ATTEMPTS; attempt++) {
    if (openFraction(state.grid, corridor) <= params.maxOpenFraction) return;
    const fillable: { col: number; row: number }[] = [];
    for (let row = 1; row < state.grid.rows - 1; row++) {
      for (let col = 1; col < state.grid.cols - 1; col++) {
        if (!isPlainAsphalt(state.grid, col, row)) continue;
        const idx = cellIndex(state.grid, col, row);
        if (corridor.cellShadow.has(idx) || state.reservedAisle.has(idx)) continue;
        fillable.push({ col, row });
      }
    }
    if (fillable.length === 0) return;
    const cell = rngPick(rng, fillable);
    const w = rngInt({ rng, min: 1, max: 3 });
    const h = rngInt({ rng, min: 1, max: 3 });
    if (!tryPlaceIsland({ state, corridor, rng, spec: { col: cell.col, row: cell.row, w, h } })) {
      tryPlaceIsland({ state, corridor, rng, spec: { col: cell.col, row: cell.row, w: 1, h: 1 } });
    }
  }
}

/** Curbs along the ring's inner edge where it meets plain asphalt (skipping corridor grazes). */
function decorateRingCurbs(state: DecorState, corridor: Corridor): void {
  const { cols, rows } = state.grid;
  const edges: { cell: { col: number; row: number }; n: { dc: number; dr: number }; side: TileSide }[] = [];
  for (let c = 1; c < cols - 1; c++) {
    edges.push({ cell: { col: c, row: 1 }, n: { dc: 0, dr: -1 }, side: "N" });
    edges.push({ cell: { col: c, row: rows - 2 }, n: { dc: 0, dr: 1 }, side: "S" });
  }
  for (let r = 1; r < rows - 1; r++) {
    edges.push({ cell: { col: 1, row: r }, n: { dc: -1, dr: 0 }, side: "W" });
    edges.push({ cell: { col: cols - 2, row: r }, n: { dc: 1, dr: 0 }, side: "E" });
  }
  for (const e of edges) {
    const inner = tileAt(state.grid, e.cell.col, e.cell.row);
    const outer = tileAt(state.grid, e.cell.col + e.n.dc, e.cell.row + e.n.dr);
    if (inner?.type !== "asphalt" || outer?.type !== "grass") continue;
    const strip = curbStripObb(state.grid, e.cell, e.n);
    if (corridorIntersectsObb(corridor, strip)) continue;
    state.grid = withCurb(state.grid, sideEdge(e.cell.col, e.cell.row, e.side), true);
  }
}

function decorateTrees(state: DecorState, rng: Rng): void {
  const ringGrass: { col: number; row: number }[] = [];
  for (let row = 0; row < state.grid.rows; row++) {
    for (let col = 0; col < state.grid.cols; col++) {
      if (isRing(state.grid, col, row) && tileAt(state.grid, col, row)?.type === "grass") {
        ringGrass.push({ col, row });
      }
    }
  }
  const trees: { col: number; row: number }[] = [];
  const maxTrees = 6;
  for (let attempt = 0; attempt < 30 && trees.length < maxTrees && ringGrass.length > 0; attempt++) {
    const cell = rngPick(rng, ringGrass);
    if (trees.some((t) => Math.abs(t.col - cell.col) + Math.abs(t.row - cell.row) < 3)) continue;
    trees.push(cell);
    state.grid = withTile(state.grid, cell.col, cell.row, { type: "tree", rot: 0 });
  }
}

// --- Pinch points ---------------------------------------------------------

/** All immovable obstacle footprints in the current decoration state. */
function obstacleObbs(state: DecorState, exit: ExitLine): Obb[] {
  const bounds = { width: gridWidth(state.grid), height: gridHeight(state.grid) };
  return [
    ...state.carObbs,
    ...solidTileFootprints(state.grid),
    ...curbFootprints(state.grid),
    ...boundaryWithExitGap(bounds, exit),
  ];
}

const RIG_HALF_WIDTH = 1.0;
/** How far past the clearance margin an obstacle still "pinches" (tile granularity forgiveness). */
const PINCH_REACH = 2.2;

function sideBlocked(args: {
  sample: { rearAxle: Vec2; heading: number };
  side: 1 | -1;
  margin: number;
  obstacles: Obb[];
}): boolean {
  const { sample, side, margin, obstacles } = args;
  const n = perp(rotate({ x: 1, y: 0 }, sample.heading as Radians));
  const centre = add(sample.rearAxle, scale(n, side * (RIG_HALF_WIDTH + margin + PINCH_REACH / 2 + 0.05)));
  const probe: Obb = {
    center: centre,
    halfL: 0.3,
    halfW: PINCH_REACH / 2,
    rotation: sample.heading as Radians,
  };
  return obstacles.some((o) => obbOverlap(probe, o));
}

/** Arc positions (sample indices) that currently qualify as pinch points, >= 8 m apart. */
function findPinches(args: {
  state: DecorState;
  path: RecordedPath;
  params: DifficultyParams;
  marginScale: number;
  exit: ExitLine;
}): number[] {
  const { state, path, params, marginScale, exit } = args;
  const obstacles = obstacleObbs(state, exit);
  const pinches: number[] = [];
  let lastPinchS = -Infinity;
  let nextS = 0;
  for (const sample of path.samples) {
    if (sample.s < nextS) continue;
    nextS = sample.s + 1;
    if (sample.s < PINCH_END_EXCLUSION || sample.s > path.arcLength - PINCH_END_EXCLUSION) continue;
    if (sample.s - lastPinchS < PINCH_MIN_SEPARATION) continue;
    const margin = localMargin({ baseMargin: params.baseMargin, distFromStart: path.arcLength - sample.s }) * marginScale;
    if (
      sideBlocked({ sample, side: 1, margin, obstacles }) &&
      sideBlocked({ sample, side: -1, margin, obstacles })
    ) {
      pinches.push(sample.s);
      lastPinchS = sample.s;
    }
  }
  return pinches;
}

/** Actively create pinches until the difficulty's requirement is met. False = cannot satisfy. */
function enforcePinches(args: {
  state: DecorState;
  corridor: Corridor;
  path: RecordedPath;
  params: DifficultyParams;
  marginScale: number;
  exit: ExitLine;
  rng: Rng;
}): boolean {
  const { state, corridor, path, params, marginScale, exit, rng } = args;
  if (params.requiredPinches === 0) return true;

  for (let attempt = 0; attempt < 80; attempt++) {
    const existing = findPinches({ state, path, params, marginScale, exit });
    if (existing.length >= params.requiredPinches) return true;

    // Candidate arc positions away from ends and existing pinches.
    const candidates = path.samples.filter(
      (sample) =>
        sample.s > PINCH_END_EXCLUSION &&
        sample.s < path.arcLength - PINCH_END_EXCLUSION &&
        existing.every((p) => Math.abs(p - sample.s) >= PINCH_MIN_SEPARATION),
    );
    if (candidates.length === 0) return false;
    const sample = rngPick(rng, candidates);
    const margin = localMargin({ baseMargin: params.baseMargin, distFromStart: path.arcLength - sample.s }) * marginScale;
    const obstacles = obstacleObbs(state, exit);
    for (const side of [1, -1] as const) {
      if (sideBlocked({ sample, side, margin, obstacles })) continue;
      // Scan cells on the unblocked side, nearest to the corridor edge first, and drop a compact
      // curbed island whose footprint reaches into the probe band.
      const n = perp(rotate({ x: 1, y: 0 }, sample.heading as Radians));
      const forward = rotate({ x: 1, y: 0 }, sample.heading as Radians);
      const candidateCells: { col: number; row: number; lateral: number }[] = [];
      for (let row = 1; row < state.grid.rows - 1; row++) {
        for (let col = 1; col < state.grid.cols - 1; col++) {
          const delta = sub(cellCenter(state.grid, col, row), sample.rearAxle);
          const lateral = (delta.x * n.x + delta.y * n.y) * side;
          const along = Math.abs(delta.x * forward.x + delta.y * forward.y);
          if (along > 2.5) continue;
          if (lateral < RIG_HALF_WIDTH + margin - 0.5 || lateral > RIG_HALF_WIDTH + margin + 4) continue;
          candidateCells.push({ col, row, lateral });
        }
      }
      candidateCells.sort((a, b) => a.lateral - b.lateral);
      for (const cell of candidateCells) {
        const placed = [
          { col: cell.col, row: cell.row, w: 2, h: 2 },
          { col: cell.col - 1, row: cell.row, w: 2, h: 2 },
          { col: cell.col, row: cell.row - 1, w: 2, h: 2 },
          { col: cell.col - 1, row: cell.row - 1, w: 2, h: 2 },
        ].some((spec) => tryPlaceIsland({ state, corridor, rng, spec }));
        if (placed && sideBlocked({ sample, side, margin, obstacles: obstacleObbs(state, exit) })) break;
      }
    }
  }
  return findPinches({ state, path, params, marginScale, exit }).length >= params.requiredPinches;
}

// --- Entry point ----------------------------------------------------------

export function decorate(args: {
  grid: TileGrid;
  corridor: Corridor;
  path: RecordedPath;
  exit: ExitLine;
  params: DifficultyParams;
  marginScale: number;
  catalog: VariantCatalog;
  rng: Rng;
}): { grid: TileGrid; placedCars: LevelCar[] } | null {
  const { grid, corridor, path, exit, params, marginScale, catalog, rng } = args;
  const state: DecorState = { grid, placedCars: [], carObbs: [], reservedAisle: new Set() };
  const bounds = { width: gridWidth(grid), height: gridHeight(grid) };
  const boundary = boundaryWithExitGap(bounds, exit);

  clearCorridorCells(state, corridor);
  decorateDock({ state, corridor, path, catalog, rng });
  // Difficulty first: pinch islands get first pick of the free cells, THEN scenery fills in.
  if (!enforcePinches({ state, corridor, path, params, marginScale, exit, rng })) return null;
  decorateIslands({ state, corridor, params, rng });
  decorateBayRows({ state, corridor, catalog, rng });
  decorateLooseCars({ state, corridor, catalog, params, rng, boundary });
  fillOpenSpace({ state, corridor, params, rng });
  decorateRingCurbs(state, corridor);
  decorateTrees(state, rng);

  return { grid: state.grid, placedCars: state.placedCars };
}
