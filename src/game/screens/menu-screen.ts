import type { Level } from "../level/level-types";
import type { Screen } from "./screen";

/**
 * The main menu: a DOM overlay listing playable levels plus a "Level editor" entry. Purely DOM
 * (testable under jsdom); the world render is cleared by the app before showing it.
 */
export function createMenuScreen(args: {
  parent: HTMLElement;
  levels: Level[];
  onPlay: (level: Level) => void;
  onEdit: () => void;
}): Screen {
  const { parent, levels, onPlay, onEdit } = args;

  const root = document.createElement("div");
  root.className = "menu-screen";

  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Reverse Trailer Parking";
  root.appendChild(title);

  const list = document.createElement("div");
  list.className = "menu-levels";
  for (const level of levels) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "menu-level-card";
    card.dataset.levelId = level.id;
    const name = document.createElement("span");
    name.className = "menu-level-name";
    name.textContent = level.name;
    card.appendChild(name);
    card.addEventListener("click", () => onPlay(level));
    list.appendChild(card);
  }
  root.appendChild(list);

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "menu-edit-button";
  editButton.textContent = "✎ Level editor";
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
