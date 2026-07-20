import { describe, expect, it } from "vitest";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import { filledGrid } from "./tile-types";
import type { Level } from "./level-types";
import { generateRandomLevel } from "./random/generate-level";
import { encodeLevelRef, MAX_URL_LENGTH, parseLevelRef } from "./share-url";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function customLevel(): Level {
  return {
    id: "custom-abc",
    name: "Shared Lot",
    grid: filledGrid(8, 6, 2.5),
    drivable: { variantId: "sedan", position: { x: 3, y: 2 }, heading: 0.5, trailerVariantId: "caravan" },
    placedCars: [{ variantId: "hatchback", position: { x: 8, y: 4 }, heading: -1.2 }],
    exit: { a: { x: 20, y: -3 }, b: { x: 20, y: 3 }, outward: { x: 1, y: 0 } },
    parSeconds: 45,
  };
}

describe("share-url codec", () => {
  it("round-trips a bundled reference (id URL-encoded)", async () => {
    const value = await encodeLevelRef({ kind: "bundled", id: "reverse out/α" });
    expect(await parseLevelRef(value)).toEqual({ kind: "bundled", id: "reverse out/α" });
  });

  it("round-trips a random reference using the base-36 seed code from the level name", async () => {
    const seed = parseInt("CWILU", 36);
    const value = await encodeLevelRef({ kind: "random", difficulty: "hard", seed });
    expect(value).toBe("r.hard.cwilu");
    expect(await parseLevelRef(value)).toEqual({ kind: "random", difficulty: "hard", seed });
  });

  it("round-trips a custom level with compression (z.)", async () => {
    const value = await encodeLevelRef({ kind: "custom", level: customLevel() }, { compression: true });
    expect(value.startsWith("z.")).toBe(true);
    const parsed = await parseLevelRef(value);
    expect(parsed).toEqual({ kind: "custom", level: customLevel() });
  });

  it("round-trips a custom level without compression (j. fallback)", async () => {
    const value = await encodeLevelRef({ kind: "custom", level: customLevel() }, { compression: false });
    expect(value.startsWith("j.")).toBe(true);
    const parsed = await parseLevelRef(value);
    expect(parsed).toEqual({ kind: "custom", level: customLevel() });
  });

  it("keeps a worst-case (hard random) custom level comfortably inside the URL budget", async () => {
    const { level } = generateRandomLevel({ seed: 12345, difficulty: "hard", catalog });
    const value = await encodeLevelRef({ kind: "custom", level }, { compression: true });
    // ~100 chars of origin/path headroom on GitHub Pages.
    expect(value.length).toBeLessThan(MAX_URL_LENGTH - 100);
    expect(await parseLevelRef(value)).toEqual({ kind: "custom", level });
  });

  it.each([
    ["no separator", "garbage"],
    ["unknown prefix", "x.whatever"],
    ["empty bundled id", "b."],
    ["bad difficulty", "r.brutal.cwilu"],
    ["bad seed characters", "r.hard.not-a-seed!"],
    ["extra random segments", "r.hard.cwilu.extra"],
    ["invalid base64", "j.%%%%"],
    ["valid base64, invalid JSON", "j.bm90IGpzb24"],
    ["valid base64, not deflate data", "z.bm90IGpzb24"],
    ["JSON that is not a level", `j.${btoa('{"nope":true}').replace(/=+$/, "")}`],
  ])("returns null for malformed input: %s", async (_label, value) => {
    expect(await parseLevelRef(value)).toBeNull();
  });
});
