import type { Clock } from "../../engine/loop/clock";
import type { Renderer } from "../../engine/render/renderer";
import { emptyLevel } from "../level/editor-model";
import type { Level } from "../level/level-types";
import { isDifficulty, type Difficulty } from "../level/random/difficulty";
import { generateRandomLevel } from "../level/random/generate-level";
import { deleteCustomLevel, loadCustomLevels, mergeLevels, saveCustomLevel, type LevelStorage } from "../level/level-store";
import { encodeLevelRef, LEVEL_PARAM, MAX_URL_LENGTH, parseLevelRef, type LevelShareRef } from "../level/share-url";
import { validateLevel } from "../level/level-validate";
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
  /** Generate a seeded random level at the given difficulty and play it (fresh seed if omitted). */
  playRandomLevel(difficulty: Difficulty, seed?: number): void;
  /** Route straight into the level a shared `?level=` URL refers to; false if absent/invalid. */
  openFromUrl(search: string): Promise<boolean>;
  /** Open the editor: with a level to edit it, without to start a new draft. */
  openEditor(initial?: Level): void;
  dispose(): void;
}

const DIFFICULTY_KEY = "parking.randomDifficulty";

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
  /** Seed source for random levels (injected in tests; defaults to a time-based draw). */
  drawSeed?: () => number;
}): App {
  const { clock, renderer, controlsRoot, catalog, isTouch, storage } = args;
  const drawSeed = args.drawSeed ?? ((): number => Date.now() % 0x7fffffff);
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

  /** Generate a verified random level; re-draws the seed a couple of times before giving up
   * (a single draw failing is already near-impossible — 16 internal attempts per seed). An
   * explicit seed (a shared URL) gets exactly one try so the URL and the map never diverge. */
  function generateRandom(difficulty: Difficulty, fixedSeed?: number): { level: Level; seed: number } | null {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const seed = fixedSeed ?? ((drawSeed() + attempt * 7919) >>> 0); // offset so a same-ms redraw differs
        return { level: generateRandomLevel({ seed, difficulty, catalog }).level, seed };
      } catch {
        if (fixedSeed !== undefined) return null;
        // try another seed
      }
    }
    return null;
  }

  /** Reflect the active level in the address bar so the link is shareable/bookmarkable. */
  let urlEpoch = 0;
  function writeUrl(ref: LevelShareRef | null): void {
    const epoch = ++urlEpoch; // a newer writeUrl invalidates any still-encoding older one
    if (ref === null) {
      history.replaceState(null, "", window.location.pathname);
      return;
    }
    void encodeLevelRef(ref)
      .then((value) => {
        if (epoch !== urlEpoch) return;
        const query = `?${LEVEL_PARAM}=${value}`;
        if (window.location.origin.length + window.location.pathname.length + query.length > MAX_URL_LENGTH) {
          console.warn(`Share URL exceeds ${MAX_URL_LENGTH} chars — some apps may truncate it.`);
        }
        history.replaceState(null, "", query);
      })
      .catch(() => {
        /* URL sharing is best-effort — never break gameplay over it */
      });
  }

  /** Generation is synchronous and can take ~a second on a phone. The win overlay's
   * "Play another ▸" goes through this: paint a Generating… overlay (which also swallows
   * double-taps), then generate on the next tick so the feedback is visible first. */
  function playRandomDeferred(difficulty: Difficulty): void {
    const overlay = document.createElement("div");
    overlay.className = "generating-overlay";
    overlay.textContent = "Generating level…";
    controlsRoot.appendChild(overlay);
    setTimeout(() => {
      try {
        app.playRandomLevel(difficulty);
      } finally {
        overlay.remove();
      }
    }, 30);
  }

  function savedDifficulty(): Difficulty {
    const raw = storage?.getItem(DIFFICULTY_KEY);
    return raw !== null && raw !== undefined && isDifficulty(raw) ? raw : "easy";
  }
  function saveDifficulty(difficulty: Difficulty): void {
    storage?.setItem(DIFFICULTY_KEY, difficulty);
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
    writeUrl({ kind: "custom", level: draft });
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
    writeUrl(null);
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
      writeUrl(null);
      const levels = allLevels();
      swap(
        createMenuScreen({
          parent: controlsRoot,
          levels,
          customIds: new Set(customLevels().map((l) => l.id)),
          bundledIds: new Set(bundled.map((l) => l.id)),
          onPlay: (level) => app.playLevel(level),
          onEdit: (level?: Level) => app.openEditor(level),
          onDelete: (level) => deleteLevel(level),
          onPlayRandom: (difficulty) => app.playRandomLevel(difficulty),
          initialDifficulty: savedDifficulty(),
          onDifficultyChange: (difficulty) => saveDifficulty(difficulty),
        }),
      );
    },
    playLevel(level: Level): void {
      const levels = allLevels();
      const index = levels.findIndex((l) => l.id === level.id);
      const next = index >= 0 ? levels[index + 1] : undefined;
      // A pristine bundled level shares by id; anything else (custom, edited override, one-off
      // from a shared URL) must carry its full JSON so recipients without it can play it.
      const isPristineBundled =
        bundled.some((b) => b.id === level.id) && !customLevels().some((c) => c.id === level.id);
      writeUrl(isPristineBundled ? { kind: "bundled", id: level.id } : { kind: "custom", level });
      swap(
        createPlayScreen({
          clock,
          renderer,
          controlsRoot,
          level,
          catalog,
          onExitToMenu: () => app.showMenu(),
          ...(next ? { onNextLevel: () => app.playLevel(next) } : {}),
          isLastLevel: index >= 0 && !next,
          ...(isTouch !== undefined ? { isTouch } : {}),
        }),
      );
    },
    playRandomLevel(difficulty: Difficulty, seed?: number): void {
      saveDifficulty(difficulty);
      // NOT via playLevel: random levels are session-only (never in the level list), and the win
      // overlay's next action re-generates at the same difficulty rather than advancing a list.
      const generated = generateRandom(difficulty, seed);
      if (!generated) {
        // Never brick the UI on a pathological draw — fall back to the menu (which also
        // restores the random card from its "Generating…" state).
        app.showMenu();
        return;
      }
      writeUrl({ kind: "random", difficulty, seed: generated.seed });
      swap(
        createPlayScreen({
          clock,
          renderer,
          controlsRoot,
          level: generated.level,
          catalog,
          onExitToMenu: () => app.showMenu(),
          onNextLevel: () => playRandomDeferred(difficulty),
          nextLabel: "Play another ▸",
          isLastLevel: false,
          ...(isTouch !== undefined ? { isTouch } : {}),
        }),
      );
    },
    async openFromUrl(search: string): Promise<boolean> {
      const value = new URLSearchParams(search).get(LEVEL_PARAM);
      if (!value) return false;
      const ref = await parseLevelRef(value);
      if (!ref) return false;
      if (ref.kind === "random") {
        app.playRandomLevel(ref.difficulty, ref.seed);
        return true;
      }
      if (ref.kind === "bundled") {
        const level = allLevels().find((l) => l.id === ref.id);
        if (!level) return false;
        app.playLevel(level);
        return true;
      }
      try {
        validateLevel(ref.level, catalog); // structurally parsed, but the data is untrusted
      } catch {
        return false;
      }
      app.playLevel(ref.level);
      return true;
    },
    openEditor(initial?: Level): void {
      openEditorScreen(initial ?? newDraft());
    },
    dispose(): void {
      urlEpoch++; // drop any still-encoding URL write from this app
      active?.dispose();
      active = null;
    },
  };

  return app;
}
