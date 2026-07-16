import type { Radians } from "../../engine/math/angles";
import type { Metres } from "../../engine/math/units";
import type { Obb } from "../../engine/math/obb";
import type { Entity, RectStyle } from "../../engine/render/renderer";
import { obstacleFootprints, rigFootprints } from "../collision/collision-system";
import { drivableCar, toRig, type VariantCatalog, type World } from "../vehicle/vehicle-types";

function outlineStyle(strokeColor: number): RectStyle {
  return {
    fillColor: strokeColor,
    fillAlpha: 0,
    strokeColor,
    strokeWidth: 0.07 as Metres,
    cornerRadius: 0 as Metres,
  };
}

const RIG_COLOR = 0x39ff14; // green — the drivable rig footprints
const OBSTACLE_COLOR = 0xff3b30; // red — placed cars, trailers, boundary
const BOUNDS_COLOR = 0x33c4ff; // cyan — the playfield bounds

function obbEntity(id: string, obb: Obb, strokeColor: number): Entity {
  return {
    id,
    position: obb.center,
    rotation: obb.rotation,
    size: { width: (obb.halfW * 2) as Metres, length: (obb.halfL * 2) as Metres },
    visual: { kind: "rect", style: outlineStyle(strokeColor) },
  };
}

/**
 * Collision-geometry overlay (toggled by the `d` key): hollow OBB outlines for the drivable rig
 * (green) and every obstacle — placed cars, their trailers, and boundary walls (red). Lets you see
 * exactly how the collision footprints line up with the rendered sprites.
 */
export function worldToDebugEntities(world: World, catalog: VariantCatalog): Entity[] {
  const rig = toRig(drivableCar(world));
  const rigObbs = rigFootprints(rig, catalog).map((obb, i) => obbEntity(`debug:rig:${i}`, obb, RIG_COLOR));
  const obstacleObbs = obstacleFootprints(world).map((obb, i) =>
    obbEntity(`debug:obstacle:${i}`, obb, OBSTACLE_COLOR),
  );
  const bounds: Entity = {
    id: "debug:bounds",
    position: { x: 0, y: 0 },
    rotation: 0 as Radians,
    size: { width: world.bounds.width as Metres, length: world.bounds.height as Metres },
    visual: { kind: "rect", style: { ...outlineStyle(BOUNDS_COLOR), strokeWidth: 0.12 as Metres } },
  };
  return [bounds, ...rigObbs, ...obstacleObbs];
}
