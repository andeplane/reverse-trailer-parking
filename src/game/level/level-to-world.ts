import type { Radians } from "../../engine/math/angles";
import type { Obb } from "../../engine/math/obb";
import type { CarSpawn, VariantCatalog, World } from "../vehicle/vehicle-types";
import { createWorld } from "../vehicle/world";
import type { ExitLine, Level, LevelCar } from "./level-types";
import { cellCenter, gridHeight, gridWidth, isSolidTile, type TileGrid } from "./tile-types";

const WALL_THICKNESS = 0.5;
/** Extra clearance added on each side of the exit opening in the boundary. */
const EXIT_GAP_MARGIN = 0.4;
const ON_EDGE_TOLERANCE = 1.0;

function carSpawn(car: LevelCar, role: "drivable" | "placed"): CarSpawn {
  const spawn: CarSpawn = {
    variantId: car.variantId,
    role,
    position: car.position,
    heading: car.heading as Radians,
  };
  if (car.trailerVariantId !== undefined) spawn.trailerVariantId = car.trailerVariantId;
  return spawn;
}

/** A wall OBB along an axis-aligned edge from tangent coord `c0` to `c1`. */
function edgeWall(horizontal: boolean, at: number, c0: number, c1: number): Obb | null {
  if (c1 - c0 <= 1e-6) return null;
  const t = WALL_THICKNESS / 2;
  const mid = (c0 + c1) / 2;
  const halfSpan = (c1 - c0) / 2;
  return horizontal
    ? { center: { x: mid, y: at }, halfL: halfSpan, halfW: t, rotation: 0 as Radians }
    : { center: { x: at, y: mid }, halfL: t, halfW: halfSpan, rotation: 0 as Radians };
}

/**
 * Encloses the playfield with boundary walls, punching an opening on whichever edge the exit lies
 * on so the rig can actually reverse out through it.
 */
export function boundaryWithExitGap(size: { width: number; height: number }, exit: ExitLine | null): Obb[] {
  const hw = size.width / 2;
  const hh = size.height / 2;
  const edges = [
    { horizontal: true, at: hh, min: -hw, max: hw, perp: "y" as const, tan: "x" as const },
    { horizontal: true, at: -hh, min: -hw, max: hw, perp: "y" as const, tan: "x" as const },
    { horizontal: false, at: -hw, min: -hh, max: hh, perp: "x" as const, tan: "y" as const },
    { horizontal: false, at: hw, min: -hh, max: hh, perp: "x" as const, tan: "y" as const },
  ];

  const walls: Obb[] = [];
  for (const e of edges) {
    const onEdge =
      exit !== null &&
      Math.abs(exit.a[e.perp] - e.at) < ON_EDGE_TOLERANCE &&
      Math.abs(exit.b[e.perp] - e.at) < ON_EDGE_TOLERANCE;
    if (onEdge && exit) {
      const g0 = Math.min(exit.a[e.tan], exit.b[e.tan]) - EXIT_GAP_MARGIN;
      const g1 = Math.max(exit.a[e.tan], exit.b[e.tan]) + EXIT_GAP_MARGIN;
      const left = edgeWall(e.horizontal, e.at, e.min, Math.max(e.min, g0));
      const right = edgeWall(e.horizontal, e.at, Math.min(e.max, g1), e.max);
      if (left) walls.push(left);
      if (right) walls.push(right);
    } else {
      const wall = edgeWall(e.horizontal, e.at, e.min, e.max);
      if (wall) walls.push(wall);
    }
  }
  return walls;
}

/** Collidable footprints of solid tiles (curb, hedge, tree). */
export function solidTileFootprints(grid: TileGrid): Obb[] {
  const obbs: Obb[] = [];
  const half = grid.tileSize / 2;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const tile = grid.cells[row * grid.cols + col];
      if (tile && isSolidTile(tile.type)) {
        obbs.push({ center: cellCenter(grid, col, row), halfL: half, halfW: half, rotation: 0 as Radians });
      }
    }
  }
  return obbs;
}

/** Builds the runtime `World` from an authored `Level`. Pure; deterministic. */
export function levelToWorld(level: Level, catalog: VariantCatalog): World {
  const cars: CarSpawn[] = [
    carSpawn(level.drivable, "drivable"),
    ...level.placedCars.map((c) => carSpawn(c, "placed")),
  ];
  const bounds = { width: gridWidth(level.grid), height: gridHeight(level.grid) };
  return createWorld({
    cars,
    boundary: boundaryWithExitGap(bounds, level.exit),
    solids: solidTileFootprints(level.grid),
    grid: level.grid,
    exit: level.exit,
    bounds,
    catalog,
  });
}
