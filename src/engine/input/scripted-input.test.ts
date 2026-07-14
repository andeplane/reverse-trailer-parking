import { describe, expect, it } from "vitest";
import type { Seconds } from "../math/units";
import type { Clock } from "../loop/clock";
import { createScriptedInput, type ScriptedProgramStep } from "./scripted-input";

class FakeClock implements Clock {
  private time = 0;
  now(): number {
    return this.time;
  }
  set(t: number): void {
    this.time = t;
  }
}

const program: ScriptedProgramStep[] = [
  { duration: 1 as Seconds, input: { throttle: 1, steer: 0 } },
  { duration: 1 as Seconds, input: { throttle: 0, steer: 1 } },
  { duration: 1 as Seconds, input: { throttle: -1, steer: -1 } },
];

describe("createScriptedInput", () => {
  it("returns the first step's input at t=0", () => {
    const clock = new FakeClock();
    const input = createScriptedInput({ program, clock });
    expect(input.read()).toEqual({ throttle: 1, steer: 0 });
  });

  it("advances to the second step once its window starts", () => {
    const clock = new FakeClock();
    const input = createScriptedInput({ program, clock });
    input.read();
    clock.set(1000);
    expect(input.read()).toEqual({ throttle: 0, steer: 1 });
  });

  it("advances to the third step in its window", () => {
    const clock = new FakeClock();
    const input = createScriptedInput({ program, clock });
    input.read();
    clock.set(2500);
    expect(input.read()).toEqual({ throttle: -1, steer: -1 });
  });

  it("holds the last step's input once the program ends (no loop)", () => {
    const clock = new FakeClock();
    const input = createScriptedInput({ program, clock });
    input.read();
    clock.set(10_000);
    expect(input.read()).toEqual({ throttle: -1, steer: -1 });
  });

  it("wraps back to the first step when loop=true", () => {
    const clock = new FakeClock();
    const input = createScriptedInput({ program, clock, loop: true });
    input.read();
    clock.set(3000 + 500); // one full loop (3s) + 0.5s into the first step again
    expect(input.read()).toEqual({ throttle: 1, steer: 0 });
  });

  it("returns neutral input for an empty program", () => {
    const clock = new FakeClock();
    const input = createScriptedInput({ program: [], clock });
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
  });

  it("dispose() is a no-op that does not throw", () => {
    const clock = new FakeClock();
    const input = createScriptedInput({ program, clock });
    expect(() => input.dispose()).not.toThrow();
  });

  it("measures elapsed time from the first read(), not construction", () => {
    const clock = new FakeClock();
    clock.set(5000);
    const input = createScriptedInput({ program, clock });
    // First read() anchors t=0 at clock time 5000, so we're immediately in step 1.
    expect(input.read()).toEqual({ throttle: 1, steer: 0 });
    clock.set(6000);
    expect(input.read()).toEqual({ throttle: 0, steer: 1 });
  });
});
