import type { Seconds } from "../math/units";
import type { Clock } from "./clock";

export interface FixedStepLoop {
  /** Advances by an explicit frame duration (ms) if given, otherwise measures elapsed time via the clock. */
  advance(frameMs?: number): { steps: number; alpha: number };
}

export function createFixedStepLoop(args: { dt: Seconds; clock: Clock; maxCatchUp?: number }): FixedStepLoop {
  const { dt, clock, maxCatchUp = 10 } = args;
  const dtMs = dt * 1000;
  const maxAccumulatorMs = dtMs * maxCatchUp;

  let accumulatorMs = 0;
  let lastNow: number | null = null;

  return {
    advance(frameMs) {
      const now = clock.now();
      const elapsed = frameMs ?? (lastNow === null ? 0 : now - lastNow);
      lastNow = now;

      accumulatorMs = Math.min(accumulatorMs + elapsed, maxAccumulatorMs);

      const steps = Math.floor(accumulatorMs / dtMs);
      accumulatorMs -= steps * dtMs;

      return { steps, alpha: accumulatorMs / dtMs };
    },
  };
}
