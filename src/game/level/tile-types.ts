import type { Vec2 } from "../../engine/math/vec2";

/**
 * The map is a grid of square tiles plus **curbs on cell edges**. `asphalt`/`grass`/`bay`/
 * `bay-open` are drivable ground; `hedge` is solid (collidable); `tree` is a canopy over grass
 * (also solid). `rot` is 0..3 quarter turns (only meaningful for directional tiles — for a `bay`
 * it picks which side the opening faces: rot 0 opens south/−y, each step turns it 90° CCW).
 * Curbs live *between* tiles (edge properties), not as tiles of their own.
 */
export type TileType = "asphalt" | "grass" | "bay" | "bay-open" | "hedge" | "tree";

export interface Tile {
  type: TileType;
  rot: number; // 0..3
}

export interface TileGrid {
  tileSize: number; // metres per cell
  cols: number;
  rows: number;
  cells: Tile[]; // length cols*rows, row-major (row 0 = top)
  /** Curbs on horizontal cell edges: (rows+1)×cols row-major; index r*cols+c = edge above row r. */
  hCurbs: boolean[];
  /** Curbs on vertical cell edges: rows×(cols+1) row-major; index r*(cols+1)+c = edge left of col c. */
  vCurbs: boolean[];
}

export const ALL_TILE_TYPES: readonly TileType[] = ["asphalt", "grass", "bay", "bay-open", "hedge", "tree"];

/** Tiles that block the rig (curbs are edges, handled separately). */
export const SOLID_TILES: ReadonlySet<TileType> = new Set<TileType>(["hedge", "tree"]);

/** Tiles rendered above vehicles (canopy). */
export const CANOPY_TILES: ReadonlySet<TileType> = new Set<TileType>(["tree"]);

/** Collision + visual thickness of an edge curb strip, metres (centred on the edge line). */
export const CURB_THICKNESS = 0.35;

export function isSolidTile(type: TileType): boolean {
  return SOLID_TILES.has(type);
}

export function gridWidth(grid: TileGrid): number {
  return grid.cols * grid.tileSize;
}
export function gridHeight(grid: TileGrid): number {
  return grid.rows * grid.tileSize;
}

export function inBounds(grid: TileGrid, col: number, row: number): boolean {
  return col >= 0 && col < grid.cols && row >= 0 && row < grid.rows;
}

export function cellIndex(grid: TileGrid, col: number, row: number): number {
  return row * grid.cols + col;
}

export function tileAt(grid: TileGrid, col: number, row: number): Tile | null {
  if (!inBounds(grid, col, row)) return null;
  return grid.cells[cellIndex(grid, col, row)] ?? null;
}

/** World-space position of the grid corner at column line `col`, row line `row`. */
function cornerAt(grid: TileGrid, col: number, row: number): Vec2 {
  return { x: -gridWidth(grid) / 2 + col * grid.tileSize, y: gridHeight(grid) / 2 - row * grid.tileSize };
}

/** World-space centre of a cell (centre-origin playfield, +y up; row 0 is the top row). */
export function cellCenter(grid: TileGrid, col: number, row: number): Vec2 {
  const w = gridWidth(grid);
  const h = gridHeight(grid);
  return {
    x: -w / 2 + (col + 0.5) * grid.tileSize,
    y: h / 2 - (row + 0.5) * grid.tileSize,
  };
}

/** The cell containing a world point, or null if outside the grid. */
export function worldToCell(grid: TileGrid, p: Vec2): { col: number; row: number } | null {
  const w = gridWidth(grid);
  const h = gridHeight(grid);
  const col = Math.floor((p.x + w / 2) / grid.tileSize);
  const row = Math.floor((h / 2 - p.y) / grid.tileSize);
  return inBounds(grid, col, row) ? { col, row } : null;
}

/** A grid filled uniformly with one tile type (no curbs). */
export function filledGrid(cols: number, rows: number, tileSize: number, type: TileType = "asphalt"): TileGrid {
  const cells: Tile[] = Array.from({ length: cols * rows }, () => ({ type, rot: 0 }));
  return {
    tileSize,
    cols,
    rows,
    cells,
    hCurbs: new Array<boolean>((rows + 1) * cols).fill(false),
    vCurbs: new Array<boolean>(rows * (cols + 1)).fill(false),
  };
}

/** Returns a copy of the grid with one cell set (out-of-range is ignored). */
export function withTile(grid: TileGrid, col: number, row: number, tile: Tile): TileGrid {
  if (!inBounds(grid, col, row)) return grid;
  const cells = grid.cells.slice();
  cells[cellIndex(grid, col, row)] = { ...tile };
  return { ...grid, cells };
}

// --- Edge curbs -----------------------------------------------------------

/**
 * A cell-edge reference. Horizontal edges (`o: "h"`) run along x: `row` is the row *line* 0..rows
 * (0 = top of the grid) and `col` the cell column under/over it. Vertical edges (`o: "v"`) run
 * along y: `col` is the column *line* 0..cols and `row` the cell row beside it.
 */
export interface EdgeRef {
  o: "h" | "v";
  col: number;
  row: number;
}

export function edgeInBounds(grid: TileGrid, e: EdgeRef): boolean {
  if (e.o === "h") return e.col >= 0 && e.col < grid.cols && e.row >= 0 && e.row <= grid.rows;
  return e.col >= 0 && e.col <= grid.cols && e.row >= 0 && e.row < grid.rows;
}

function edgeIndex(grid: TileGrid, e: EdgeRef): number {
  return e.o === "h" ? e.row * grid.cols + e.col : e.row * (grid.cols + 1) + e.col;
}

export function curbAt(grid: TileGrid, e: EdgeRef): boolean {
  if (!edgeInBounds(grid, e)) return false;
  return (e.o === "h" ? grid.hCurbs : grid.vCurbs)[edgeIndex(grid, e)] ?? false;
}

/** Returns a copy of the grid with one edge's curb set/cleared (out-of-range is ignored). */
export function withCurb(grid: TileGrid, e: EdgeRef, on: boolean): TileGrid {
  if (!edgeInBounds(grid, e)) return grid;
  if (e.o === "h") {
    const hCurbs = grid.hCurbs.slice();
    hCurbs[edgeIndex(grid, e)] = on;
    return { ...grid, hCurbs };
  }
  const vCurbs = grid.vCurbs.slice();
  vCurbs[edgeIndex(grid, e)] = on;
  return { ...grid, vCurbs };
}

/** World-space segment of a cell edge (a→b along +x for horizontal, along −y for vertical). */
export function edgeSegment(grid: TileGrid, e: EdgeRef): { a: Vec2; b: Vec2 } {
  if (e.o === "h") return { a: cornerAt(grid, e.col, e.row), b: cornerAt(grid, e.col + 1, e.row) };
  return { a: cornerAt(grid, e.col, e.row), b: cornerAt(grid, e.col, e.row + 1) };
}

/** The cell edge nearest a world point, or null if the point is off the grid (with a small margin). */
export function nearestEdge(grid: TileGrid, p: Vec2): EdgeRef | null {
  const w = gridWidth(grid);
  const h = gridHeight(grid);
  const margin = grid.tileSize / 2;
  if (p.x < -w / 2 - margin || p.x > w / 2 + margin || p.y < -h / 2 - margin || p.y > h / 2 + margin) return null;
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const fx = clamp((p.x + w / 2) / grid.tileSize, 0, grid.cols);
  const fy = clamp((h / 2 - p.y) / grid.tileSize, 0, grid.rows);

  const hEdge: EdgeRef = {
    o: "h",
    col: clamp(Math.floor(fx), 0, grid.cols - 1),
    row: clamp(Math.round(fy), 0, grid.rows),
  };
  const vEdge: EdgeRef = {
    o: "v",
    col: clamp(Math.round(fx), 0, grid.cols),
    row: clamp(Math.floor(fy), 0, grid.rows - 1),
  };
  const hDist = Math.abs(fy - hEdge.row);
  const vDist = Math.abs(fx - vEdge.col);
  return hDist <= vDist ? hEdge : vEdge;
}

/** Maximal straight runs of consecutive curbed edges, as world segments (for render + collision). */
export function curbRuns(grid: TileGrid): { a: Vec2; b: Vec2 }[] {
  const runs: { a: Vec2; b: Vec2 }[] = [];
  for (let row = 0; row <= grid.rows; row++) {
    let start = -1;
    for (let col = 0; col <= grid.cols; col++) {
      const on = col < grid.cols && curbAt(grid, { o: "h", col, row });
      if (on && start < 0) start = col;
      if (!on && start >= 0) {
        runs.push({ a: cornerAt(grid, start, row), b: cornerAt(grid, col, row) });
        start = -1;
      }
    }
  }
  for (let col = 0; col <= grid.cols; col++) {
    let start = -1;
    for (let row = 0; row <= grid.rows; row++) {
      const on = row < grid.rows && curbAt(grid, { o: "v", col, row });
      if (on && start < 0) start = row;
      if (!on && start >= 0) {
        runs.push({ a: cornerAt(grid, col, start), b: cornerAt(grid, col, row) });
        start = -1;
      }
    }
  }
  return runs;
}

/** Grid resized to cols×rows, preserving overlapping cells/curbs (anchored top-left, asphalt fill). */
export function resizeGrid(grid: TileGrid, cols: number, rows: number): TileGrid {
  const next = filledGrid(cols, rows, grid.tileSize);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const old = tileAt(grid, col, row);
      if (old) next.cells[row * cols + col] = { ...old };
    }
  }
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col < cols; col++) {
      next.hCurbs[row * cols + col] = curbAt(grid, { o: "h", col, row });
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= cols; col++) {
      next.vCurbs[row * (cols + 1) + col] = curbAt(grid, { o: "v", col, row });
    }
  }
  return next;
}

// --- Bay line markings ----------------------------------------------------

export type TileSide = "N" | "E" | "S" | "W";

/** Opening side of a `bay` tile by rot: 0 opens south (−y), each step turns 90° CCW. */
const BAY_OPENING: readonly TileSide[] = ["S", "E", "N", "W"];

/** Which sides of a tile get painted bay lines (empty for non-bay tiles). */
export function bayMarkedSides(type: TileType, rot: number): TileSide[] {
  const r = ((rot % 4) + 4) % 4;
  if (type === "bay") {
    const open = BAY_OPENING[r]!;
    return (["N", "E", "S", "W"] as TileSide[]).filter((s) => s !== open);
  }
  if (type === "bay-open") return r % 2 === 0 ? ["E", "W"] : ["N", "S"];
  return [];
}

/** The cell edge on a given side of cell (col,row). */
export function sideEdge(col: number, row: number, side: TileSide): EdgeRef {
  switch (side) {
    case "N":
      return { o: "h", col, row };
    case "S":
      return { o: "h", col, row: row + 1 };
    case "W":
      return { o: "v", col, row };
    case "E":
      return { o: "v", col: col + 1, row };
  }
}

/** All edges that carry a bay line marking, deduplicated (adjacent bays share one line). */
export function bayLineEdges(grid: TileGrid): EdgeRef[] {
  const seen = new Set<string>();
  const edges: EdgeRef[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const tile = grid.cells[cellIndex(grid, col, row)];
      if (!tile) continue;
      for (const side of bayMarkedSides(tile.type, tile.rot)) {
        const e = sideEdge(col, row, side);
        const key = `${e.o}:${e.col}:${e.row}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push(e);
        }
      }
    }
  }
  return edges;
}
