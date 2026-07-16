import { normaliseAngle, type Radians } from "../../engine/math/angles";
import type { Metres } from "../../engine/math/units";
import { add, length, midpoint, rotate, sub, type Vec2 } from "../../engine/math/vec2";
import type { Entity, RectStyle } from "../../engine/render/renderer";
import {
  carFootprint,
  hitchWorld,
  trailerFootprint,
  trailerWheelWorldPositions,
  wheelWorldPositions,
} from "../vehicle/vehicle-geometry";
import { findCarVariant, findTrailerVariant, type VariantCatalog, type World } from "../vehicle/vehicle-types";
import type { ExitLine } from "../level/level-types";
import { CANOPY_TILES, cellCenter, type TileGrid, type TileType } from "../level/tile-types";

/** Texture key for a tile type (tree renders grass on the ground + the tree canopy on top). */
function tileTexture(type: TileType): string {
  return `tile-${type === "tree" ? "grass" : type}`;
}

const EXIT_STYLE: RectStyle = {
  fillColor: 0xffd23f,
  strokeColor: 0xd9a400,
  strokeWidth: 0.08 as Metres,
  cornerRadius: 0.1 as Metres,
  fillAlpha: 0.5,
};
const EXIT_WIDTH = 0.6 as Metres;

/** Concrete barrier look for the (otherwise invisible) boundary walls. */
const BOUNDARY_STYLE: RectStyle = {
  fillColor: 0x8b8f96,
  strokeColor: 0x5a5e64,
  strokeWidth: 0.1 as Metres,
  cornerRadius: 0.1 as Metres,
};

const DRAWBAR_STYLE: RectStyle = {
  fillColor: 0x2a2d31,
  strokeColor: 0x15171a,
  strokeWidth: 0.03 as Metres,
  cornerRadius: 0.06 as Metres,
};
const DRAWBAR_WIDTH = 0.16 as Metres;

const WHEEL_SIZE = { width: 0.4 as Metres, length: 0.92 as Metres };
const WHEEL_STYLE: RectStyle = {
  fillColor: 0x141518,
  strokeColor: 0x000000,
  strokeWidth: 0.03 as Metres,
  cornerRadius: 0.18 as Metres,
};

/** Offsets a world body-centre by a body-local (forward, left) vector, given the body heading. */
function offsetLocal(center: Vec2, heading: Radians, forward: number, left: number): Vec2 {
  return add(center, rotate({ x: forward, y: left }, heading));
}

function wheelEntity(id: string, position: Vec2, rotation: Radians): Entity {
  return { id, position, rotation, size: WHEEL_SIZE, visual: { kind: "rect", style: WHEEL_STYLE } };
}

/** Ground + canopy sprite entities for the whole tile grid. */
function tileEntities(grid: TileGrid): { ground: Entity[]; canopy: Entity[] } {
  const ground: Entity[] = [];
  const canopy: Entity[] = [];
  const size = grid.tileSize as Metres;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const tile = grid.cells[row * grid.cols + col];
      if (!tile) continue;
      const center = cellCenter(grid, col, row);
      const rotation = ((tile.rot * Math.PI) / 2) as Radians;
      ground.push({
        id: `tile:${row}:${col}`,
        position: center,
        rotation: tile.type === "tree" ? (0 as Radians) : rotation,
        size: { width: size, length: size },
        visual: { kind: "sprite", texture: tileTexture(tile.type) },
      });
      if (CANOPY_TILES.has(tile.type)) {
        canopy.push({
          id: `tile:${row}:${col}:canopy`,
          position: center,
          rotation: 0 as Radians,
          size: { width: size, length: size },
          visual: { kind: "sprite", texture: "tile-tree" },
        });
      }
    }
  }
  return { ground, canopy };
}

function exitEntity(exit: ExitLine): Entity {
  const seg = sub(exit.b, exit.a);
  return {
    id: "exit",
    position: midpoint(exit.a, exit.b),
    rotation: normaliseAngle(Math.atan2(seg.y, seg.x)),
    size: { width: EXIT_WIDTH, length: Math.max(length(seg), 0.1) as Metres },
    visual: { kind: "rect", style: EXIT_STYLE },
  };
}

/**
 * World → Entity[] in ground→trailer→drawbar→car→wheels z-order. Vehicle bodies are roof-view
 * sprites; the drawbar rigidly links the car hitch to the trailer box front; wheels are drawn on
 * top so the **front wheels visibly rotate by the steer angle** while rear/trailer wheels track
 * their body heading.
 */
export function worldToEntities(world: World, catalog: VariantCatalog): Entity[] {
  const tiles = tileEntities(world.grid);
  const ground: Entity[] = [...tiles.ground]; // tiles + exit marker, below vehicles
  const trailerBodies: Entity[] = [];
  const drawbars: Entity[] = [];
  const carBodies: Entity[] = [];
  const wheels: Entity[] = [];
  const canopy: Entity[] = [...tiles.canopy]; // tree canopies, above vehicles

  world.boundary.forEach((wall, index) => {
    ground.push({
      id: `wall:${index}`,
      position: wall.center,
      rotation: wall.rotation,
      size: { width: (wall.halfW * 2) as Metres, length: (wall.halfL * 2) as Metres },
      visual: { kind: "rect", style: BOUNDARY_STYLE },
    });
  });
  if (world.exit) ground.push(exitEntity(world.exit));

  world.cars.forEach((car, index) => {
    const variant = findCarVariant(catalog, car.variantId);

    if (car.trailer) {
      const trailerVariant = findTrailerVariant(catalog, car.trailer.variantId);
      const hitch = hitchWorld(car, variant);
      const trailerBody = trailerFootprint(car.trailer, hitch, trailerVariant);
      const heading = car.trailer.heading;

      trailerBodies.push({
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
      drawbars.push({
        id: `car:${index}:drawbar`,
        position: midpoint(hitch, boxFront),
        rotation: normaliseAngle(Math.atan2(seg.y, seg.x)),
        size: { width: DRAWBAR_WIDTH, length: barLength as Metres },
        visual: { kind: "rect", style: DRAWBAR_STYLE },
      });

      const tw = trailerWheelWorldPositions(car.trailer, hitch, trailerVariant);
      wheels.push(
        wheelEntity(`car:${index}:trailer:wheel:l`, tw.l, heading),
        wheelEntity(`car:${index}:trailer:wheel:r`, tw.r, heading),
      );
    }

    const footprint = carFootprint(car, variant);
    carBodies.push({
      id: `car:${index}`,
      position: footprint.center,
      rotation: car.heading,
      size: { width: variant.bodyWidth, length: variant.bodyLength },
      visual: { kind: "sprite", texture: variant.texture },
    });

    const cw = wheelWorldPositions(car, variant);
    const frontRotation = normaliseAngle(car.heading + car.steer);
    wheels.push(
      wheelEntity(`car:${index}:wheel:fl`, cw.fl, frontRotation),
      wheelEntity(`car:${index}:wheel:fr`, cw.fr, frontRotation),
      wheelEntity(`car:${index}:wheel:rl`, cw.rl, car.heading),
      wheelEntity(`car:${index}:wheel:rr`, cw.rr, car.heading),
    );
  });

  return [...ground, ...trailerBodies, ...drawbars, ...carBodies, ...wheels, ...canopy];
}
