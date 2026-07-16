import { performanceClock } from "./engine/loop/clock";
import { createPhaserRenderer } from "./engine/render/phaser-renderer";
import { createPhaserSurface } from "./engine/render/create-phaser-surface";
import { createVariantCatalog, allCarVariants, allTrailerVariants } from "./game/vehicle/variants";
import { builtInLevels } from "./game/level/built-in-levels";
import { loadCustomLevels, mergeLevels } from "./game/level/level-store";
import { ALL_TILE_TYPES } from "./game/level/tile-types";
import { createApp } from "./game/screens/app-shell";

const WORLD_TEXTURES: Record<string, string> = {
  "car-red": "/assets/car-red.png",
  "car-blue": "/assets/car-blue.png",
  "car-green": "/assets/car-green.png",
  "car-orange": "/assets/car-orange.png",
  "car-purple": "/assets/car-purple.png",
  "trailer-white": "/assets/trailer-white.png",
  "trailer-utility": "/assets/trailer-utility.png",
  // Tile textures (tree renders grass on the ground + the tree canopy on top).
  ...Object.fromEntries(ALL_TILE_TYPES.map((t) => [`tile-${t}`, `/assets/tile-${t}.png`])),
};

async function main(): Promise<void> {
  const gameRoot = document.getElementById("game-root");
  const controlsRoot = document.getElementById("controls-root");
  if (!gameRoot || !controlsRoot) throw new Error("Missing #game-root/#controls-root in index.html");

  const surface = await createPhaserSurface({ parent: gameRoot, textures: WORLD_TEXTURES });

  const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });
  const levels = mergeLevels(builtInLevels(), loadCustomLevels(window.localStorage));

  const app = createApp({
    clock: performanceClock,
    renderer: createPhaserRenderer({ surface }),
    controlsRoot,
    catalog,
    levels,
    storage: window.localStorage,
  });
  app.showMenu();

  function frame(): void {
    app.tick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  console.error("Failed to start Reverse Trailer Parking:", error);
});
