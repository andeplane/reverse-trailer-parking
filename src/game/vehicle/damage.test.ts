import { describe, expect, it } from "vitest";
import {
  CURB_DAMAGE_SCALE,
  CURB_IMPACT_SPEED_DEADZONE,
  DAMAGE_PER_SPEED_SQUARED,
  IMPACT_SPEED_DEADZONE,
  MAX_DAMAGE,
  damagePointsForImpact,
  healthFraction,
  isWrecked,
} from "./damage";

/** Hitting a solid — a car, a wall, a hedge. */
const hit = (speed: number): number => damagePointsForImpact({ speed, kind: "solid" });
const curbHit = (speed: number): number => damagePointsForImpact({ speed, kind: "curb" });

describe("damagePointsForImpact", () => {
  it("charges nothing for a parking nudge below the dead-zone", () => {
    expect(hit(0)).toBe(0);
    expect(hit(0.4)).toBe(0);
    expect(hit(IMPACT_SPEED_DEADZONE - 1e-9)).toBe(0);
  });

  it("charges quadratically with impact speed above the dead-zone", () => {
    expect(hit(2)).toBe(DAMAGE_PER_SPEED_SQUARED * 4); // 16
    expect(hit(4)).toBe(DAMAGE_PER_SPEED_SQUARED * 16); // 4× the 2 m/s hit
  });

  it("treats impact speed as a magnitude (reversing hits hurt the same)", () => {
    expect(hit(-2)).toBe(hit(2));
    expect(hit(-0.4)).toBe(0);
  });

  it("lets a kerb clip while manoeuvring go free — its dead-zone is much higher", () => {
    expect(curbHit(1.5)).toBe(0);
    expect(curbHit(CURB_IMPACT_SPEED_DEADZONE - 1e-9)).toBe(0);
    expect(hit(1.5)).toBeGreaterThan(0); // the same speed into a car is a real crash
  });

  it("charges a fraction of a real crash for a kerb hit above its dead-zone", () => {
    expect(curbHit(4)).toBeCloseTo(hit(4) * CURB_DAMAGE_SCALE);
    expect(curbHit(4)).toBeLessThan(hit(2)); // slamming a kerb still beats bumping a car
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
