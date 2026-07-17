/** Touch controls: forward/reverse buttons, a vertical steering slider, and a reset button. */
export interface ControlsOverlay {
  readonly element: HTMLElement;
  isForwardHeld(): boolean;
  isReverseHeld(): boolean;
  /** Current steer target in [-1, 1] (slider centre = 0). */
  steerValue(): number;
  /** Registers the callback fired when the reset button is pressed. */
  setOnReset(callback: () => void): void;
  dispose(): void;
}

const HOLD_DOWN_EVENTS = ["pointerdown"] as const;
const HOLD_UP_EVENTS = ["pointerup", "pointercancel", "pointerleave"] as const;

function makeButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.style.touchAction = "none";
  return button;
}

/**
 * Builds the touch control overlay inside `parent` and returns typed accessors. Buttons track a
 * held state via pointer events; the slider drives the steer target; the reset button fires a
 * callback (mobile parity with the desktop `R` key). Gestures are suppressed so touch never
 * scrolls or zooms the page.
 */
export function createControlsOverlay(args: { parent: HTMLElement }): ControlsOverlay {
  const { parent } = args;

  const root = document.createElement("div");
  root.className = "controls-overlay";
  root.style.touchAction = "none";

  const forward = makeButton("▲", "ctrl-btn ctrl-forward");
  const reverse = makeButton("▼", "ctrl-btn ctrl-reverse");
  const reset = makeButton("⟲", "ctrl-btn ctrl-reset");

  const steer = document.createElement("input");
  steer.type = "range";
  steer.min = "0";
  steer.max = "100";
  steer.value = "50";
  steer.step = "1";
  steer.className = "ctrl-steer";
  steer.style.touchAction = "none";

  root.append(forward, reverse, reset, steer);
  parent.appendChild(root);

  let forwardHeld = false;
  let reverseHeld = false;
  let onReset: (() => void) | null = null;

  const cleanups: Array<() => void> = [];

  function bindHold(button: HTMLElement, set: (held: boolean) => void): void {
    const down = (e: Event): void => {
      e.preventDefault();
      set(true);
    };
    const up = (): void => set(false);
    for (const type of HOLD_DOWN_EVENTS) {
      button.addEventListener(type, down);
      cleanups.push(() => button.removeEventListener(type, down));
    }
    for (const type of HOLD_UP_EVENTS) {
      button.addEventListener(type, up);
      cleanups.push(() => button.removeEventListener(type, up));
    }
  }

  bindHold(forward, (held) => (forwardHeld = held));
  bindHold(reverse, (held) => (reverseHeld = held));

  const onResetDown = (e: Event): void => {
    e.preventDefault();
    onReset?.();
  };
  reset.addEventListener("pointerdown", onResetDown);
  cleanups.push(() => reset.removeEventListener("pointerdown", onResetDown));

  // Suppress default touch gestures (scroll/zoom) originating on the overlay.
  const suppress = (e: Event): void => e.preventDefault();
  root.addEventListener("touchstart", suppress, { passive: false });
  root.addEventListener("touchmove", suppress, { passive: false });
  cleanups.push(() => root.removeEventListener("touchstart", suppress));
  cleanups.push(() => root.removeEventListener("touchmove", suppress));

  return {
    element: root,
    isForwardHeld: () => forwardHeld,
    isReverseHeld: () => reverseHeld,
    steerValue: () => (Number(steer.value) - 50) / 50,
    setOnReset: (callback) => {
      onReset = callback;
    },
    dispose: () => {
      for (const cleanup of cleanups) cleanup();
      root.remove();
    },
  };
}
