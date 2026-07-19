import { describe, expect, it } from "vitest";
import {
  DAMAGE_PER_SPEED_SQUARED,
  IMPACT_SPEED_DEADZONE,
  MAX_DAMAGE,
  damagePointsForImpact,
  healthFraction,
  isWrecked,
} from "./damage";

describe("damagePointsForImpact", () => {
  it("charges nothing for a parking nudge below the dead-zone", () => {
    expect(damagePointsForImpact(0)).toBe(0);
    expect(damagePointsForImpact(0.4)).toBe(0);
    expect(damagePointsForImpact(IMPACT_SPEED_DEADZONE - 1e-9)).toBe(0);
  });

  it("charges quadratically with impact speed above the dead-zone", () => {
    expect(damagePointsForImpact(2)).toBe(DAMAGE_PER_SPEED_SQUARED * 4); // 16
    expect(damagePointsForImpact(4)).toBe(DAMAGE_PER_SPEED_SQUARED * 16); // 4× the 2 m/s hit
  });

  it("treats impact speed as a magnitude (reversing hits hurt the same)", () => {
    expect(damagePointsForImpact(-2)).toBe(damagePointsForImpact(2));
    expect(damagePointsForImpact(-0.4)).toBe(0);
  });
});

describe("isWrecked", () => {
  it("is wrecked exactly at MAX_DAMAGE, not just below it", () => {
    expect(isWrecked(MAX_DAMAGE)).toBe(true);
    expect(isWrecked(99.9)).toBe(false);
    expect(isWrecked(MAX_DAMAGE + 50)).toBe(true);
    expect(isWrecked(0)).toBe(false);
  });
});

describe("healthFraction", () => {
  it("maps damage 0 → 1 and MAX_DAMAGE → 0 linearly", () => {
    expect(healthFraction(0)).toBe(1);
    expect(healthFraction(MAX_DAMAGE / 2)).toBeCloseTo(0.5);
    expect(healthFraction(MAX_DAMAGE)).toBe(0);
  });

  it("clamps at 0 when damage overshoots the pool", () => {
    expect(healthFraction(MAX_DAMAGE * 3)).toBe(0);
  });
});
