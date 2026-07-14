import type { Radians } from "../../engine/math/angles";
import type { Obb } from "../../engine/math/obb";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "./variants";
import type { CarSpawn, VariantCatalog, World } from "./vehicle-types";
import { createWorld } from "./world";

const HALF_PI = (Math.PI / 2) as Radians;
const NEG_HALF_PI = (-Math.PI / 2) as Radians;

/** Rectangular boundary walls (thin OBBs) enclosing a `half`×`half` lot centred on the origin. */
function boundaryWalls(half: number): Obb[] {
  const thickness = 0.5;
  const span = half + thickness;
  return [
    { center: { x: 0, y: half }, halfL: span, halfW: thickness, rotation: 0 as Radians },
    { center: { x: 0, y: -half }, halfL: span, halfW: thickness, rotation: 0 as Radians },
    { center: { x: -half, y: 0 }, halfL: thickness, halfW: span, rotation: 0 as Radians },
    { center: { x: half, y: 0 }, halfL: thickness, halfW: span, rotation: 0 as Radians },
  ];
}

/**
 * A populated parking lot: one drivable sedan+caravan in the central lane plus rows of placed cars
 * of mixed variants (a couple towing trailers), enclosed by boundary walls. Adding vehicles is data.
 */
export function createParkingLotWorld(catalog?: VariantCatalog): World {
  const resolved = catalog ?? createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

  const topRowY = 11.5;
  const bottomRowY = -11.5;
  const cars: CarSpawn[] = [
    // Player: drivable sedan towing a caravan, in the open central lane facing right.
    {
      variantId: "sedan",
      role: "drivable",
      position: { x: -9, y: 0 },
      heading: 0 as Radians,
      trailerVariantId: "caravan",
    },
    // Top row: nose-up into the bays.
    { variantId: "suv", role: "placed", position: { x: -11, y: topRowY }, heading: HALF_PI },
    { variantId: "hatchback", role: "placed", position: { x: -3, y: topRowY }, heading: HALF_PI },
    {
      variantId: "wagon",
      role: "placed",
      position: { x: 6, y: topRowY },
      heading: HALF_PI,
      trailerVariantId: "utility",
    },
    // Bottom row: nose-down into the bays.
    { variantId: "coupe", role: "placed", position: { x: -11, y: bottomRowY }, heading: NEG_HALF_PI },
    { variantId: "wagon", role: "placed", position: { x: -3, y: bottomRowY }, heading: NEG_HALF_PI },
    { variantId: "suv", role: "placed", position: { x: 6, y: bottomRowY }, heading: NEG_HALF_PI },
  ];

  return createWorld({ cars, boundary: boundaryWalls(20), catalog: resolved });
}
