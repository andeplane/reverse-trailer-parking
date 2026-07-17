import type { Radians } from "../../engine/math/angles";
import type { Level } from "./level-types";
import { createParkingLotLevel } from "./fallback-level";
import { rearAxleForBodyCentre } from "../vehicle/vehicle-geometry";
import { allCarVariants } from "../vehicle/variants";
import { cellCenter, filledGrid, sideEdge, withCurb, withTile } from "./tile-types";

const HALF_PI = Math.PI / 2;

/** A compact "reverse out of the spot" level: back the rig down through the bottom exit. */
function createReverseOutLevel(): Level {
  const cols = 12;
  const rows = 16;
  const tileSize = 2.5;
  let grid = filledGrid(cols, rows, tileSize, "asphalt");
  for (let c = 0; c < cols; c++) {
    grid = withTile(grid, c, 0, { type: "grass", rot: 0 });
  }
  for (let r = 0; r < rows; r++) {
    grid = withTile(grid, 0, r, { type: "grass", rot: 0 });
    grid = withTile(grid, cols - 1, r, { type: "grass", rot: 0 });
  }
  // Top bays (closed end row 1, entrance row 2) where the rig and flanking cars sit.
  for (let c = 3; c <= 8; c++) {
    grid = withTile(grid, c, 1, { type: "bay", rot: 0 });
    grid = withTile(grid, c, 2, { type: "bay-open", rot: 0 });
  }
  // Curbs along the inner edge of the grass verges below the bays.
  for (let r = 4; r < rows - 1; r++) {
    grid = withCurb(grid, sideEdge(1, r, "W"), true);
    grid = withCurb(grid, sideEdge(cols - 2, r, "E"), true);
  }

  const hh = (rows * tileSize) / 2;
  const bayCentreAt = (col: number) => {
    const a = cellCenter(grid, col, 1);
    const b = cellCenter(grid, col, 2);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const parked = (variantId: string, col: number) => {
    const variant = allCarVariants.find((v) => v.id === variantId);
    if (!variant) throw new RangeError(`unknown car variant "${variantId}"`);
    return {
      variantId,
      position: rearAxleForBodyCentre({ centre: bayCentreAt(col), heading: HALF_PI as Radians, variant }),
      heading: HALF_PI,
    };
  };

  const sedan = allCarVariants.find((v) => v.id === "sedan")!;
  return {
    id: "reverse-out",
    name: "Reverse Out",
    grid,
    // Parked nose-in at the middle bay; the caravan pokes out into the lot behind.
    drivable: {
      variantId: "sedan",
      position: rearAxleForBodyCentre({ centre: bayCentreAt(5), heading: HALF_PI as Radians, variant: sedan }),
      heading: HALF_PI,
      trailerVariantId: "caravan",
    },
    placedCars: [parked("suv", 4), parked("coupe", 6)],
    exit: { a: { x: -3.5, y: -hh }, b: { x: 3.5, y: -hh }, outward: { x: 0, y: -1 } },
    parSeconds: 60,
  };
}

/** The levels shipped with the game, easiest first (custom levels merge on top from localStorage). */
export function builtInLevels(): Level[] {
  return [createReverseOutLevel(), createParkingLotLevel()];
}
