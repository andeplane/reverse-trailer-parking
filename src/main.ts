import { performanceClock } from "./engine/loop/clock";
import type { InputSource } from "./engine/input/input-source";
import { createKeyboardInput } from "./engine/input/keyboard-input";
import { createTouchInput } from "./engine/input/touch-input";
import { createPhaserRenderer } from "./engine/render/phaser-renderer";
import { createPhaserSurface } from "./engine/render/create-phaser-surface";
import { createControlsOverlay } from "./game/hud/controls-overlay";
import { createParkingLotWorld } from "./game/vehicle/world-setup";
import { createSandbox, type Sandbox } from "./game/sandbox";

const WORLD_TEXTURES: Record<string, string> = {
  "car-red": "/assets/car-red.png",
  "car-blue": "/assets/car-blue.png",
  "car-green": "/assets/car-green.png",
  "car-orange": "/assets/car-orange.png",
  "car-purple": "/assets/car-purple.png",
  "trailer-white": "/assets/trailer-white.png",
  "trailer-utility": "/assets/trailer-utility.png",
  "lot-background": "/assets/lot-background.png",
};

async function main(): Promise<void> {
  const gameRoot = document.getElementById("game-root");
  const controlsRoot = document.getElementById("controls-root");
  if (!gameRoot || !controlsRoot) throw new Error("Missing #game-root/#controls-root in index.html");

  const surface = await createPhaserSurface({
    parent: gameRoot,
    textures: WORLD_TEXTURES,
    background: { texture: "lot-background", widthMetres: 46, heightMetres: 46 },
  });

  const world = createParkingLotWorld();

  const steeringEl = document.createElement("div");
  steeringEl.id = "steering-indicator";
  steeringEl.style.backgroundImage = "url(/assets/steering-wheel.png)";
  controlsRoot.appendChild(steeringEl);

  // Forward reference so the reset control can reach the sandbox created just below.
  const sandboxRef: { current?: Sandbox } = {};
  const reset = (): void => sandboxRef.current?.reset();

  const forceTouch = new URLSearchParams(window.location.search).has("touch");
  const isTouch =
    forceTouch || window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

  let input: InputSource;
  if (isTouch) {
    const overlay = createControlsOverlay({ parent: controlsRoot });
    overlay.setOnReset(reset);
    input = createTouchInput({ controls: overlay });
  } else {
    input = createKeyboardInput({ target: window, onReset: reset });
  }

  const sandbox = createSandbox({
    clock: performanceClock,
    input,
    renderer: createPhaserRenderer({ surface }),
    world,
    steeringEl,
  });
  sandboxRef.current = sandbox;

  function frame(): void {
    sandbox.tick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  console.error("Failed to start Reverse Trailer Parking:", error);
});
