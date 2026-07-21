import { describe, expect, it } from "vitest";
import { starsForRun } from "./stars";

describe("starsForRun", () => {
  it("gives 3 stars at or under par when damage-free", () => {
    expect(starsForRun({ elapsedSeconds: 30, parSeconds: 60 })).toBe(3);
    expect(starsForRun({ elapsedSeconds: 60, parSeconds: 60, damage: 0 })).toBe(3);
  });

  it("caps a damaged run at 2 stars, however fast", () => {
    expect(starsForRun({ elapsedSeconds: 30, parSeconds: 60, damage: 1 })).toBe(2);
    expect(starsForRun({ elapsedSeconds: 90, parSeconds: 60, damage: 50 })).toBe(2);
    expect(starsForRun({ elapsedSeconds: 120, parSeconds: 60, damage: 50 })).toBe(1); // never raises
  });

  it("gives 2 stars at or under 1.5× par", () => {
    expect(starsForRun({ elapsedSeconds: 61, parSeconds: 60 })).toBe(2);
    expect(starsForRun({ elapsedSeconds: 90, parSeconds: 60 })).toBe(2);
  });

  it("gives 1 star for any slower finish", () => {
    expect(starsForRun({ elapsedSeconds: 91, parSeconds: 60 })).toBe(1);
    expect(starsForRun({ elapsedSeconds: 10_000, parSeconds: 60 })).toBe(1);
  });

  it("gives the single finish star when the level has no par", () => {
    expect(starsForRun({ elapsedSeconds: 5 })).toBe(1);
  });
});
