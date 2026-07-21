import type { Level } from "../level/level-types";
import { PACK_PAGE_SIZE } from "../level/packs";
import { MAX_STARS } from "../level/stars";
import type { Difficulty } from "../level/random/difficulty";
import type { AttractMode } from "./attract-mode";
import type { Screen } from "./screen";

/**
 * The main menu: total-star header, one endless level pack per difficulty (numbered seed-levels
 * with earned-star pips, expandable accordion + "More" paging), and a "Custom levels" section
 * with the editor entries. An optional autopilot attract-mode demo plays behind it (the menu
 * drives and disposes it). Purely DOM (testable under jsdom); custom-level deletes use an inline
 * two-step confirm (🗑 → "Sure?"), NEVER a native browser popup.
 */

export interface MenuPack {
  difficulty: Difficulty;
  /** Best stars for pack level `index` (0-based); 0 = not completed yet. */
  starsFor(index: number): number;
  /** Stars already earned across this pack (shown on the pack card). */
  earnedStars: number;
  /** Level tiles shown before "More" is pressed (covers the player's progress). */
  initialCount: number;
}

const PACK_LABELS: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export function createMenuScreen(args: {
  parent: HTMLElement;
  /** Sum of best stars across every level — the ★ chip under the title. */
  totalStars: number;
  packs: MenuPack[];
  onPlayPackLevel: (difficulty: Difficulty, index: number) => void;
  /** Custom (editor-authored) levels, grouped under "Custom levels". */
  customLevels: Level[];
  onPlay: (level: Level) => void;
  /** Open the editor: with a level to edit it, without to start a new one. */
  onEdit: (level?: Level) => void;
  onDelete?: (level: Level) => void;
  /** Autopilot background demo; ownership transfers to the menu (ticked + disposed here). */
  attract?: AttractMode;
}): Screen {
  const { parent, packs, onPlayPackLevel, customLevels, onPlay, onEdit, onDelete, attract } = args;

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

  const hero = document.createElement("div");
  hero.className = "menu-hero";
  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Reverse Trailer Parking";
  const starChip = document.createElement("div");
  starChip.className = "menu-total-stars";
  starChip.textContent = `★ ${args.totalStars}`;
  starChip.title = "Total stars earned";
  hero.append(title, starChip);
  root.appendChild(hero);

  // Generation is synchronous (~a second on a phone); a clicked tile defers one tick so its
  // "…" state can paint before the freeze. One shared timer — one launch at a time.
  let launchTimer: ReturnType<typeof setTimeout> | undefined;
  let launching = false;

  function starPips(earned: number): HTMLElement {
    const pips = document.createElement("span");
    pips.className = "menu-star-pips";
    for (let i = 0; i < MAX_STARS; i++) {
      const pip = document.createElement("span");
      pip.className = i < earned ? "menu-star earned" : "menu-star";
      pip.textContent = "★";
      pips.appendChild(pip);
    }
    return pips;
  }

  const packsRoot = document.createElement("div");
  packsRoot.className = "menu-packs";
  const packSections: { el: HTMLElement; open(v: boolean): void }[] = [];

  for (const pack of packs) {
    const section = document.createElement("section");
    section.className = `menu-pack menu-pack-${pack.difficulty}`;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "menu-pack-header";
    header.dataset.difficulty = pack.difficulty;
    const name = document.createElement("span");
    name.className = "menu-pack-name";
    name.textContent = PACK_LABELS[pack.difficulty];
    const packStars = document.createElement("span");
    packStars.className = "menu-pack-stars";
    packStars.textContent = `★ ${pack.earnedStars}`;
    const chevron = document.createElement("span");
    chevron.className = "menu-pack-chevron";
    chevron.textContent = "▸";
    header.append(name, packStars, chevron);
    section.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "menu-pack-grid";
    section.appendChild(grid);

    let count = 0;
    const more = document.createElement("button");
    more.type = "button";
    more.className = "menu-pack-more";
    more.textContent = "More ▾";

    function addTiles(upTo: number): void {
      more.remove();
      for (let index = count; index < upTo; index++) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "menu-pack-level";
        tile.dataset.index = String(index);
        const num = document.createElement("span");
        num.className = "menu-pack-level-num";
        num.textContent = String(index + 1);
        tile.append(num, starPips(pack.starsFor(index)));
        tile.addEventListener("click", () => {
          if (launching) return;
          launching = true;
          tile.classList.add("generating");
          num.textContent = "…";
          launchTimer = setTimeout(() => onPlayPackLevel(pack.difficulty, index), 30);
        });
        grid.appendChild(tile);
      }
      count = upTo;
      grid.appendChild(more); // endless pack — there is always more
    }
    more.addEventListener("click", () => addTiles(count + PACK_PAGE_SIZE));
    addTiles(Math.max(PACK_PAGE_SIZE, pack.initialCount));

    const openSection = (open: boolean): void => {
      section.classList.toggle("open", open);
      chevron.textContent = open ? "▾" : "▸";
    };
    header.addEventListener("click", () => {
      const willOpen = !section.classList.contains("open");
      for (const other of packSections) other.open(false);
      openSection(willOpen);
    });
    packSections.push({ el: section, open: openSection });
    packsRoot.appendChild(section);
  }
  // The first pack starts open so a new player sees Level 1 immediately.
  packSections[0]?.open(true);
  root.appendChild(packsRoot);

  const custom = document.createElement("section");
  custom.className = "menu-custom";
  const customHeader = document.createElement("h2");
  customHeader.className = "menu-custom-header";
  customHeader.textContent = "Custom levels";
  custom.appendChild(customHeader);

  const list = document.createElement("div");
  list.className = "menu-levels";
  for (const level of customLevels) {
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
    card.addEventListener("click", () => onPlay(level));
    row.appendChild(card);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "menu-level-action menu-level-edit";
    edit.title = `Edit “${level.name}” in the level editor`;
    edit.textContent = "✎";
    edit.addEventListener("click", () => onEdit(level));
    row.appendChild(edit);

    if (onDelete) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "menu-level-action menu-level-delete";
      del.title = `Delete “${level.name}”`;
      del.textContent = "🗑";
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
          del.textContent = "🗑";
        };
      });
      row.appendChild(del);
    }
    list.appendChild(row);
  }
  custom.appendChild(list);

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "menu-edit-button";
  editButton.textContent = "＋ New level";
  editButton.addEventListener("click", () => onEdit());
  custom.appendChild(editButton);
  root.appendChild(custom);

  if (attract) {
    const badge = document.createElement("div");
    badge.className = "menu-attract-badge";
    badge.textContent = "🤖 autopilot demo";
    root.appendChild(badge);
  }

  parent.appendChild(root);

  return {
    tick(frameMs?: number): void {
      attract?.tick(frameMs);
    },
    dispose(): void {
      clearTimeout(launchTimer);
      attract?.dispose();
      document.removeEventListener("pointerdown", onDocPointerDown);
      root.remove();
    },
  };
}
