import { performanceClock } from "./engine/loop/clock";
import { createPhaserRenderer } from "./engine/render/phaser-renderer";
import { createPhaserSurface } from "./engine/render/create-phaser-surface";
import { createVariantCatalog, allCarVariants, allTrailerVariants } from "./game/vehicle/variants";
import { builtInLevels } from "./game/level/built-in-levels";
import { createApp } from "./game/screens/app-shell";

// Ground/vehicle sprites. Bay lines + curbs are vector-drawn, so they need no textures
// (tree renders grass on the ground + the tree canopy on top).
const TEXTURE_NAMES = [
  "car-red",
  "car-blue",
  "car-green",
  "car-orange",
  "car-purple",
  "trailer-white",
  "trailer-utility",
  "tile-asphalt",
  "tile-grass",
  "tile-hedge",
  "tile-tree",
] as const;
const WORLD_TEXTURES: Record<string, string> = Object.fromEntries(
  TEXTURE_NAMES.map((name) => [name, `${import.meta.env.BASE_URL}assets/${name}.png`]),
);

async function main(): Promise<void> {
  const gameRoot = document.getElementById("game-root");
  const controlsRoot = document.getElementById("controls-root");
  if (!gameRoot || !controlsRoot) throw new Error("Missing #game-root/#controls-root in index.html");

  const surface = await createPhaserSurface({ parent: gameRoot, textures: WORLD_TEXTURES });

  const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

  const app = createApp({
    clock: performanceClock,
    renderer: createPhaserRenderer({ surface }),
    controlsRoot,
    catalog,
    levels: builtInLevels(), // custom (editor) levels merge on top from storage
    storage: window.localStorage,
  });
  // A shared `?level=` URL (random seed, bundled id, or full custom level) boots straight into
  // that level; otherwise start at the menu.
  const openedFromUrl = await app.openFromUrl(window.location.search).catch(() => false);
  if (!openedFromUrl) app.showMenu();

  function frame(): void {
    app.tick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  console.error("Failed to start Reverse Trailer Parking:", error);
});
