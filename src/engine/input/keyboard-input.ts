import { clamp } from "../math/angles";
import { performanceClock, type Clock } from "../loop/clock";
import { clampControlInput, type ControlInput, type InputSource } from "./input-source";

/** Default rate (per second) at which the steer target ramps toward full lock / recentres. */
const DEFAULT_STEER_RATE = 3;

/**
 * Keyboard input: ↑/↓ → throttle ±1; ←/→ ramp the steer target toward ±1 while held and **hold**
 * that angle on release (like a real steering wheel — no self-centring, so intermediate angles such
 * as 22° are reachable and stay set). Steer back the other way to reduce it. `R` → onReset. The
 * vehicle model additionally slews the physical wheels, so steering feels smooth. Clamped to [-1, 1].
 */
export function createKeyboardInput(args: {
  target: EventTarget;
  clock?: Clock;
  steerRate?: number;
  onReset?: () => void;
}): InputSource {
  const { target, clock = performanceClock, steerRate = DEFAULT_STEER_RATE, onReset } = args;

  const held = new Set<string>();
  let steer = 0;
  let lastNow: number | null = null;

  function onKeyDown(event: Event): void {
    const e = event as KeyboardEvent;
    if (e.key === "r" || e.key === "R") {
      onReset?.();
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      held.add(e.key);
      e.preventDefault();
    }
  }

  function onKeyUp(event: Event): void {
    held.delete((event as KeyboardEvent).key);
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);

  return {
    read(): ControlInput {
      const now = clock.now();
      const dt = lastNow === null ? 0 : (now - lastNow) / 1000;
      lastNow = now;

      const throttle = (held.has("ArrowUp") ? 1 : 0) + (held.has("ArrowDown") ? -1 : 0);
      const steerDir = (held.has("ArrowLeft") ? 1 : 0) + (held.has("ArrowRight") ? -1 : 0);

      // Ramp toward full lock while a steer key is held; hold the angle when released.
      if (steerDir !== 0) {
        steer = clamp(steer + steerDir * steerRate * dt, -1, 1);
      }

      return clampControlInput({ throttle, steer });
    },

    dispose(): void {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
    },
  };
}
