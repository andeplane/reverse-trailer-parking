import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import type { MPerS } from "../../engine/math/units";
import { createVariantCatalog, sedanCarVariant } from "../vehicle/variants";
import type { CarState, World } from "../vehicle/vehicle-types";
import { createParkingLotWorld } from "../vehicle/world-setup";
import { worldToEntities } from "./world-view";

const catalog = createVariantCatalog();

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

describe("worldToEntities", () => {
  it("emits a single car sprite entity for a car with no trailer", () => {
    const world: World = { cars: [carAt()], boundary: [], catalog };
    const entities = worldToEntities(world, catalog);
    expect(entities).toHaveLength(1);
    const car = entities[0]!;
    expect(car.id).toBe("car:0");
    expect(car.visual).toEqual({ kind: "sprite", texture: sedanCarVariant.texture });
    expect(car.size).toEqual({ width: sedanCarVariant.bodyWidth, length: sedanCarVariant.bodyLength });
  });

  it("emits trailer sprite + drawbar rect + car sprite when towing", () => {
    const car = carAt({ trailer: { variantId: "caravan", heading: 0.2 as Radians } });
    const world: World = { cars: [car], boundary: [], catalog };
    const ids = worldToEntities(world, catalog).map((e) => e.id);
    expect(ids).toEqual(["car:0:trailer", "car:0:drawbar", "car:0"]);
  });

  it("draws the trailer body as a sprite and the drawbar as a rect", () => {
    const car = carAt({ trailer: { variantId: "caravan", heading: 0 as Radians } });
    const world: World = { cars: [car], boundary: [], catalog };
    const entities = worldToEntities(world, catalog);
    expect(entities.find((e) => e.id === "car:0:trailer")?.visual.kind).toBe("sprite");
    expect(entities.find((e) => e.id === "car:0:drawbar")?.visual.kind).toBe("rect");
  });

  it("orients the drawbar along the segment from car hitch to trailer box front", () => {
    // In-line rig at heading 0: hitch and box front are colinear on the x-axis → drawbar rotation ≈ π.
    const car = carAt({ trailer: { variantId: "caravan", heading: 0 as Radians } });
    const world: World = { cars: [car], boundary: [], catalog };
    const drawbar = worldToEntities(world, catalog).find((e) => e.id === "car:0:drawbar")!;
    // box front is behind (−x of) the hitch, so the segment points in −x → rotation ≈ ±π.
    expect(Math.abs(Math.abs(drawbar.rotation) - Math.PI)).toBeLessThan(1e-6);
    expect(drawbar.size.length).toBeGreaterThan(0);
  });

  it("rotates the trailer sprite by the trailer's own heading, independent of car heading", () => {
    const car = carAt({ heading: 0.5 as Radians, trailer: { variantId: "caravan", heading: -0.2 as Radians } });
    const world: World = { cars: [car], boundary: [], catalog };
    const trailer = worldToEntities(world, catalog).find((e) => e.id === "car:0:trailer")!;
    expect(trailer.rotation).toBeCloseTo(-0.2);
  });

  it("rotates the car sprite by the car heading", () => {
    const world: World = { cars: [carAt({ heading: 0.9 as Radians })], boundary: [], catalog };
    expect(worldToEntities(world, catalog).find((e) => e.id === "car:0")?.rotation).toBeCloseTo(0.9);
  });

  it("orders entities trailer → drawbar → car so the car sits on top", () => {
    const car = carAt({ trailer: { variantId: "caravan", heading: 0 as Radians } });
    const world: World = { cars: [car], boundary: [], catalog };
    const ids = worldToEntities(world, catalog).map((e) => e.id);
    expect(ids.indexOf("car:0:trailer")).toBeLessThan(ids.indexOf("car:0:drawbar"));
    expect(ids.indexOf("car:0:drawbar")).toBeLessThan(ids.indexOf("car:0"));
  });

  it("handles multiple cars with stable, unique ids", () => {
    const world: World = { cars: [carAt(), carAt({ role: "placed" })], boundary: [], catalog };
    const ids = worldToEntities(world, catalog).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("car:0");
    expect(ids).toContain("car:1");
  });

  it("renders every car + trailer in the populated lot, all trailers below all car bodies", () => {
    const lot = createParkingLotWorld();
    const entities = worldToEntities(lot, lot.catalog);
    const carBodies = entities.filter((e) => /^car:\d+$/.test(e.id));
    const trailers = entities.filter((e) => /^car:\d+:trailer$/.test(e.id));
    expect(carBodies).toHaveLength(lot.cars.length);
    expect(trailers).toHaveLength(lot.cars.filter((c) => c.trailer).length);

    // z-order: the last trailer entity must come before the first car-body entity.
    const ids = entities.map((e) => e.id);
    const lastTrailerIdx = ids.map((id) => /:trailer$/.test(id)).lastIndexOf(true);
    const firstCarBodyIdx = ids.findIndex((id) => /^car:\d+$/.test(id));
    expect(lastTrailerIdx).toBeLessThan(firstCarBodyIdx);
  });
});
