// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Clock } from "../loop/clock";
import { createKeyboardInput } from "./keyboard-input";

class FakeClock implements Clock {
  private time = 0;
  now(): number {
    return this.time;
  }
  advance(ms: number): void {
    this.time += ms;
  }
}

function press(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key }));
}
function release(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keyup", { key }));
}

describe("createKeyboardInput", () => {
  it("maps ArrowUp to +1 throttle and ArrowDown to -1", () => {
    const target = new EventTarget();
    const clock = new FakeClock();
    const input = createKeyboardInput({ target, clock });

    press(target, "ArrowUp");
    expect(input.read().throttle).toBe(1);
    release(target, "ArrowUp");
    press(target, "ArrowDown");
    expect(input.read().throttle).toBe(-1);
  });

  it("returns zero throttle when up and down are both held", () => {
    const target = new EventTarget();
    const input = createKeyboardInput({ target, clock: new FakeClock() });
    press(target, "ArrowUp");
    press(target, "ArrowDown");
    expect(input.read().throttle).toBe(0);
  });

  it("ramps the steer target toward +1 while ArrowLeft is held", () => {
    const target = new EventTarget();
    const clock = new FakeClock();
    const input = createKeyboardInput({ target, clock, steerRate: 2 });

    input.read(); // anchor time
    press(target, "ArrowLeft");
    clock.advance(250); // 0.25s * 2 = 0.5
    expect(input.read().steer).toBeCloseTo(0.5);
    clock.advance(250);
    expect(input.read().steer).toBeCloseTo(1);
  });

  it("clamps the ramp at +1 under sustained hold", () => {
    const target = new EventTarget();
    const clock = new FakeClock();
    const input = createKeyboardInput({ target, clock, steerRate: 2 });
    input.read();
    press(target, "ArrowLeft");
    clock.advance(10_000);
    expect(input.read().steer).toBe(1);
  });

  it("ramps toward -1 for ArrowRight", () => {
    const target = new EventTarget();
    const clock = new FakeClock();
    const input = createKeyboardInput({ target, clock, steerRate: 2 });
    input.read();
    press(target, "ArrowRight");
    clock.advance(250);
    expect(input.read().steer).toBeCloseTo(-0.5);
  });

  it("recentres the steer toward 0 after the key is released", () => {
    const target = new EventTarget();
    const clock = new FakeClock();
    const input = createKeyboardInput({ target, clock, steerRate: 2 });
    input.read();
    press(target, "ArrowLeft");
    clock.advance(500);
    input.read(); // steer at 1
    release(target, "ArrowLeft");
    clock.advance(250);
    expect(input.read().steer).toBeCloseTo(0.5);
    clock.advance(500);
    expect(input.read().steer).toBe(0);
  });

  it("supports combined throttle + steer", () => {
    const target = new EventTarget();
    const clock = new FakeClock();
    const input = createKeyboardInput({ target, clock, steerRate: 2 });
    input.read();
    press(target, "ArrowUp");
    press(target, "ArrowLeft");
    clock.advance(500);
    const control = input.read();
    expect(control.throttle).toBe(1);
    expect(control.steer).toBeCloseTo(1);
  });

  it("invokes onReset when R is pressed", () => {
    const target = new EventTarget();
    let resets = 0;
    const input = createKeyboardInput({ target, clock: new FakeClock(), onReset: () => (resets += 1) });
    press(target, "r");
    press(target, "R");
    expect(resets).toBe(2);
    void input;
  });

  it("stops responding after dispose()", () => {
    const target = new EventTarget();
    const clock = new FakeClock();
    const input = createKeyboardInput({ target, clock });
    input.dispose();
    press(target, "ArrowUp");
    expect(input.read().throttle).toBe(0);
  });
});
