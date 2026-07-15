import type { Level } from "./level-types";

const HALF_PI = Math.PI / 2;

/** A built-in level used only if `levels.json` cannot be fetched (mirrors the bundled "lot-1"). */
export function createParkingLotLevel(): Level {
  return {
    id: "lot-1",
    name: "The Big Lot",
    size: { width: 40, height: 40 },
    drivable: { variantId: "sedan", position: { x: -9, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [
      { variantId: "suv", position: { x: -11, y: 11.5 }, heading: HALF_PI },
      { variantId: "hatchback", position: { x: -3, y: 11.5 }, heading: HALF_PI },
      { variantId: "wagon", position: { x: 6, y: 11.5 }, heading: HALF_PI, trailerVariantId: "utility" },
      { variantId: "coupe", position: { x: -11, y: -11.5 }, heading: -HALF_PI },
      { variantId: "wagon", position: { x: -3, y: -11.5 }, heading: -HALF_PI },
      { variantId: "suv", position: { x: 6, y: -11.5 }, heading: -HALF_PI },
    ],
    props: [],
    exit: { a: { x: 20, y: -3.5 }, b: { x: 20, y: 3.5 }, outward: { x: 1, y: 0 } },
    parSeconds: 90,
  };
}
