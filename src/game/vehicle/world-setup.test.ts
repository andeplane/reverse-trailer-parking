import { describe, expect, it } from "vitest";
import { obbMtv } from "../../engine/math/obb";
import { obstacleFootprints, rigFootprints } from "../collision/collision-system";
import { drivableCar, placedCars, toRig } from "./vehicle-types";
import { createParkingLotWorld } from "./world-setup";

describe("createParkingLotWorld", () => {
  const world = createParkingLotWorld();

  it("has exactly one drivable car", () => {
    expect(world.cars.filter((c) => c.role === "drivable")).toHaveLength(1);
  });

  it("spawns several placed cars of more than one variant", () => {
    const placed = placedCars(world);
    expect(placed.length).toBeGreaterThanOrEqual(4);
    expect(new Set(placed.map((c) => c.variantId)).size).toBeGreaterThan(1);
  });

  it("gives the drivable car a caravan trailer", () => {
    expect(drivableCar(world).trailer?.variantId).toBe("caravan");
  });

  it("includes at least one placed car towing a trailer", () => {
    expect(placedCars(world).some((c) => c.trailer !== null)).toBe(true);
  });

  it("encloses the lot with four boundary walls", () => {
    expect(world.boundary).toHaveLength(4);
  });

  it("starts with the drivable rig clear of every obstacle", () => {
    const footprints = rigFootprints(toRig(drivableCar(world)), world.catalog);
    const obstacles = obstacleFootprints(world);
    const overlaps = footprints.some((f) => obstacles.some((o) => obbMtv(f, o) !== null));
    expect(overlaps).toBe(false);
  });

  it("references only variants present in the catalog", () => {
    const carIds = new Set(world.catalog.cars.map((c) => c.id));
    const trailerIds = new Set(world.catalog.trailers.map((t) => t.id));
    for (const car of world.cars) {
      expect(carIds.has(car.variantId)).toBe(true);
      if (car.trailer) expect(trailerIds.has(car.trailer.variantId)).toBe(true);
    }
  });
});
