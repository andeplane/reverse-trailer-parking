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
  it("emits a car body sprite + 4 wheels for a car with no trailer", () => {
    const world: World = { cars: [carAt()], boundary: [], catalog };
    const entities = worldToEntities(world, catalog);
    const body = entities.find((e) => e.id === "car:0")!;
    expect(body.visual).toEqual({ kind: "sprite", texture: sedanCarVariant.texture });
    expect(body.size).toEqual({ width: sedanCarVariant.bodyWidth, length: sedanCarVariant.bodyLength });
    expect(entities.filter((e) => /^car:0:wheel:/.test(e.id))).toHaveLength(4);
    expect(entities.every((e) => !e.id.includes("trailer"))).toBe(true);
  });

  it("renders wheels as rects and bodies as sprites", () => {
    const entities = worldToEntities({ cars: [carAt()], boundary: [], catalog }, catalog);
    expect(entities.find((e) => e.id === "car:0")?.visual.kind).toBe("sprite");
    expect(entities.find((e) => e.id === "car:0:wheel:fl")?.visual.kind).toBe("rect");
  });

  it("emits trailer sprite + drawbar rect + trailer wheels + car sprite when towing", () => {
    const car = carAt({ trailer: { variantId: "caravan", heading: 0.2 as Radians } });
    const ids = worldToEntities({ cars: [car], boundary: [], catalog }, catalog).map((e) => e.id);
    expect(ids).toContain("car:0:trailer");
    expect(ids).toContain("car:0:drawbar");
    expect(ids).toContain("car:0");
    expect(ids.filter((id) => /^car:0:trailer:wheel:/.test(id))).toHaveLength(2);
  });

  it("rotates the front wheels by heading + steer, and rear wheels by heading alone", () => {
    const entities = worldToEntities(
      { cars: [carAt({ heading: 0.1 as Radians, steer: 0.3 as Radians })], boundary: [], catalog },
      catalog,
    );
    expect(entities.find((e) => e.id === "car:0:wheel:fl")?.rotation).toBeCloseTo(0.4);
    expect(entities.find((e) => e.id === "car:0:wheel:fr")?.rotation).toBeCloseTo(0.4);
    expect(entities.find((e) => e.id === "car:0:wheel:rl")?.rotation).toBeCloseTo(0.1);
    expect(entities.find((e) => e.id === "car:0:wheel:rr")?.rotation).toBeCloseTo(0.1);
  });

  it("rotates the trailer sprite/wheels by the trailer's own heading, independent of car heading", () => {
    const car = carAt({ heading: 0.5 as Radians, trailer: { variantId: "caravan", heading: -0.2 as Radians } });
    const entities = worldToEntities({ cars: [car], boundary: [], catalog }, catalog);
    expect(entities.find((e) => e.id === "car:0:trailer")?.rotation).toBeCloseTo(-0.2);
    expect(entities.find((e) => e.id === "car:0:trailer:wheel:l")?.rotation).toBeCloseTo(-0.2);
  });

  it("orders entities trailer → drawbar → car body → wheels (wheels on top)", () => {
    const car = carAt({ trailer: { variantId: "caravan", heading: 0 as Radians } });
    const ids = worldToEntities({ cars: [car], boundary: [], catalog }, catalog).map((e) => e.id);
    expect(ids.indexOf("car:0:trailer")).toBeLessThan(ids.indexOf("car:0:drawbar"));
    expect(ids.indexOf("car:0:drawbar")).toBeLessThan(ids.indexOf("car:0"));
    expect(ids.indexOf("car:0")).toBeLessThan(ids.indexOf("car:0:wheel:fl"));
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

    const ids = entities.map((e) => e.id);
    const lastTrailerBodyIdx = ids.map((id) => /^car:\d+:trailer$/.test(id)).lastIndexOf(true);
    const firstCarBodyIdx = ids.findIndex((id) => /^car:\d+$/.test(id));
    expect(lastTrailerBodyIdx).toBeLessThan(firstCarBodyIdx);
  });
});
