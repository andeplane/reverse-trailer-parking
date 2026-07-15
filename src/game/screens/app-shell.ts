import type { Clock } from "../../engine/loop/clock";
import type { Renderer } from "../../engine/render/renderer";
import type { Level } from "../level/level-types";
import { saveCustomLevel, type LevelStorage } from "../level/level-store";
import type { VariantCatalog } from "../vehicle/vehicle-types";
import { createEditorScreen } from "./editor-screen";
import { createMenuScreen } from "./menu-screen";
import { createPlayScreen } from "./play-screen";
import type { Screen } from "./screen";

export interface App {
  /** Advance the active screen one frame (called by the host rAF loop). */
  tick(frameMs?: number): void;
  showMenu(): void;
  playLevel(level: Level): void;
  openEditor(): void;
  dispose(): void;
}

/**
 * The app shell: a small state machine over screens (menu / play / editor) sharing one renderer.
 * It never runs its own animation loop — the host calls `tick()` each frame — which keeps it
 * unit-testable. Switching screens disposes the previous one and clears the world render.
 */
export function createApp(args: {
  clock: Clock;
  renderer: Renderer;
  controlsRoot: HTMLElement;
  catalog: VariantCatalog;
  levels: Level[];
  isTouch?: boolean;
  /** Persistence for editor-authored levels (localStorage in the app). */
  storage?: LevelStorage;
}): App {
  const { clock, renderer, controlsRoot, catalog, isTouch, storage } = args;
  const levels = [...args.levels];
  let active: Screen | null = null;

  function upsertLevel(level: Level): void {
    const i = levels.findIndex((l) => l.id === level.id);
    if (i >= 0) levels[i] = level;
    else levels.push(level);
    if (storage) saveCustomLevel(level, storage);
  }

  function clearWorld(): void {
    renderer.sync([]);
    renderer.follow({ x: 0, y: 0 });
  }

  function swap(next: Screen): void {
    active?.dispose();
    active = next;
  }

  const app: App = {
    tick(frameMs?: number): void {
      active?.tick(frameMs);
    },
    showMenu(): void {
      clearWorld();
      swap(
        createMenuScreen({
          parent: controlsRoot,
          levels,
          onPlay: (level) => app.playLevel(level),
          onEdit: () => app.openEditor(),
        }),
      );
    },
    playLevel(level: Level): void {
      const index = levels.findIndex((l) => l.id === level.id);
      const next = index >= 0 ? levels[index + 1] : undefined;
      swap(
        createPlayScreen({
          clock,
          renderer,
          controlsRoot,
          level,
          catalog,
          onExitToMenu: () => app.showMenu(),
          ...(next ? { onNextLevel: () => app.playLevel(next) } : {}),
          ...(isTouch !== undefined ? { isTouch } : {}),
        }),
      );
    },
    openEditor(): void {
      clearWorld();
      swap(
        createEditorScreen({
          renderer,
          controlsRoot,
          catalog,
          onExitToMenu: () => app.showMenu(),
          onTest: (level) => app.playLevel(level),
          onSave: (level) => upsertLevel(level),
        }),
      );
    },
    dispose(): void {
      active?.dispose();
      active = null;
    },
  };

  return app;
}
