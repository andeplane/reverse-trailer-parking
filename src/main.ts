import { performanceClock } from "./engine/loop/clock";
import { createKeyboardInput } from "./engine/input/keyboard-input";
import { createPhaserRenderer } from "./engine/render/phaser-renderer";
import { createPhaserSurface } from "./engine/render/create-phaser-surface";
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
  Object.assign(steeringEl.style, {
    position: "absolute",
    bottom: "16px",
    left: "16px",
    width: "72px",
    height: "72px",
    backgroundImage: "url(/assets/steering-wheel.png)",
    backgroundSize: "contain",
    backgroundRepeat: "no-repeat",
    transformOrigin: "center",
    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))",
  });
  controlsRoot.appendChild(steeringEl);

  // Forward reference so the reset key can reach the sandbox created just below.
  const sandboxRef: { current?: Sandbox } = {};
  const input = createKeyboardInput({
    target: window,
    onReset: () => sandboxRef.current?.reset(),
  });

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
