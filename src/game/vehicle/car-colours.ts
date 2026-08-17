/**
 * Car paint. The vehicle art is authored white, so a car's colour is just a tint (0xRRGGBB) applied
 * at render time — colour and body type are chosen independently.
 *
 * **Red belongs to the player.** It is deliberately absent from `LOT_CAR_COLOURS`, so no parked car
 * can ever wear it and the car you steer is always the one red thing on the lot.
 */

/** The player's rig — the only red vehicle in the game. */
export const PLAYER_CAR_COLOUR = 0xd4342a;

/** Paint a parked car gets when a level does not say (old saves, hand-written levels). */
export const DEFAULT_CAR_COLOUR = 0xc9ced4;

/** Paints a parked car may wear. Muted, lot-plausible, and never red. */
export const LOT_CAR_COLOURS: readonly number[] = [
  0xe9edf1, // white
  0xc9ced4, // silver
  0x7d8894, // grey
  0x2f3640, // near-black
  0x2f6fb5, // blue
  0x5fa8d3, // light blue
  0x2f7d5f, // green
  0x8fb339, // lime
  0xe0a91f, // yellow
  0xe07a2f, // orange
  0x7a5aa8, // purple
  0x9c6b4f, // brown
  0x2aa3a3, // teal
  0xd98cae, // pink
];

/**
 * Paint for the nth parked car of a level that does not name one — levels authored before cars
 * carried colour, where each variant used to bring its own coloured sprite. Walking the palette
 * keeps those lots as varied as they were, with no save-format migration.
 */
export function defaultCarColour(index: number): number {
  return LOT_CAR_COLOURS[Math.abs(index) % LOT_CAR_COLOURS.length] ?? DEFAULT_CAR_COLOUR;
}

/** True for a colour a *parked* car is allowed to wear (i.e. anything but the player's red). */
export function isLotCarColour(colour: number): boolean {
  return LOT_CAR_COLOURS.includes(colour);
}

/** Picks a paint for a parked car from the injected 0..1 source (the level rng, Math.random, …). */
export function pickLotCarColour(random: () => number): number {
  const index = Math.min(LOT_CAR_COLOURS.length - 1, Math.floor(random() * LOT_CAR_COLOURS.length));
  return LOT_CAR_COLOURS[index] ?? DEFAULT_CAR_COLOUR;
}
