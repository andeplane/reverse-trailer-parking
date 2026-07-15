import type { Clock } from "../../engine/loop/clock";
import type { Renderer } from "../../engine/render/renderer";
import type { Level } from "../level/level-types";
import type { VariantCatalog } from "../vehicle/vehicle-types";
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
  /** Editor factory (wired in P3); if omitted, the editor entry falls back to the menu. */
  createEditor?: (onExitToMenu: () => void) => Screen;
}): App {
  const { clock, renderer, controlsRoot, catalog, levels, isTouch, createEditor } = args;
  let active: Screen | null = null;

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
      swap(
        createPlayScreen({
          clock,
          renderer,
          controlsRoot,
          level,
          catalog,
          onExitToMenu: () => app.showMenu(),
          ...(isTouch !== undefined ? { isTouch } : {}),
        }),
      );
    },
    openEditor(): void {
      if (!createEditor) {
        app.showMenu();
        return;
      }
      clearWorld();
      swap(createEditor(() => app.showMenu()));
    },
    dispose(): void {
      active?.dispose();
      active = null;
    },
  };

  return app;
}
