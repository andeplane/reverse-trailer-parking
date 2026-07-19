import { clamp, type Radians } from "../../engine/math/angles";

/** How far the HUD wheel icon visually rotates at full steer lock, regardless of the car's steerMax. */
const VISUAL_FULL_LOCK_ROTATION = Math.PI / 2;

/**
 * Maps a front-wheel steer angle to a normalised visual rotation for the HUD wheel icon.
 * Positive steer is a LEFT turn (CCW in world space), but a positive CSS rotation is clockwise
 * on screen — so the visual rotation is negated to spin the wheel the way the driver turns it.
 */
export function steerToRotation(delta: Radians, steerMax: Radians): Radians {
  const fraction = clamp(delta / steerMax, -1, 1);
  return (-fraction * VISUAL_FULL_LOCK_ROTATION) as Radians;
}

/** Binds a DOM element to the steering indicator; call the returned function each frame. */
export function bindSteeringIndicator(el: HTMLElement): (rotation: Radians) => void {
  return (rotation: Radians) => {
    el.style.transform = `rotate(${rotation}rad)`;
  };
}
