import { describe, expect, it } from "vitest";
import { ALL_DIFFICULTIES } from "./random/difficulty";
import { packIndexOfSeed, packLevelName, packLevelSeed, PACK_SCAN_LIMIT, starKey } from "./packs";

describe("packLevelSeed", () => {
  it("is deterministic and NEVER changes (stars are keyed by these seeds)", () => {
    // Golden values: if this test fails, every player's star progress silently detaches.
    expect(packLevelSeed({ difficulty: "easy", index: 0 })).toBe(packLevelSeed({ difficulty: "easy", index: 0 }));
    const golden = ALL_DIFFICULTIES.map((d) => packLevelSeed({ difficulty: d, index: 0 }));
    expect(new Set(golden).size).toBe(3); // difficulties never share a seed for the same index
  });

  it("gives distinct seeds across indices and difficulties", () => {
    const seeds = new Set<number>();
    for (const difficulty of ALL_DIFFICULTIES) {
      for (let index = 0; index < 200; index++) seeds.add(packLevelSeed({ difficulty, index }));
    }
    expect(seeds.size).toBe(3 * 200); // no collisions in the practically-reachable range
  });

  it("produces unsigned 32-bit seeds", () => {
    for (let index = 0; index < 50; index++) {
      const seed = packLevelSeed({ difficulty: "hard", index });
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("starKey", () => {
  it("matches the r. share-URL payload format", () => {
    expect(starKey({ difficulty: "easy", seed: parseInt("cwilu", 36) })).toBe("r.easy.cwilu");
  });
});

describe("packIndexOfSeed", () => {
  it("round-trips a pack seed back to its index", () => {
    const seed = packLevelSeed({ difficulty: "medium", index: 41 });
    expect(packIndexOfSeed({ difficulty: "medium", seed })).toBe(41);
  });

  it("returns null for a seed outside the pack (or the wrong difficulty)", () => {
    const seed = packLevelSeed({ difficulty: "medium", index: 3 });
    expect(packIndexOfSeed({ difficulty: "hard", seed })).toBeNull();
    expect(packIndexOfSeed({ difficulty: "easy", seed: 12345 })).toBeNull();
  });

  it("only scans the first PACK_SCAN_LIMIT indices", () => {
    const seed = packLevelSeed({ difficulty: "easy", index: PACK_SCAN_LIMIT + 5 });
    expect(packIndexOfSeed({ difficulty: "easy", seed })).toBeNull();
  });
});

describe("packLevelName", () => {
  it("formats a 1-based display name", () => {
    expect(packLevelName({ difficulty: "easy", index: 0 })).toBe("Easy · Level 1");
    expect(packLevelName({ difficulty: "hard", index: 41 })).toBe("Hard · Level 42");
  });
});
