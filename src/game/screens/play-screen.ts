import type { Clock } from "../../engine/loop/clock";
import type { InputSource } from "../../engine/input/input-source";
import { createKeyboardInput } from "../../engine/input/keyboard-input";
import { createTouchInput } from "../../engine/input/touch-input";
import type { Renderer } from "../../engine/render/renderer";
import { createControlsOverlay } from "../hud/controls-overlay";
import { createWinOverlay, type WinOverlay } from "../hud/win-overlay";
import type { Level } from "../level/level-types";
import { levelToWorld } from "../level/level-to-world";
import { applyDebugState, debugStateOf, encodeDebugState, parseDebugState } from "../level/debug-state";
import { hasRigCrossedExit } from "../level/win";
import { rigFootprints } from "../collision/collision-system";
import { createSandbox, type Sandbox } from "../sandbox";
import { drivableCar, toRig, type VariantCatalog } from "../vehicle/vehicle-types";
import type { Screen } from "./screen";

function makeSteeringIndicator(parent: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.id = "steering-indicator";
  el.style.backgroundImage = `url(${import.meta.env.BASE_URL}assets/steering-wheel.png)`;
  parent.appendChild(el);
  return el;
}

/**
 * The play screen: drives one level. Builds the world from the level, wires input (touch or
 * keyboard), the steering HUD, a back-to-menu button, and the collision debug toggle, and advances
 * the sandbox each frame.
 */
export function createPlayScreen(args: {
  clock: Clock;
  renderer: Renderer;
  controlsRoot: HTMLElement;
  level: Level;
  catalog: VariantCatalog;
  onExitToMenu: () => void;
  onNextLevel?: () => void;
  /** True when this is the last level in the list (win overlay celebrates finishing everything). */
  isLastLevel?: boolean;
  isTouch?: boolean;
}): Screen {
  const { clock, renderer, controlsRoot, level, catalog, onExitToMenu, onNextLevel, isLastLevel } = args;
  const isTouch =
    args.isTouch ?? (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);

  let world = levelToWorld(level, catalog);
  // Reproduce an exact scenario from a pasted debug URL (?dbg=<levelId>&x=..&y=..&h=..).
  const urlState = parseDebugState(window.location.search);
  if (urlState && urlState.levelId === level.id) world = applyDebugState(world, urlState);
  const steeringEl = makeSteeringIndicator(controlsRoot);

  const sandboxRef: { current?: Sandbox } = {};
  const reset = (): void => sandboxRef.current?.reset();

  const disposers: Array<() => void> = [];
  let input: InputSource;
  if (isTouch) {
    const overlay = createControlsOverlay({ parent: controlsRoot });
    overlay.setOnReset(reset);
    input = createTouchInput({ controls: overlay });
    disposers.push(() => overlay.dispose());
  } else {
    input = createKeyboardInput({ target: window, onReset: reset });
  }

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "play-back-button";
  backButton.textContent = "☰ Menu";
  backButton.addEventListener("click", onExitToMenu);
  controlsRoot.appendChild(backButton);

  const sandbox = createSandbox({ clock, input, renderer, world, steeringEl });
  sandboxRef.current = sandbox;

  // When debug is on, keep the URL in sync with the rig's exact state so it can be copied and
  // pasted back to reproduce the scenario.
  function writeDebugUrl(): void {
    history.replaceState(null, "", encodeDebugState(debugStateOf(sandbox.getWorld(), level.id)));
  }
  function clearDebugUrl(): void {
    history.replaceState(null, "", window.location.pathname);
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "d" || e.key === "D") {
      const on = !sandbox.isDebug();
      sandbox.setDebug(on);
      if (on) writeDebugUrl();
      else clearDebugUrl();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  let framesSinceUrlWrite = 0;

  let winOverlay: WinOverlay | null = null;

  function checkWin(): void {
    const world = sandbox.getWorld();
    if (!world.exit) return;
    const footprints = rigFootprints(toRig(drivableCar(world)), catalog);
    if (!hasRigCrossedExit(footprints, world.exit)) return;
    winOverlay = createWinOverlay({
      parent: controlsRoot,
      levelName: level.name,
      isLastLevel: isLastLevel ?? false,
      ...(onNextLevel ? { onNext: onNextLevel } : {}),
      onRetry: () => {
        winOverlay?.dispose();
        winOverlay = null;
        sandbox.reset();
      },
      onMenu: onExitToMenu,
    });
  }

  return {
    tick(frameMs?: number): void {
      if (winOverlay) return; // frozen after winning until Retry/Next/Menu
      sandbox.tick(frameMs);
      if (sandbox.isDebug() && ++framesSinceUrlWrite >= 20) {
        framesSinceUrlWrite = 0;
        writeDebugUrl();
      }
      checkWin();
    },
    dispose(): void {
      window.removeEventListener("keydown", onKeyDown);
      if (sandbox.isDebug()) clearDebugUrl();
      winOverlay?.dispose();
      for (const d of disposers) d();
      backButton.remove();
      steeringEl.remove();
      sandbox.dispose();
    },
  };
}
