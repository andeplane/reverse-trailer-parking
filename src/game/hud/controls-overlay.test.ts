// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createControlsOverlay, type ControlsOverlay } from "./controls-overlay";

let parent: HTMLElement;
let overlay: ControlsOverlay;

beforeEach(() => {
  parent = document.createElement("div");
  document.body.appendChild(parent);
  overlay = createControlsOverlay({ parent });
});

afterEach(() => {
  overlay.dispose();
  parent.remove();
});

function forwardButton(): HTMLElement {
  return parent.querySelector(".ctrl-forward") as HTMLElement;
}
function reverseButton(): HTMLElement {
  return parent.querySelector(".ctrl-reverse") as HTMLElement;
}
function resetButton(): HTMLElement {
  return parent.querySelector(".ctrl-reset") as HTMLElement;
}
function slider(): HTMLInputElement {
  return parent.querySelector(".ctrl-steer") as HTMLInputElement;
}

describe("createControlsOverlay", () => {
  it("mounts the forward/reverse/reset buttons and the steering slider", () => {
    expect(forwardButton()).not.toBeNull();
    expect(reverseButton()).not.toBeNull();
    expect(resetButton()).not.toBeNull();
    expect(slider()).not.toBeNull();
  });

  it("reports forward held between pointerdown and pointerup", () => {
    expect(overlay.isForwardHeld()).toBe(false);
    forwardButton().dispatchEvent(new Event("pointerdown"));
    expect(overlay.isForwardHeld()).toBe(true);
    forwardButton().dispatchEvent(new Event("pointerup"));
    expect(overlay.isForwardHeld()).toBe(false);
  });

  it("releases the held state on pointercancel / pointerleave", () => {
    reverseButton().dispatchEvent(new Event("pointerdown"));
    expect(overlay.isReverseHeld()).toBe(true);
    reverseButton().dispatchEvent(new Event("pointerleave"));
    expect(overlay.isReverseHeld()).toBe(false);
  });

  it("tracks forward and reverse independently (multi-touch)", () => {
    forwardButton().dispatchEvent(new Event("pointerdown"));
    reverseButton().dispatchEvent(new Event("pointerdown"));
    expect(overlay.isForwardHeld()).toBe(true);
    expect(overlay.isReverseHeld()).toBe(true);
  });

  it("maps the slider to [-1, 1] with centre = 0", () => {
    expect(overlay.steerValue()).toBe(0);
    slider().value = "100";
    slider().dispatchEvent(new Event("input"));
    expect(overlay.steerValue()).toBe(1);
    slider().value = "0";
    slider().dispatchEvent(new Event("input"));
    expect(overlay.steerValue()).toBe(-1);
    slider().value = "75";
    expect(overlay.steerValue()).toBe(0.5);
  });

  it("fires the reset callback when the reset button is pressed", () => {
    let resets = 0;
    overlay.setOnReset(() => (resets += 1));
    resetButton().dispatchEvent(new Event("pointerdown"));
    expect(resets).toBe(1);
  });

  it("removes its DOM on dispose()", () => {
    expect(parent.querySelector(".controls-overlay")).not.toBeNull();
    overlay.dispose();
    expect(parent.querySelector(".controls-overlay")).toBeNull();
  });

  it("stops responding to held events after dispose()", () => {
    const btn = forwardButton();
    overlay.dispose();
    btn.dispatchEvent(new Event("pointerdown"));
    expect(overlay.isForwardHeld()).toBe(false);
  });
});
