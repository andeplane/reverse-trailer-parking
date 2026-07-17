import type { Vec2 } from "../../engine/math/vec2";
import type { ExitLine, Level, LevelCar } from "./level-types";
import { ALL_TILE_TYPES, sideEdge, withCurb, type Tile, type TileGrid, type TileType } from "./tile-types";

class ParseError extends RangeError {}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function num(v: unknown, where: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ParseError(`${where}: expected a finite number`);
  return v;
}
function str(v: unknown, where: string): string {
  if (typeof v !== "string") throw new ParseError(`${where}: expected a string`);
  return v;
}
function vec2(v: unknown, where: string): Vec2 {
  if (!isObject(v)) throw new ParseError(`${where}: expected {x,y}`);
  return { x: num(v.x, `${where}.x`), y: num(v.y, `${where}.y`) };
}

function parseCar(v: unknown, where: string): LevelCar {
  if (!isObject(v)) throw new ParseError(`${where}: expected an object`);
  const car: LevelCar = {
    variantId: str(v.variantId, `${where}.variantId`),
    position: vec2(v.position, `${where}.position`),
    heading: num(v.heading, `${where}.heading`),
  };
  if (v.trailerVariantId !== undefined) car.trailerVariantId = str(v.trailerVariantId, `${where}.trailerVariantId`);
  return car;
}

/** Tile types from older saves that are no longer tiles (curbs are edge properties now). */
const LEGACY_CURB_TYPES: ReadonlySet<string> = new Set(["curb", "curb-corner"]);
const KNOWN_TILE_TYPES: ReadonlySet<string> = new Set<string>(ALL_TILE_TYPES);

function parseRawTile(v: unknown, where: string): { type: string; rot: number } {
  if (!isObject(v)) throw new ParseError(`${where}: expected {type,rot}`);
  const type = str(v.type, `${where}.type`);
  if (!KNOWN_TILE_TYPES.has(type) && !LEGACY_CURB_TYPES.has(type)) {
    throw new ParseError(`${where}.type: unknown tile "${type}"`);
  }
  return { type, rot: num(v.rot, `${where}.rot`) };
}

function boolArray(v: unknown, length: number): boolean[] | null {
  if (!Array.isArray(v) || v.length !== length || !v.every((b) => typeof b === "boolean")) return null;
  return v as boolean[];
}

/**
 * Legacy migration: full-tile curbs become an outline of edge curbs around each contiguous curb
 * region (edges where the neighbour is not also a legacy curb tile), and the tile itself asphalt.
 */
function migrateLegacyCurbTiles(grid: TileGrid, rawTypes: string[]): TileGrid {
  const isCurbCell = (col: number, row: number): boolean =>
    col >= 0 && col < grid.cols && row >= 0 && row < grid.rows && LEGACY_CURB_TYPES.has(rawTypes[row * grid.cols + col]!);
  let out = grid;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (!isCurbCell(col, row)) continue;
      if (!isCurbCell(col, row - 1)) out = withCurb(out, sideEdge(col, row, "N"), true);
      if (!isCurbCell(col, row + 1)) out = withCurb(out, sideEdge(col, row, "S"), true);
      if (!isCurbCell(col - 1, row)) out = withCurb(out, sideEdge(col, row, "W"), true);
      if (!isCurbCell(col + 1, row)) out = withCurb(out, sideEdge(col, row, "E"), true);
    }
  }
  return out;
}

function parseGrid(v: unknown): TileGrid {
  if (!isObject(v)) throw new ParseError("grid: expected an object");
  if (!Array.isArray(v.cells)) throw new ParseError("grid.cells: expected an array");
  const cols = num(v.cols, "grid.cols");
  const rows = num(v.rows, "grid.rows");
  const raw = v.cells.map((c, i) => parseRawTile(c, `grid.cells[${i}]`));
  const cells: Tile[] = raw.map((t) => ({
    type: (LEGACY_CURB_TYPES.has(t.type) ? "asphalt" : t.type) as TileType,
    rot: LEGACY_CURB_TYPES.has(t.type) ? 0 : t.rot,
  }));
  const grid: TileGrid = {
    tileSize: num(v.tileSize, "grid.tileSize"),
    cols,
    rows,
    cells,
    hCurbs: boolArray(v.hCurbs, (rows + 1) * cols) ?? new Array<boolean>((rows + 1) * cols).fill(false),
    vCurbs: boolArray(v.vCurbs, rows * (cols + 1)) ?? new Array<boolean>(rows * (cols + 1)).fill(false),
  };
  return migrateLegacyCurbTiles(
    grid,
    raw.map((t) => t.type),
  );
}

function parseExit(v: unknown): ExitLine {
  if (!isObject(v)) throw new ParseError("exit: expected an object");
  return { a: vec2(v.a, "exit.a"), b: vec2(v.b, "exit.b"), outward: vec2(v.outward, "exit.outward") };
}

/** Parses untrusted JSON data into a structurally-valid `Level` (semantic checks in validateLevel). */
export function parseLevel(data: unknown): Level {
  if (!isObject(data)) throw new ParseError("level: expected an object");
  if (!Array.isArray(data.placedCars)) throw new ParseError("level.placedCars: expected an array");
  const level: Level = {
    id: str(data.id, "level.id"),
    name: str(data.name, "level.name"),
    grid: parseGrid(data.grid),
    drivable: parseCar(data.drivable, "level.drivable"),
    placedCars: data.placedCars.map((c, i) => parseCar(c, `level.placedCars[${i}]`)),
    exit: parseExit(data.exit),
  };
  if (data.parSeconds !== undefined) level.parSeconds = num(data.parSeconds, "level.parSeconds");
  return level;
}

export function parseLevels(data: unknown): Level[] {
  if (!Array.isArray(data)) throw new ParseError("levels: expected an array");
  return data.map((d) => parseLevel(d));
}

export function parseLevelsJson(text: string): Level[] {
  return parseLevels(JSON.parse(text));
}

export function serializeLevel(level: Level): string {
  return JSON.stringify(level, null, 2);
}

export function serializeLevels(levels: Level[]): string {
  return JSON.stringify(levels, null, 2);
}
