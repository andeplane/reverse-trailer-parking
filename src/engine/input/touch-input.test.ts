import { describe, expect, it } from "vitest";
import { createTouchInput, type TouchControls } from "./touch-input";

function fakeControls(state: Partial<TouchControls> & { forward?: boolean; reverse?: boolean; steer?: number }) {
  const controls: TouchControls = {
    isForwardHeld: () => state.forward ?? false,
    isReverseHeld: () => state.reverse ?? false,
    steerValue: () => state.steer ?? 0,
  };
  return controls;
}

describe("createTouchInput", () => {
  it("returns neutral input when nothing is pressed", () => {
    const input = createTouchInput({ controls: fakeControls({}) });
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
  });

  it("maps a held forward button to +1 throttle", () => {
    const input = createTouchInput({ controls: fakeControls({ forward: true }) });
    expect(input.read().throttle).toBe(1);
  });

  it("maps a held reverse button to -1 throttle", () => {
    const input = createTouchInput({ controls: fakeControls({ reverse: true }) });
    expect(input.read().throttle).toBe(-1);
  });

  it("cancels to 0 throttle when both buttons are held", () => {
    const input = createTouchInput({ controls: fakeControls({ forward: true, reverse: true }) });
    expect(input.read().throttle).toBe(0);
  });

  it("passes the slider through as the steer target", () => {
    const input = createTouchInput({ controls: fakeControls({ steer: -0.5 }) });
    expect(input.read().steer).toBe(-0.5);
  });

  it("supports simultaneous throttle + steer (multi-touch)", () => {
    const input = createTouchInput({ controls: fakeControls({ forward: true, steer: 0.7 }) });
    expect(input.read()).toEqual({ throttle: 1, steer: 0.7 });
  });

  it("clamps an out-of-range steer value", () => {
    const input = createTouchInput({ controls: fakeControls({ steer: 5 }) });
    expect(input.read().steer).toBe(1);
  });

  it("has a no-op dispose", () => {
    const input = createTouchInput({ controls: fakeControls({}) });
    expect(() => input.dispose()).not.toThrow();
  });
});
