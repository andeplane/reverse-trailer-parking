import { clampControlInput, type ControlInput, type InputSource } from "./input-source";

/** Minimal structural view of a touch control surface (the game's overlay satisfies this). */
export interface TouchControls {
  isForwardHeld(): boolean;
  isReverseHeld(): boolean;
  steerValue(): number;
}

/**
 * Touch input: held forward/reverse buttons → throttle, steering slider → steer. Both can be active
 * at once (multi-touch drive + steer). Clamped to [-1, 1]. The controls own their DOM lifecycle,
 * so `dispose` here is a no-op.
 */
export function createTouchInput(args: { controls: TouchControls }): InputSource {
  const { controls } = args;
  return {
    read(): ControlInput {
      const throttle = (controls.isForwardHeld() ? 1 : 0) + (controls.isReverseHeld() ? -1 : 0);
      return clampControlInput({ throttle, steer: controls.steerValue() });
    },
    dispose(): void {},
  };
}
