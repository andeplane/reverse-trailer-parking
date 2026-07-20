import { describe, expect, it } from "vitest";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../../vehicle/variants";
import { validateLevel } from "../level-validate";
import { ALL_DIFFICULTIES, difficultyParams } from "./difficulty";
import { generateRandomLevel } from "./generate-level";

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

describe("generateRandomLevel", () => {
  it("generates a valid, verified level for every difficulty", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const { level, solution, replaySeconds, attempts } = generateRandomLevel({ seed: 1, difficulty, catalog });
      expect(() => validateLevel(level, catalog)).not.toThrow();
      expect(level.id).toBe(`random-${difficulty}-1`);
      expect(solution.arcLength).toBeGreaterThanOrEqual(difficultyParams(difficulty).minArcLength);
      expect(replaySeconds).toBeGreaterThan(0);
      expect(attempts).toBeGreaterThanOrEqual(1);
      expect(level.parSeconds).toBeGreaterThanOrEqual(20);
      expect(level.parSeconds).toBeLessThanOrEqual(180);
    }
  });

  it("is deterministic: same seed + difficulty → deep-equal level", () => {
    const a = generateRandomLevel({ seed: 42, difficulty: "medium", catalog });
    const b = generateRandomLevel({ seed: 42, difficulty: "medium", catalog });
    expect(b.level).toEqual(a.level);
  });

  it("different seeds → different levels", () => {
    const a = generateRandomLevel({ seed: 7, difficulty: "easy", catalog });
    const b = generateRandomLevel({ seed: 8, difficulty: "easy", catalog });
    expect(b.level).not.toEqual(a.level);
  });
});
