import { clamp } from "../math/angles";

/** Normalised player intent, source-agnostic (keyboard/touch/scripted). Both fields in [-1, 1]. */
export interface ControlInput {
  /** +forward / 0 coast-brake / −reverse. */
  throttle: number;
  /** Target steer as a fraction of the drivable car's steerMax. */
  steer: number;
}

export interface InputSource {
  read(): ControlInput;
  /**
   * Drops any *remembered* intent — the sticky steer angle a wheel holds when the player lets go,
   * a slider left off-centre. Called when the run restarts, so the fresh rig starts with straight
   * wheels instead of inheriting the last run's lock. Momentary state (a key or pedal currently
   * held down) is left alone: it describes what the player is doing right now, not history.
   */
  reset(): void;
  dispose(): void;
}

export function clampControlInput(input: ControlInput): ControlInput {
  return {
    throttle: clamp(input.throttle, -1, 1),
    steer: clamp(input.steer, -1, 1),
  };
}
