import type { Seconds } from "../math/units";
import type { Clock } from "../loop/clock";
import type { ControlInput, InputSource } from "./input-source";

export interface ScriptedProgramStep {
  duration: Seconds;
  input: ControlInput;
}

/** A demo script: drive forward, steer while forward, reverse into a jackknife, then straighten. */
export const demoProgram: ScriptedProgramStep[] = [
  { duration: 3 as Seconds, input: { throttle: 1, steer: 0 } },
  { duration: 3 as Seconds, input: { throttle: 1, steer: 0.6 } },
  { duration: 4 as Seconds, input: { throttle: -1, steer: 1 } },
  { duration: 2 as Seconds, input: { throttle: 0, steer: 0 } },
];

/** Deterministic `InputSource` that plays back a fixed program, keyed off an injected `Clock`. */
export function createScriptedInput(args: {
  program: ScriptedProgramStep[];
  clock: Clock;
  loop?: boolean;
}): InputSource {
  const { program, clock, loop = false } = args;
  const totalMs = program.reduce((sum, step) => sum + step.duration * 1000, 0);
  let startTime: number | null = null;

  return {
    read(): ControlInput {
      if (program.length === 0) return { throttle: 0, steer: 0 };
      if (startTime === null) startTime = clock.now();

      let elapsedMs = clock.now() - startTime;
      if (loop && totalMs > 0) elapsedMs = elapsedMs % totalMs;

      let acc = 0;
      for (const step of program) {
        acc += step.duration * 1000;
        if (elapsedMs < acc) return step.input;
      }
      return program[program.length - 1]!.input;
    },
    dispose(): void {},
  };
}
