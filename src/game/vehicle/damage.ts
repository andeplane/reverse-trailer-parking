/**
 * Crash-damage model for the drivable rig. Each *new* contact (an impact — contact beginning on a
 * step where the rig was previously clear) costs damage points that grow with the square of the
 * impact speed into the surface, so one hard crash or many small bumps both wreck the rig.
 * Sustained grinding after a hit charges nothing until the contact releases; gentle parking
 * nudges below the dead-zone are free.
 */

/** Total damage points the rig can absorb; reaching this loses the run. */
export const MAX_DAMAGE = 100;

/** Impacts slower than this (m/s into the surface) are parking nudges and cost nothing. */
export const IMPACT_SPEED_DEADZONE = 0.5;

/** Damage points per (m/s)² of impact speed — energy-like, so hard hits hurt superlinearly. */
export const DAMAGE_PER_SPEED_SQUARED = 4;

/**
 * What the rig hit. A kerb is a low lip the tyre rides up — the ones ringing the grass islands are
 * clipped constantly while manoeuvring — so it must not be priced like hitting a car or a wall.
 */
export type ImpactKind = "solid" | "curb";

/** Kerb clips below this (m/s) are free: you are allowed to touch a kerb while parking. */
export const CURB_IMPACT_SPEED_DEADZONE = 2;

/** Fraction of a normal impact's damage a kerb charges once it is past its dead-zone. */
export const CURB_DAMAGE_SCALE = 0.2;

/** Damage points charged for an impact at the given speed (m/s) into the given kind of surface. */
export function damagePointsForImpact(args: { speed: number; kind: ImpactKind }): number {
  const v = Math.abs(args.speed);
  const isCurb = args.kind === "curb";
  if (v < (isCurb ? CURB_IMPACT_SPEED_DEADZONE : IMPACT_SPEED_DEADZONE)) return 0;
  const points = DAMAGE_PER_SPEED_SQUARED * v * v;
  return isCurb ? points * CURB_DAMAGE_SCALE : points;
}

/** True once accumulated damage has depleted the rig's health — the run is lost. */
export function isWrecked(damage: number): boolean {
  return damage >= MAX_DAMAGE;
}

/** Remaining health as a 0..1 fraction (for HUD bars). */
export function healthFraction(damage: number): number {
  return Math.max(0, 1 - damage / MAX_DAMAGE);
}
