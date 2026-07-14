import type { Radians } from "./engine/math/angles";
import { performanceClock } from "./engine/loop/clock";
import { createScriptedInput, demoProgram } from "./engine/input/scripted-input";
import { createPhaserRenderer } from "./engine/render/phaser-renderer";
import { createPhaserSurface } from "./engine/render/create-phaser-surface";
import { createVariantCatalog } from "./game/vehicle/variants";
import { createWorld } from "./game/vehicle/world";
import type { CarSpawn } from "./game/vehicle/vehicle-types";
import { createSandbox } from "./game/sandbox";

async function main(): Promise<void> {
  const gameRoot = document.getElementById("game-root");
  const controlsRoot = document.getElementById("controls-root");
  if (!gameRoot || !controlsRoot) throw new Error("Missing #game-root/#controls-root in index.html");

  const catalog = createVariantCatalog();
  const surface = await createPhaserSurface({
    parent: gameRoot,
    textures: {
      "car-red": "/assets/car-red.png",
      "trailer-white": "/assets/trailer-white.png",
      "lot-background": "/assets/lot-background.png",
    },
    background: { texture: "lot-background", widthMetres: 46, heightMetres: 46 },
  });

  const cars: CarSpawn[] = [
    {
      variantId: "sedan",
      role: "drivable",
      position: { x: 0, y: 0 },
      heading: 0 as Radians,
      trailerVariantId: "caravan",
    },
  ];
  const world = createWorld({ cars, boundary: [], catalog });

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

  const sandbox = createSandbox({
    clock: performanceClock,
    input: createScriptedInput({ program: demoProgram, clock: performanceClock, loop: true }),
    renderer: createPhaserRenderer({ surface }),
    world,
    steeringEl,
  });

  function frame(): void {
    sandbox.tick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  console.error("Failed to start Reverse Trailer Parking:", error);
});
