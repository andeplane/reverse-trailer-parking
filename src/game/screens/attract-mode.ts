import type { Renderer } from "../../engine/render/renderer";
import { PLAY_DT } from "../sandbox";
import { difficultyParams, type Difficulty } from "../level/random/difficulty";
import { generateRandomLevel } from "../level/random/generate-level";
import { replaySolutionReverse } from "../level/random/reverse-tracker";
import type { VariantCatalog, World } from "../vehicle/vehicle-types";
import { fitZoom } from "../view/camera-fit";
import { worldToEntities } from "../view/world-view";

/**
 * The menu's "AI solves a level" background demo. Generates a random level, records the
 * generator's own closed-loop verification drive (the autopilot backing the trailer out through
 * the real physics), and plays the recorded frames back in real time behind the menu. When a run
 * finishes it holds for a beat, then generates the next level. Generation is synchronous, so it
 * is always deferred a tick to keep the menu paint snappy.
 */
export interface AttractMode {
  tick(frameMs?: number): void;
  dispose(): void;
}

const GENERATE_DELAY_MS = 150;
const END_HOLD_MS = 2000;
const DEFAULT_FRAME_MS = 1000 / 60;
/** Never zoom the demo in past this, even on huge viewports. */
const MAX_DEMO_ZOOM = 1.15;

export function createAttractMode(args: {
  renderer: Renderer;
  catalog: VariantCatalog;
  /** First demo seed; each finished run advances to the next seed for variety. */
  seed: number;
  difficulty?: Difficulty;
}): AttractMode {
  const { renderer, catalog } = args;
  const difficulty = args.difficulty ?? "easy";
  let seed = args.seed >>> 0;

  let frames: World[] = [];
  let mapWidth = 0;
  let mapHeight = 0;
  let cursor = 0; // fractional index into frames (recorded at PLAY_DT)
  let heldMs = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function scheduleGenerate(): void {
    if (timer !== null || disposed) return;
    timer = setTimeout(() => {
      timer = null;
      generate();
    }, GENERATE_DELAY_MS);
  }

  function generate(): void {
    if (disposed) return;
    const thisSeed = seed;
    seed = (seed + 1) >>> 0; // next cycle (or a failed draw) moves on to a fresh level
    try {
      const { level, solution } = generateRandomLevel({ seed: thisSeed, difficulty, catalog });
      const recorded: World[] = [];
      // marginScale 2: the demo should never be cut short by the verifier's cross-track guard.
      replaySolutionReverse({
        level,
        path: solution,
        params: difficultyParams(difficulty),
        catalog,
        marginScale: 2,
        onStep: (world) => recorded.push(world),
      });
      frames = recorded;
      mapWidth = level.grid.cols * level.grid.tileSize;
      mapHeight = level.grid.rows * level.grid.tileSize;
      cursor = 0;
      heldMs = 0;
    } catch {
      scheduleGenerate(); // pathological seed — quietly try the next one
    }
  }

  scheduleGenerate();

  return {
    tick(frameMs = DEFAULT_FRAME_MS): void {
      if (disposed || frames.length === 0) return;
      const frame = frames[Math.min(frames.length - 1, Math.floor(cursor))]!;
      renderer.sync(worldToEntities(frame, catalog));
      renderer.setCamera({ x: 0, y: 0 }, Math.min(MAX_DEMO_ZOOM, fitZoom(mapWidth, mapHeight)));
      if (cursor < frames.length - 1) {
        cursor += frameMs / 1000 / PLAY_DT;
      } else {
        heldMs += frameMs;
        if (heldMs >= END_HOLD_MS) {
          heldMs = 0;
          scheduleGenerate();
        }
      }
    },
    dispose(): void {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      frames = [];
    },
  };
}
