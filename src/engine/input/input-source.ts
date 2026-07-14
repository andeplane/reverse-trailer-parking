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
  dispose(): void;
}

export function clampControlInput(input: ControlInput): ControlInput {
  return {
    throttle: clamp(input.throttle, -1, 1),
    steer: clamp(input.steer, -1, 1),
  };
}
