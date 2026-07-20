import { mulberry32, rngInt, rngPick, type Rng } from "../../../engine/math/rng";
import type { VariantCatalog } from "../../vehicle/vehicle-types";
import type { ExitLine, Level } from "../level-types";
import { boundaryWithExitGap } from "../level-to-world";
import { validateLevel } from "../level-validate";
import { filledGrid, gridHeight, gridWidth, withTile, type TileGrid } from "../tile-types";
import { difficultyParams, type Difficulty } from "./difficulty";
import { recordDriveIn, type RecordedPath } from "./drive-in";
import { buildCorridor } from "./corridor";
import { decorate } from "./decorate";
import { replaySolutionReverse } from "./reverse-tracker";

/**
 * Random level generation (specs/003-random-levels). Pure and deterministic: the same
 * {seed, difficulty} always produces the same level — including every internal retry. The level
 * is guaranteed solvable: its recorded solution has been replayed to the win condition through
 * the real physics before this function returns (ADR-003).
 */

const TILE_SIZE = 2.5;
const MAX_SEED_ATTEMPTS = 16;
const CAR_VARIANT = "sedan";
const TRAILER_VARIANT = "caravan";

export interface GeneratedLevel {
  level: Level;
  solution: RecordedPath;
  replaySeconds: number;
  /** Derived-seed attempts consumed (1 = first try; useful telemetry in tests). */
  attempts: number;
}

interface Skeleton {
  grid: TileGrid;
  exit: ExitLine;
}

/** Empty lot: asphalt with a grass border ring, an exit gap on a random edge, and a 3-tile
 * asphalt access-road opening in the ring in front of the gap. */
function buildSkeleton(args: { rng: Rng; cols: number; rows: number; exitGapWidth: number }): Skeleton {
  const { rng, cols, rows, exitGapWidth } = args;
  let grid = filledGrid(cols, rows, TILE_SIZE, "asphalt");
  for (let c = 0; c < cols; c++) {
    grid = withTile(grid, c, 0, { type: "grass", rot: 0 });
    grid = withTile(grid, c, rows - 1, { type: "grass", rot: 0 });
  }
  for (let r = 0; r < rows; r++) {
    grid = withTile(grid, 0, r, { type: "grass", rot: 0 });
    grid = withTile(grid, cols - 1, r, { type: "grass", rot: 0 });
  }

  const w = gridWidth(grid);
  const h = gridHeight(grid);
  const edge = rngPick(rng, ["N", "S", "W", "E"] as const);
  const alongCols = edge === "N" || edge === "S";
  const spanTiles = alongCols ? cols : rows;
  // Gap centre on a tile centre, >= 2 tiles + half-gap from each corner.
  const cornerKeepOut = 2 * TILE_SIZE + exitGapWidth / 2;
  const minTile = Math.max(1, Math.ceil(cornerKeepOut / TILE_SIZE - 0.5));
  const maxTile = spanTiles - 1 - minTile;
  const tileIndex = rngInt({ rng, min: minTile, max: Math.max(minTile, maxTile) });
  const centre = -((alongCols ? w : h) / 2) + (tileIndex + 0.5) * TILE_SIZE;

  // Open the ring: the 3 tiles enclosing the gap become the access road.
  for (const t of [tileIndex - 1, tileIndex, tileIndex + 1]) {
    if (edge === "N") grid = withTile(grid, t, 0, { type: "asphalt", rot: 0 });
    if (edge === "S") grid = withTile(grid, t, rows - 1, { type: "asphalt", rot: 0 });
    if (edge === "W") grid = withTile(grid, 0, t, { type: "asphalt", rot: 0 });
    if (edge === "E") grid = withTile(grid, cols - 1, t, { type: "asphalt", rot: 0 });
  }

  const half = exitGapWidth / 2;
  const exit: ExitLine =
    edge === "N"
      ? { a: { x: centre - half, y: h / 2 }, b: { x: centre + half, y: h / 2 }, outward: { x: 0, y: 1 } }
      : edge === "S"
        ? { a: { x: centre - half, y: -h / 2 }, b: { x: centre + half, y: -h / 2 }, outward: { x: 0, y: -1 } }
        : edge === "W"
          ? { a: { x: -w / 2, y: -centre - half }, b: { x: -w / 2, y: -centre + half }, outward: { x: -1, y: 0 } }
          : { a: { x: w / 2, y: -centre - half }, b: { x: w / 2, y: -centre + half }, outward: { x: 1, y: 0 } };
  return { grid, exit };
}

function roundUpTo5(seconds: number): number {
  return Math.ceil(seconds / 5) * 5;
}

function parSecondsFor(replaySeconds: number, arcLength: number): number {
  const floor = Math.max(20, arcLength / 2.4); // 2.4 = 0.6 · maxSpeedReverse
  return roundUpTo5(Math.min(180, Math.max(floor, 1.6 * replaySeconds)));
}

/** One full generation attempt from a derived seed. Null when any stage fails. */
function attemptGenerate(args: {
  derivedSeed: number;
  difficulty: Difficulty;
  catalog: VariantCatalog;
}): { level: Level; solution: RecordedPath; replaySeconds: number } | null {
  const { derivedSeed, difficulty, catalog } = args;
  const params = difficultyParams(difficulty);
  const rng = mulberry32(derivedSeed);

  const skeleton = buildSkeleton({
    rng,
    cols: params.cols,
    rows: params.rows,
    exitGapWidth: params.exitGapWidth,
  });
  const bounds = { width: gridWidth(skeleton.grid), height: gridHeight(skeleton.grid) };
  const boundary = boundaryWithExitGap(bounds, skeleton.exit);

  const path = recordDriveIn({
    exit: skeleton.exit,
    boundary,
    grid: skeleton.grid,
    catalog,
    carVariantId: CAR_VARIANT,
    trailerVariantId: TRAILER_VARIANT,
    params,
    rng,
  });
  if (!path) {
    return null;
  }

  // Relax-and-retry: a failed verification widens the corridor margin once before re-rolling.
  for (const marginScale of [1, 1.5]) {
    const corridor = buildCorridor({ path, grid: skeleton.grid, params, marginScale });
    const decorated = decorate({
      grid: skeleton.grid,
      corridor,
      path,
      exit: skeleton.exit,
      params,
      marginScale,
      catalog,
      rng,
    });
    if (!decorated) {
      continue;
    }

    const level: Level = {
      id: "pending",
      name: "pending",
      grid: decorated.grid,
      drivable: {
        variantId: CAR_VARIANT,
        position: path.finalRig.car.rearAxle,
        heading: path.finalRig.car.heading,
        trailerVariantId: TRAILER_VARIANT,
      },
      placedCars: decorated.placedCars,
      exit: skeleton.exit,
    };
    const replay = replaySolutionReverse({ level, path, params, catalog, marginScale });
    if (replay.won) return { level, solution: path, replaySeconds: replay.seconds };
  }
  return null;
}

export function generateRandomLevel(args: {
  seed: number;
  difficulty: Difficulty;
  catalog: VariantCatalog;
}): GeneratedLevel {
  const { difficulty, catalog } = args;
  const seed = args.seed >>> 0;

  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt++) {
    const derivedSeed = (seed + attempt * 0x9e3779b9) >>> 0;
    const result = attemptGenerate({ derivedSeed, difficulty, catalog });
    if (!result) continue;

    const level: Level = {
      ...result.level,
      id: `random-${difficulty}-${seed}`,
      name: `Random ${difficulty} #${seed.toString(36).toUpperCase()}`,
      parSeconds: parSecondsFor(result.replaySeconds, result.solution.arcLength),
    };
    validateLevel(level, catalog);
    return { level, solution: result.solution, replaySeconds: result.replaySeconds, attempts: attempt + 1 };
  }
  throw new Error(`generateRandomLevel: no verified level after ${MAX_SEED_ATTEMPTS} attempts (seed ${seed}, ${difficulty})`);
}
