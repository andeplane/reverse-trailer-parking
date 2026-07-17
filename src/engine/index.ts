export type { Radians } from "./math/angles";
export { clamp, lerp, normaliseAngle, safeTan } from "./math/angles";
export type { Metres, MPerS, Seconds } from "./math/units";
export type { Vec2 } from "./math/vec2";
export { add, dot, length, midpoint, normalise, perp, rotate, scale, sub, vec2 } from "./math/vec2";
export type { Obb } from "./math/obb";
export { obbCorners, obbMtv, obbOverlap } from "./math/obb";

export type { Clock } from "./loop/clock";
export { performanceClock } from "./loop/clock";
export type { FixedStepLoop } from "./loop/fixed-step-loop";
export { createFixedStepLoop } from "./loop/fixed-step-loop";

export type { ControlInput, InputSource } from "./input/input-source";
export { clampControlInput } from "./input/input-source";

export type { Entity, Renderer } from "./render/renderer";
export type { PhaserSurface } from "./render/phaser-surface";
