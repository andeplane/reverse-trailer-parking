import { describe, expect, it } from "vitest";
import type { Seconds } from "../math/units";
import type { Clock } from "./clock";
import { createFixedStepLoop } from "./fixed-step-loop";

class FakeClock implements Clock {
  private time = 0;
  now(): number {
    return this.time;
  }
  set(t: number): void {
    this.time = t;
  }
}

describe("createFixedStepLoop", () => {
  it("produces zero steps for a zero-length frame", () => {
    const clock = new FakeClock();
    const loop = createFixedStepLoop({ dt: 0.1 as Seconds, clock });
    expect(loop.advance(0)).toEqual({ steps: 0, alpha: 0 });
  });

  it("produces exactly one step when frame time equals dt", () => {
    const clock = new FakeClock();
    const loop = createFixedStepLoop({ dt: 0.1 as Seconds, clock });
    expect(loop.advance(100)).toEqual({ steps: 1, alpha: 0 });
  });

  it("accumulates partial frames across calls into a whole step + alpha", () => {
    const clock = new FakeClock();
    const loop = createFixedStepLoop({ dt: 0.1 as Seconds, clock });
    expect(loop.advance(60)).toEqual({ steps: 0, alpha: 0.6 });
    const second = loop.advance(60);
    expect(second.steps).toBe(1);
    expect(second.alpha).toBeCloseTo(0.2);
  });

  it("produces many steps for a long frame", () => {
    const clock = new FakeClock();
    const loop = createFixedStepLoop({ dt: 0.1 as Seconds, clock });
    const result = loop.advance(550);
    expect(result.steps).toBe(5);
    expect(result.alpha).toBeCloseTo(0.5);
  });

  it("caps catch-up so a huge stall does not spiral", () => {
    const clock = new FakeClock();
    const loop = createFixedStepLoop({ dt: 0.1 as Seconds, clock, maxCatchUp: 3 });
    const result = loop.advance(10_000);
    expect(result.steps).toBe(3);
  });

  it("derives elapsed time from the injected clock when frameMs is omitted", () => {
    const clock = new FakeClock();
    const loop = createFixedStepLoop({ dt: 0.1 as Seconds, clock });
    expect(loop.advance()).toEqual({ steps: 0, alpha: 0 });
    clock.set(250);
    const result = loop.advance();
    expect(result.steps).toBe(2);
    expect(result.alpha).toBeCloseTo(0.5);
  });
});
