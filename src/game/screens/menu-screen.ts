import type { Level } from "../level/level-types";
import { ALL_DIFFICULTIES, type Difficulty } from "../level/random/difficulty";
import type { Screen } from "./screen";

/**
 * The main menu: a DOM overlay listing playable levels plus a "New level" editor entry. Every
 * level can be opened in the editor (editing a built-in saves a custom copy over it); custom
 * (editor-authored) levels can also be deleted — via an inline two-step confirm (🗑 → "Sure?"),
 * NEVER a native browser popup. Purely DOM (testable under jsdom); the world render is cleared
 * by the app before showing it.
 */
export function createMenuScreen(args: {
  parent: HTMLElement;
  levels: Level[];
  /** Ids of custom (editor-authored) levels — these get a delete action. */
  customIds?: ReadonlySet<string>;
  /** Ids of bundled levels — a custom level with a bundled id is an override ("modified"),
   * and deleting it restores the original rather than destroying anything. */
  bundledIds?: ReadonlySet<string>;
  onPlay: (level: Level) => void;
  /** Open the editor: with a level to edit it, without to start a new one. */
  onEdit: (level?: Level) => void;
  onDelete?: (level: Level) => void;
  /** Enables the 🎲 random-level card with its Easy|Medium|Hard segmented control. */
  onPlayRandom?: (difficulty: Difficulty) => void;
  /** Pre-selected difficulty (the player's last choice). */
  initialDifficulty?: Difficulty;
  /** Called whenever the player picks a difficulty (so the app can persist it). */
  onDifficultyChange?: (difficulty: Difficulty) => void;
}): Screen {
  const { parent, levels, onPlay, onEdit, onDelete } = args;
  const customIds = args.customIds ?? new Set<string>();
  const bundledIds = args.bundledIds ?? new Set<string>();

  // At most one delete button is in its armed ("Sure?") state; clicking anywhere else disarms it.
  let disarmActiveDelete: (() => void) | null = null;
  function disarm(): void {
    disarmActiveDelete?.();
    disarmActiveDelete = null;
  }
  const onDocPointerDown = (e: Event): void => {
    if (!(e.target instanceof Element && e.target.classList.contains("confirm"))) disarm();
  };
  document.addEventListener("pointerdown", onDocPointerDown);

  const root = document.createElement("div");
  root.className = "menu-screen";

  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Reverse Trailer Parking";
  root.appendChild(title);

  const list = document.createElement("div");
  list.className = "menu-levels";
  for (const level of levels) {
    const row = document.createElement("div");
    row.className = "menu-level-row";

    const card = document.createElement("button");
    card.type = "button";
    card.className = "menu-level-card";
    card.dataset.levelId = level.id;
    const name = document.createElement("span");
    name.className = "menu-level-name";
    name.textContent = level.name;
    card.appendChild(name);
    const isOverride = customIds.has(level.id) && bundledIds.has(level.id);
    if (customIds.has(level.id)) {
      const badge = document.createElement("span");
      badge.className = "menu-level-badge";
      badge.textContent = isOverride ? "modified" : "custom";
      card.appendChild(badge);
    }
    card.addEventListener("click", () => onPlay(level));
    row.appendChild(card);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "menu-level-action menu-level-edit";
    edit.title = `Edit “${level.name}” in the level editor`;
    edit.textContent = "✎";
    edit.addEventListener("click", () => onEdit(level));
    row.appendChild(edit);

    if (customIds.has(level.id) && onDelete) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "menu-level-action menu-level-delete";
      del.title = isOverride ? `Remove changes to “${level.name}” (restores the original)` : `Delete “${level.name}”`;
      del.textContent = isOverride ? "↺" : "🗑";
      del.addEventListener("click", () => {
        if (del.classList.contains("confirm")) {
          onDelete(level);
          return;
        }
        disarm();
        del.classList.add("confirm");
        del.textContent = "Sure?";
        disarmActiveDelete = () => {
          del.classList.remove("confirm");
          del.textContent = isOverride ? "↺" : "🗑";
        };
      });
      row.appendChild(del);
    }
    list.appendChild(row);
  }
  root.appendChild(list);

  // 🎲 Random level: a card + segmented difficulty control. Generation is synchronous, so the
  // click defers one tick to let "Generating…" paint before the app freezes for ~a second.
  let randomTimer: ReturnType<typeof setTimeout> | undefined;
  if (args.onPlayRandom) {
    const onPlayRandom = args.onPlayRandom;
    let difficulty: Difficulty = args.initialDifficulty ?? "easy";

    const randomSection = document.createElement("div");
    randomSection.className = "menu-random";

    const card = document.createElement("button");
    card.type = "button";
    card.className = "menu-random-card";
    const name = document.createElement("span");
    name.className = "menu-level-name";
    name.textContent = "🎲 Random level";
    card.appendChild(name);
    card.addEventListener("click", () => {
      card.disabled = true;
      name.textContent = "Generating…";
      randomTimer = setTimeout(() => onPlayRandom(difficulty), 30);
    });
    randomSection.appendChild(card);

    const segmented = document.createElement("div");
    segmented.className = "menu-difficulty";
    segmented.setAttribute("role", "group");
    segmented.setAttribute("aria-label", "Random level difficulty");
    const options = new Map<Difficulty, HTMLButtonElement>();
    for (const d of ALL_DIFFICULTIES) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "menu-difficulty-option";
      option.dataset.difficulty = d;
      option.textContent = d.charAt(0).toUpperCase() + d.slice(1);
      option.addEventListener("click", () => {
        difficulty = d;
        for (const [key, el] of options) el.classList.toggle("selected", key === d);
        args.onDifficultyChange?.(d);
      });
      options.set(d, option);
      segmented.appendChild(option);
    }
    options.get(difficulty)?.classList.add("selected");
    randomSection.appendChild(segmented);
    root.appendChild(randomSection);
  }

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "menu-edit-button";
  editButton.textContent = "＋ New level";
  editButton.addEventListener("click", () => onEdit());
  root.appendChild(editButton);

  parent.appendChild(root);

  return {
    tick(): void {},
    dispose(): void {
      clearTimeout(randomTimer);
      document.removeEventListener("pointerdown", onDocPointerDown);
      root.remove();
    },
  };
}
