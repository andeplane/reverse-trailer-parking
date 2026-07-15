import type { Clock } from "../../engine/loop/clock";
import type { InputSource } from "../../engine/input/input-source";
import { createKeyboardInput } from "../../engine/input/keyboard-input";
import { createTouchInput } from "../../engine/input/touch-input";
import type { Renderer } from "../../engine/render/renderer";
import { createControlsOverlay } from "../hud/controls-overlay";
import { createWinOverlay, type WinOverlay } from "../hud/win-overlay";
import type { Level } from "../level/level-types";
import { levelToWorld } from "../level/level-to-world";
import { hasRigCrossedExit } from "../level/win";
import { rigFootprints } from "../collision/collision-system";
import { createSandbox, type Sandbox } from "../sandbox";
import { drivableCar, toRig, type VariantCatalog } from "../vehicle/vehicle-types";
import type { Screen } from "./screen";

function makeSteeringIndicator(parent: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.id = "steering-indicator";
  el.style.backgroundImage = "url(/assets/steering-wheel.png)";
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
  isTouch?: boolean;
}): Screen {
  const { clock, renderer, controlsRoot, level, catalog, onExitToMenu, onNextLevel } = args;
  const isTouch =
    args.isTouch ?? (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);

  const world = levelToWorld(level, catalog);
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

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "d" || e.key === "D") sandbox.setDebug(!sandbox.isDebug());
  };
  window.addEventListener("keydown", onKeyDown);

  let winOverlay: WinOverlay | null = null;

  function checkWin(): void {
    const world = sandbox.getWorld();
    if (!world.exit) return;
    const footprints = rigFootprints(toRig(drivableCar(world)), catalog);
    if (!hasRigCrossedExit(footprints, world.exit)) return;
    winOverlay = createWinOverlay({
      parent: controlsRoot,
      levelName: level.name,
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
      checkWin();
    },
    dispose(): void {
      window.removeEventListener("keydown", onKeyDown);
      winOverlay?.dispose();
      for (const d of disposers) d();
      backButton.remove();
      steeringEl.remove();
      sandbox.dispose();
    },
  };
}
