import type { Clock } from "../../engine/loop/clock";
import type { Renderer } from "../../engine/render/renderer";
import { emptyLevel } from "../level/editor-model";
import type { Level } from "../level/level-types";
import { deleteCustomLevel, loadCustomLevels, mergeLevels, saveCustomLevel, type LevelStorage } from "../level/level-store";
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
  /** Open the editor: with a level to edit it, without to start a new draft. */
  openEditor(initial?: Level): void;
  dispose(): void;
}

/**
 * The app shell: a small state machine over screens (menu / play / editor) sharing one renderer.
 * It never runs its own animation loop — the host calls `tick()` each frame — which keeps it
 * unit-testable. Switching screens disposes the previous one and clears the world render.
 * `levels` are the bundled levels; custom (editor-authored) levels merge on top from storage and
 * can be edited/deleted from the menu. Testing an editor draft returns to the editor, not the menu.
 */
export function createApp(args: {
  clock: Clock;
  renderer: Renderer;
  controlsRoot: HTMLElement;
  catalog: VariantCatalog;
  /** Bundled (built-in) levels; custom levels from storage merge on top by id. */
  levels: Level[];
  isTouch?: boolean;
  /** Persistence for editor-authored levels (localStorage in the app). */
  storage?: LevelStorage;
}): App {
  const { clock, renderer, controlsRoot, catalog, isTouch, storage } = args;
  const bundled = [...args.levels];
  let active: Screen | null = null;

  function customLevels(): Level[] {
    return storage ? loadCustomLevels(storage) : [];
  }
  function allLevels(): Level[] {
    return mergeLevels(bundled, customLevels());
  }

  function saveLevel(level: Level): void {
    if (storage) saveCustomLevel(level, storage);
  }

  /** "New level", "New level 2", … — never two identical default names in the menu. */
  function uniqueDraftName(): string {
    const names = new Set(allLevels().map((l) => l.name));
    if (!names.has("New level")) return "New level";
    let n = 2;
    while (names.has(`New level ${n}`)) n++;
    return `New level ${n}`;
  }
  function newDraft(): Level {
    return { ...emptyLevel(`custom-${Date.now().toString(36)}`), name: uniqueDraftName() };
  }
  function deleteLevel(level: Level): void {
    if (storage) deleteCustomLevel(level.id, storage);
    app.showMenu(); // re-list (a deleted override reveals its bundled original again)
  }

  function clearWorld(): void {
    renderer.sync([]);
    renderer.follow({ x: 0, y: 0 });
  }

  function swap(next: Screen): void {
    active?.dispose();
    active = next;
  }

  /** Play an editor draft; leaving the run returns to the editor with the draft AND its
   * unsaved-changes baseline intact (so exiting afterwards still prompts to save). */
  function testDraft(draft: Level, savedState: string): void {
    swap(
      createPlayScreen({
        clock,
        renderer,
        controlsRoot,
        level: draft,
        catalog,
        onExitToMenu: () => openEditorScreen(draft, savedState),
        ...(isTouch !== undefined ? { isTouch } : {}),
      }),
    );
  }

  function openEditorScreen(initial: Level, savedState?: string): void {
    clearWorld();
    swap(
      createEditorScreen({
        renderer,
        controlsRoot,
        catalog,
        initial,
        ...(savedState !== undefined ? { savedState } : {}),
        onExitToMenu: () => app.showMenu(),
        onTest: (draft, baseline) => testDraft(draft, baseline),
        onSave: (level) => saveLevel(level),
      }),
    );
  }

  const app: App = {
    tick(frameMs?: number): void {
      active?.tick(frameMs);
    },
    showMenu(): void {
      clearWorld();
      const levels = allLevels();
      swap(
        createMenuScreen({
          parent: controlsRoot,
          levels,
          customIds: new Set(customLevels().map((l) => l.id)),
          onPlay: (level) => app.playLevel(level),
          onEdit: (level?: Level) => app.openEditor(level),
          onDelete: (level) => deleteLevel(level),
        }),
      );
    },
    playLevel(level: Level): void {
      const levels = allLevels();
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
    openEditor(initial?: Level): void {
      openEditorScreen(initial ?? newDraft());
    },
    dispose(): void {
      active?.dispose();
      active = null;
    },
  };

  return app;
}
