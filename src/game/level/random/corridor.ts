import type { Obb } from "../../../engine/math/obb";
import { obbOverlap } from "../../../engine/math/obb";
import type { Radians } from "../../../engine/math/angles";
import { cellCenter, cellIndex, type TileGrid } from "../tile-types";
import type { RecordedPath } from "./drive-in";
import { localMargin, type DifficultyParams } from "./difficulty";

/**
 * The corridor: the union of the recording's swept rig footprints, inflated by the difficulty's
 * clearance margin (tapered near the player start; the CAR additionally gets the correction
 * allowance so recoveries have forward-shunt room). Decorators must never intersect it.
 */
export interface Corridor {
  /** Margin-inflated swept OBBs, downsampled along arc length. */
  obbs: Obb[];
  /** Axis-aligned bounds per OBB (same order) — cheap prefilter for the SAT loop. */
  aabbs: { minX: number; maxX: number; minY: number; maxY: number }[];
  /** Indices of grid cells overlapped by any inflated OBB (the tile-level shadow). */
  cellShadow: ReadonlySet<number>;
}

function aabbOf(obb: Obb): { minX: number; maxX: number; minY: number; maxY: number } {
  const c = Math.abs(Math.cos(obb.rotation));
  const s = Math.abs(Math.sin(obb.rotation));
  const ex = obb.halfL * c + obb.halfW * s;
  const ey = obb.halfL * s + obb.halfW * c;
  return { minX: obb.center.x - ex, maxX: obb.center.x + ex, minY: obb.center.y - ey, maxY: obb.center.y + ey };
}

const SAMPLE_SPACING = 0.5; // metres of arc between corridor OBBs (footprints overlap heavily)

function inflate(obb: Obb, margin: number): Obb {
  return { ...obb, halfL: obb.halfL + margin, halfW: obb.halfW + margin };
}

export function buildCorridor(args: {
  path: RecordedPath;
  grid: TileGrid;
  params: DifficultyParams;
  /** Margin multiplier used by the relax-and-retry loop (default 1). */
  marginScale?: number;
}): Corridor {
  const { path, grid, params } = args;
  const marginScale = args.marginScale ?? 1;

  const obbs: Obb[] = [];
  let nextS = 0;
  for (const sample of path.samples) {
    if (sample.s < nextS) continue;
    nextS = sample.s + SAMPLE_SPACING;
    const margin =
      localMargin({ baseMargin: params.baseMargin, distFromStart: path.arcLength - sample.s }) * marginScale;
    obbs.push(inflate(sample.carObb, margin + params.carCorrectionAllowance));
    obbs.push(inflate(sample.trailerObb, margin));
  }
  // Always include the final pose (the player start) exactly.
  const last = path.samples[path.samples.length - 1];
  if (last) {
    const margin = localMargin({ baseMargin: params.baseMargin, distFromStart: 0 }) * marginScale;
    obbs.push(inflate(last.carObb, margin + params.carCorrectionAllowance));
    obbs.push(inflate(last.trailerObb, margin));
  }

  const aabbs = obbs.map(aabbOf);
  const partial: Corridor = { obbs, aabbs, cellShadow: new Set<number>() };

  const cellShadow = new Set<number>();
  const half = grid.tileSize / 2;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const cellObb: Obb = { center: cellCenter(grid, col, row), halfL: half, halfW: half, rotation: 0 as Radians };
      if (corridorIntersectsObb(partial, cellObb)) cellShadow.add(cellIndex(grid, col, row));
    }
  }
  return { obbs, aabbs, cellShadow };
}

/** True when a candidate footprint touches the (already margin-inflated) corridor. */
export function corridorIntersectsObb(corridor: Corridor, obb: Obb): boolean {
  const a = aabbOf(obb);
  for (let i = 0; i < corridor.obbs.length; i++) {
    const b = corridor.aabbs[i]!;
    if (a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY) continue;
    if (obbOverlap(corridor.obbs[i]!, obb)) return true;
  }
  return false;
}
