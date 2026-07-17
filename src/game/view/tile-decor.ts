import type { Radians } from "../../engine/math/angles";
import type { Metres } from "../../engine/math/units";
import type { Vec2 } from "../../engine/math/vec2";
import { length, midpoint, sub } from "../../engine/math/vec2";
import type { Entity, RectStyle } from "../../engine/render/renderer";
import { bayLineEdges, curbRuns, CURB_THICKNESS, edgeSegment, type TileGrid, type TileType } from "../level/tile-types";

/**
 * Vector decorations drawn on top of the ground tiles: painted bay lines exactly on cell edges
 * (so open/closed bay parts always align) and concrete curb strips centred on curbed edges, with
 * pill-rounded ends so runs meeting at a corner join smoothly.
 */

export const BAY_LINE_WIDTH = 0.14 as Metres;
const BAY_LINE_STYLE: RectStyle = {
  fillColor: 0xe9e9e6,
  fillAlpha: 0.92,
  strokeColor: 0xe9e9e6,
  strokeWidth: 0 as Metres,
  cornerRadius: 0.05 as Metres,
};

const CURB_STYLE: RectStyle = {
  fillColor: 0xc4c8ce,
  fillAlpha: 1,
  strokeColor: 0x83878e,
  strokeWidth: 0.05 as Metres,
  cornerRadius: (CURB_THICKNESS / 2) as Metres,
};

/** Ground sprite texture for a tile type (bays are asphalt + painted lines; tree is grass + canopy). */
export function tileGroundTexture(type: TileType): string {
  if (type === "bay" || type === "bay-open") return "tile-asphalt";
  if (type === "tree") return "tile-grass";
  return `tile-${type}`;
}

/** A rect entity along the segment a→b with the given cross-axis width, extended by `extend` each end. */
function segmentEntity(id: string, a: Vec2, b: Vec2, width: Metres, extend: number, style: RectStyle): Entity {
  const seg = sub(b, a);
  return {
    id,
    position: midpoint(a, b),
    rotation: Math.atan2(seg.y, seg.x) as Radians,
    size: { width, length: (length(seg) + extend * 2) as Metres },
    visual: { kind: "rect", style },
  };
}

/** Painted bay line markings for the whole grid (deduplicated per edge). */
export function bayLineEntities(grid: TileGrid): Entity[] {
  return bayLineEdges(grid).map((e) => {
    const { a, b } = edgeSegment(grid, e);
    return segmentEntity(`bayline:${e.o}:${e.col}:${e.row}`, a, b, BAY_LINE_WIDTH, BAY_LINE_WIDTH / 2, BAY_LINE_STYLE);
  });
}

/** Concrete curb strips for every curbed-edge run (rounded ends make corners join smoothly). */
export function curbEntities(grid: TileGrid): Entity[] {
  return curbRuns(grid).map((run, i) =>
    segmentEntity(`curb:${i}`, run.a, run.b, CURB_THICKNESS as Metres, CURB_THICKNESS / 2, CURB_STYLE),
  );
}
