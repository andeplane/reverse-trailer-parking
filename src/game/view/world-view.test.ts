import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import type { MPerS } from "../../engine/math/units";
import { allCarVariants, allTrailerVariants, createVariantCatalog, sedanCarVariant } from "../vehicle/variants";
import type { CarState, World } from "../vehicle/vehicle-types";
import { createParkingLotLevel } from "../level/fallback-level";
import { levelToWorld } from "../level/level-to-world";
import { filledGrid } from "../level/tile-types";
import { worldToEntities } from "./world-view";

const catalog = createVariantCatalog();
const TILE_GRID = filledGrid(4, 4, 5);

function carAt(overrides: Partial<CarState> = {}): CarState {
  return {
    variantId: "sedan",
    role: "drivable",
    rearAxle: { x: 0, y: 0 },
    heading: 0 as Radians,
    speed: 0 as MPerS,
    steer: 0 as Radians,
    trailer: null,
    ...overrides,
  };
}

function world(cars: CarState[], overrides: Partial<World> = {}): World {
  return {
    cars,
    boundary: [],
    solids: [],
    grid: TILE_GRID,
    exit: null,
    bounds: { width: 20, height: 20 },
    catalog,
    ...overrides,
  };
}

describe("worldToEntities", () => {
  it("emits a car body sprite + 4 wheels for a car with no trailer", () => {
    const entities = worldToEntities(world([carAt()]), catalog);
    const body = entities.find((e) => e.id === "car:0")!;
    expect(body.visual).toEqual({ kind: "sprite", texture: sedanCarVariant.texture });
    expect(entities.filter((e) => /^car:0:wheel:/.test(e.id))).toHaveLength(4);
    expect(entities.every((e) => !e.id.includes("trailer"))).toBe(true);
  });

  it("renders the tile grid as sprites beneath the vehicles", () => {
    const entities = worldToEntities(world([carAt()]), catalog);
    const tiles = entities.filter((e) => /^tile:\d+:\d+$/.test(e.id));
    expect(tiles).toHaveLength(4 * 4);
    expect(tiles[0]?.visual).toEqual({ kind: "sprite", texture: "tile-asphalt" });
    // tiles come before the car body in the entity list (drawn under it).
    const ids = entities.map((e) => e.id);
    expect(ids.indexOf("tile:0:0")).toBeLessThan(ids.indexOf("car:0"));
  });

  it("renders wheels as rects and bodies as sprites", () => {
    const entities = worldToEntities(world([carAt()]), catalog);
    expect(entities.find((e) => e.id === "car:0")?.visual.kind).toBe("sprite");
    expect(entities.find((e) => e.id === "car:0:wheel:fl")?.visual.kind).toBe("rect");
  });

  it("emits trailer sprite + drawbar rect + trailer wheels + car sprite when towing", () => {
    const car = carAt({ trailer: { variantId: "caravan", heading: 0.2 as Radians } });
    const ids = worldToEntities(world([car]), catalog).map((e) => e.id);
    expect(ids).toContain("car:0:trailer");
    expect(ids).toContain("car:0:drawbar");
    expect(ids).toContain("car:0");
    expect(ids.filter((id) => /^car:0:trailer:wheel:/.test(id))).toHaveLength(2);
  });

  it("rotates the front wheels by heading + steer, and rear wheels by heading alone", () => {
    const entities = worldToEntities(world([carAt({ heading: 0.1 as Radians, steer: 0.3 as Radians })]), catalog);
    expect(entities.find((e) => e.id === "car:0:wheel:fl")?.rotation).toBeCloseTo(0.4);
    expect(entities.find((e) => e.id === "car:0:wheel:rl")?.rotation).toBeCloseTo(0.1);
  });

  it("renders a tree tile as grass on the ground and a canopy above the cars", () => {
    const treeGrid = filledGrid(1, 1, 5, "tree");
    const entities = worldToEntities(world([carAt()], { grid: treeGrid }), catalog);
    const ground = entities.find((e) => e.id === "tile:0:0");
    const canopy = entities.find((e) => e.id === "tile:0:0:canopy");
    expect(ground?.visual).toEqual({ kind: "sprite", texture: "tile-grass" });
    expect(canopy?.visual).toEqual({ kind: "sprite", texture: "tile-tree" });
    const ids = entities.map((e) => e.id);
    expect(ids.indexOf("car:0")).toBeLessThan(ids.indexOf("tile:0:0:canopy")); // canopy on top
  });

  it("renders boundary walls as rect entities so they are visible", () => {
    const w = world([carAt()], {
      boundary: [{ center: { x: 20, y: 0 }, halfL: 0.5, halfW: 20, rotation: 0 as Radians }],
    });
    const wall = worldToEntities(w, catalog).find((e) => e.id === "wall:0");
    expect(wall?.visual.kind).toBe("rect");
    expect(wall?.size).toEqual({ width: 40, length: 1 });
  });

  it("renders every car + trailer in the populated lot", () => {
    const lot = levelToWorld(
      createParkingLotLevel(),
      createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants }),
    );
    const entities = worldToEntities(lot, lot.catalog);
    const carBodies = entities.filter((e) => /^car:\d+$/.test(e.id));
    expect(carBodies).toHaveLength(lot.cars.length);
  });
});
