import type { Level } from "../level/level-types";
import type { Screen } from "./screen";

/**
 * The main menu: a DOM overlay listing playable levels plus a "New level" editor entry. Every
 * level can be opened in the editor (editing a built-in saves a custom copy over it); custom
 * (editor-authored) levels can also be deleted. Purely DOM (testable under jsdom); the world
 * render is cleared by the app before showing it.
 */
export function createMenuScreen(args: {
  parent: HTMLElement;
  levels: Level[];
  /** Ids of custom (editor-authored) levels — these get a delete action. */
  customIds?: ReadonlySet<string>;
  onPlay: (level: Level) => void;
  /** Open the editor: with a level to edit it, without to start a new one. */
  onEdit: (level?: Level) => void;
  onDelete?: (level: Level) => void;
  /** Confirmation hook for deletes (defaults to window.confirm). */
  confirmDelete?: (level: Level) => boolean;
}): Screen {
  const { parent, levels, onPlay, onEdit, onDelete } = args;
  const customIds = args.customIds ?? new Set<string>();
  const confirmDelete =
    args.confirmDelete ?? ((level: Level) => window.confirm(`Delete level “${level.name}”? This cannot be undone.`));

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
    if (customIds.has(level.id)) {
      const badge = document.createElement("span");
      badge.className = "menu-level-badge";
      badge.textContent = "custom";
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
      del.title = `Delete “${level.name}”`;
      del.textContent = "🗑";
      del.addEventListener("click", () => {
        if (confirmDelete(level)) onDelete(level);
      });
      row.appendChild(del);
    }
    list.appendChild(row);
  }
  root.appendChild(list);

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
      root.remove();
    },
  };
}
