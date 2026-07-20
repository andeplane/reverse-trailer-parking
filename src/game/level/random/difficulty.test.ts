import { describe, expect, it } from "vitest";
import {
  ALL_DIFFICULTIES,
  START_TAPER_ARC,
  START_TAPER_MARGIN,
  difficultyParams,
  isDifficulty,
  localMargin,
} from "./difficulty";

describe("isDifficulty", () => {
  it("accepts the three difficulties", () => {
    for (const d of ALL_DIFFICULTIES) expect(isDifficulty(d)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDifficulty("brutal")).toBe(false);
    expect(isDifficulty("")).toBe(false);
    expect(isDifficulty("EASY")).toBe(false);
  });
});

describe("difficultyParams", () => {
  it("gets strictly harder: tighter exits, thinner margins, more pinches", () => {
    const easy = difficultyParams("easy");
    const medium = difficultyParams("medium");
    const hard = difficultyParams("hard");
    expect(medium.exitGapWidth).toBeLessThan(easy.exitGapWidth);
    expect(hard.exitGapWidth).toBeLessThan(medium.exitGapWidth);
    expect(medium.baseMargin).toBeLessThan(easy.baseMargin);
    expect(hard.baseMargin).toBeLessThan(medium.baseMargin);
    expect(medium.requiredPinches).toBeGreaterThan(easy.requiredPinches);
    expect(hard.requiredPinches).toBeGreaterThan(medium.requiredPinches);
    expect(medium.minArcLength).toBeGreaterThan(easy.minArcLength);
    expect(hard.minArcLength).toBeGreaterThan(medium.minArcLength);
  });

  it("keeps every grid large enough for the drive-in inset", () => {
    for (const d of ALL_DIFFICULTIES) {
      const p = difficultyParams(d);
      expect(Math.min(p.cols, p.rows) * 2.5).toBeGreaterThan(2 * 6); // waypoint inset is 6 m
      expect(p.waypointsMax).toBeGreaterThanOrEqual(p.waypointsMin);
      expect(p.looseCarsMax).toBeGreaterThanOrEqual(p.looseCarsMin);
      expect(p.islandsMax).toBeGreaterThanOrEqual(p.islandsMin);
    }
  });
});

describe("localMargin", () => {
  const baseMargin = 2;

  it("is the taper floor at the player start", () => {
    expect(localMargin({ baseMargin, distFromStart: 0 })).toBe(START_TAPER_MARGIN);
  });

  it("reaches the base margin at/after the taper window", () => {
    expect(localMargin({ baseMargin, distFromStart: START_TAPER_ARC })).toBe(baseMargin);
    expect(localMargin({ baseMargin, distFromStart: 100 })).toBe(baseMargin);
  });

  it("interpolates linearly inside the window", () => {
    const mid = localMargin({ baseMargin, distFromStart: START_TAPER_ARC / 2 });
    expect(mid).toBeCloseTo((START_TAPER_MARGIN + baseMargin) / 2, 10);
  });

  it("clamps negative distances to the floor", () => {
    expect(localMargin({ baseMargin, distFromStart: -5 })).toBe(START_TAPER_MARGIN);
  });
});
