import type { Radians } from "./angles";

export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

/** Rotates a vector counter-clockwise by `angle` radians. */
export function rotate(a: Vec2, angle: Radians): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** Left-hand perpendicular (rotate +90°). */
export function perp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x };
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Unit vector in the direction of `a`; returns {0,0} for the zero vector. */
export function normalise(a: Vec2): Vec2 {
  const len = length(a);
  if (len === 0) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
}
