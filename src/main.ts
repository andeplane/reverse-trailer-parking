import { performanceClock } from "./engine/loop/clock";
import { createPhaserRenderer } from "./engine/render/phaser-renderer";
import { createPhaserSurface } from "./engine/render/create-phaser-surface";
import { createVariantCatalog, allCarVariants, allTrailerVariants } from "./game/vehicle/variants";
import { createParkingLotLevel } from "./game/level/fallback-level";
import { fetchBundledLevels, loadCustomLevels, mergeLevels } from "./game/level/level-store";
import type { Level } from "./game/level/level-types";
import { createApp } from "./game/screens/app-shell";

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

async function loadLevels(): Promise<Level[]> {
  let bundled: Level[];
  try {
    bundled = await fetchBundledLevels();
  } catch (error) {
    console.warn("Falling back to the built-in level:", error);
    bundled = [createParkingLotLevel()];
  }
  const custom = loadCustomLevels(window.localStorage);
  return mergeLevels(bundled, custom);
}

async function main(): Promise<void> {
  const gameRoot = document.getElementById("game-root");
  const controlsRoot = document.getElementById("controls-root");
  if (!gameRoot || !controlsRoot) throw new Error("Missing #game-root/#controls-root in index.html");

  const surface = await createPhaserSurface({
    parent: gameRoot,
    textures: WORLD_TEXTURES,
    background: { texture: "lot-background", widthMetres: 46, heightMetres: 46 },
  });

  const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });
  const levels = await loadLevels();

  const app = createApp({
    clock: performanceClock,
    renderer: createPhaserRenderer({ surface }),
    controlsRoot,
    catalog,
    levels,
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
