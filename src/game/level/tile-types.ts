import type { Vec2 } from "../../engine/math/vec2";

/**
 * The map is a grid of square tiles. `asphalt`/`grass`/`bay` are drivable ground; `curb`/`hedge`
 * are solid (collidable); `tree` is a canopy over grass (also solid). `rot` is 0..3 quarter turns
 * (only meaningful for directional tiles like bays and curbs).
 */
export type TileType = "asphalt" | "grass" | "bay" | "curb" | "hedge" | "tree";

export interface Tile {
  type: TileType;
  rot: number; // 0..3
}

export interface TileGrid {
  tileSize: number; // metres per cell
  cols: number;
  rows: number;
  cells: Tile[]; // length cols*rows, row-major (row 0 = top)
}

export const ALL_TILE_TYPES: readonly TileType[] = ["asphalt", "grass", "bay", "curb", "hedge", "tree"];

/** Tiles that block the rig. */
export const SOLID_TILES: ReadonlySet<TileType> = new Set<TileType>(["curb", "hedge", "tree"]);

/** Tiles rendered above vehicles (canopy). */
export const CANOPY_TILES: ReadonlySet<TileType> = new Set<TileType>(["tree"]);

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

/** A grid filled uniformly with one tile type. */
export function filledGrid(cols: number, rows: number, tileSize: number, type: TileType = "asphalt"): TileGrid {
  const cells: Tile[] = Array.from({ length: cols * rows }, () => ({ type, rot: 0 }));
  return { tileSize, cols, rows, cells };
}

/** Returns a copy of the grid with one cell set (out-of-range is ignored). */
export function withTile(grid: TileGrid, col: number, row: number, tile: Tile): TileGrid {
  if (!inBounds(grid, col, row)) return grid;
  const cells = grid.cells.slice();
  cells[cellIndex(grid, col, row)] = { ...tile };
  return { ...grid, cells };
}
