import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAR_COLOUR,
  LOT_CAR_COLOURS,
  PLAYER_CAR_COLOUR,
  defaultCarColour,
  isLotCarColour,
  pickLotCarColour,
} from "./car-colours";

describe("car colours", () => {
  it("keeps red for the player — no parked car may wear it", () => {
    expect(LOT_CAR_COLOURS).not.toContain(PLAYER_CAR_COLOUR);
    expect(isLotCarColour(PLAYER_CAR_COLOUR)).toBe(false);
  });

  it("offers a spread of paints, all valid 24-bit colours", () => {
    expect(LOT_CAR_COLOURS.length).toBeGreaterThan(5);
    expect(new Set(LOT_CAR_COLOURS).size).toBe(LOT_CAR_COLOURS.length); // no duplicates
    for (const colour of LOT_CAR_COLOURS) {
      expect(Number.isInteger(colour)).toBe(true);
      expect(colour).toBeGreaterThanOrEqual(0);
      expect(colour).toBeLessThanOrEqual(0xffffff);
    }
  });

  it("picks from the palette for any value the source returns", () => {
    for (const r of [0, 0.25, 0.5, 0.999999, 1]) {
      expect(isLotCarColour(pickLotCarColour(() => r))).toBe(true);
    }
  });

  it("is deterministic for a deterministic source", () => {
    const source = (): number => 0.42;
    expect(pickLotCarColour(source)).toBe(pickLotCarColour(source));
  });

  it("spreads across the palette rather than favouring one paint", () => {
    const seen = new Set<number>();
    for (let i = 0; i < LOT_CAR_COLOURS.length; i++) {
      seen.add(pickLotCarColour(() => i / LOT_CAR_COLOURS.length));
    }
    expect(seen.size).toBe(LOT_CAR_COLOURS.length);
  });

  it("has a default paint that is itself a legal lot colour", () => {
    expect(isLotCarColour(DEFAULT_CAR_COLOUR)).toBe(true);
  });

  it("walks the palette for unpainted cars, so an old level is not a one-colour fleet", () => {
    const first = Array.from({ length: LOT_CAR_COLOURS.length }, (_, i) => defaultCarColour(i));
    expect(new Set(first).size).toBe(LOT_CAR_COLOURS.length); // every car a different paint
    expect(first.every(isLotCarColour)).toBe(true); // ...and never the player's red
    expect(defaultCarColour(LOT_CAR_COLOURS.length)).toBe(first[0]); // wraps around
    expect(defaultCarColour(0)).toBe(defaultCarColour(0)); // deterministic per index
  });
});
