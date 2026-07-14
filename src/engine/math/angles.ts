export type Radians = number & { readonly __brand: "Radians" };

const TAU = Math.PI * 2;

/** Wraps an angle into (−π, π]. */
export function normaliseAngle(angle: number): Radians {
  let wrapped = angle % TAU;
  if (wrapped <= -Math.PI) wrapped += TAU;
  if (wrapped > Math.PI) wrapped -= TAU;
  return wrapped as Radians;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** tan(x) that never returns Infinity/NaN — clamps x away from ±π/2. */
export function safeTan(angle: number): number {
  const limit = Math.PI / 2 - 1e-6;
  const clamped = clamp(angle, -limit, limit);
  return Math.tan(clamped);
}
