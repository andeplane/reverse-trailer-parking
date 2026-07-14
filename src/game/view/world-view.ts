import { normaliseAngle, type Radians } from "../../engine/math/angles";
import type { Metres } from "../../engine/math/units";
import { add, length, midpoint, rotate, sub, type Vec2 } from "../../engine/math/vec2";
import type { Entity, RectStyle } from "../../engine/render/renderer";
import { carFootprint, hitchWorld, trailerFootprint } from "../vehicle/vehicle-geometry";
import { findCarVariant, findTrailerVariant, type VariantCatalog, type World } from "../vehicle/vehicle-types";

const DRAWBAR_STYLE: RectStyle = {
  fillColor: 0x2a2d31,
  strokeColor: 0x15171a,
  strokeWidth: 0.03 as Metres,
  cornerRadius: 0.06 as Metres,
};
const DRAWBAR_WIDTH = 0.16 as Metres;

/** Offsets a world body-centre by a body-local (forward, left) vector, given the body heading. */
function offsetLocal(center: Vec2, heading: Radians, forward: number, left: number): Vec2 {
  return add(center, rotate({ x: forward, y: left }, heading));
}

/**
 * World → Entity[] in ground→trailer→drawbar→car z-order. Vehicle bodies are roof-view sprites;
 * the drawbar is a thin rect rigidly linking the car's hitch to the trailer box front.
 */
export function worldToEntities(world: World, catalog: VariantCatalog): Entity[] {
  const trailerLayer: Entity[] = [];
  const drawbarLayer: Entity[] = [];
  const carLayer: Entity[] = [];

  world.cars.forEach((car, index) => {
    const variant = findCarVariant(catalog, car.variantId);

    if (car.trailer) {
      const trailerVariant = findTrailerVariant(catalog, car.trailer.variantId);
      const hitch = hitchWorld(car, variant);
      const trailerBody = trailerFootprint(car.trailer, hitch, trailerVariant);
      const heading = car.trailer.heading;

      trailerLayer.push({
        id: `car:${index}:trailer`,
        position: trailerBody.center,
        rotation: heading,
        size: { width: trailerVariant.bodyWidth, length: trailerVariant.bodyLength },
        visual: { kind: "sprite", texture: trailerVariant.texture },
      });

      // Drawbar: rigid link from the car hitch to the trailer box front.
      const boxFront = offsetLocal(trailerBody.center, heading, trailerVariant.bodyLength / 2, 0);
      const seg = sub(boxFront, hitch);
      const barLength = Math.max(length(seg), 0.05);
      drawbarLayer.push({
        id: `car:${index}:drawbar`,
        position: midpoint(hitch, boxFront),
        rotation: normaliseAngle(Math.atan2(seg.y, seg.x)),
        size: { width: DRAWBAR_WIDTH, length: barLength as Metres },
        visual: { kind: "rect", style: DRAWBAR_STYLE },
      });
    }

    const footprint = carFootprint(car, variant);
    carLayer.push({
      id: `car:${index}`,
      position: footprint.center,
      rotation: car.heading,
      size: { width: variant.bodyWidth, length: variant.bodyLength },
      visual: { kind: "sprite", texture: variant.texture },
    });
  });

  return [...trailerLayer, ...drawbarLayer, ...carLayer];
}
