// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { filledGrid } from "../../game/level/tile-types";
import type { Level } from "../level/level-types";
import type { Difficulty } from "../level/random/difficulty";
import { createMenuScreen } from "./menu-screen";

function level(id: string, name: string): Level {
  return {
    id,
    name,
    grid: filledGrid(4, 4, 5),
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0 },
    placedCars: [],
    exit: { a: { x: 10, y: -2 }, b: { x: 10, y: 2 }, outward: { x: 1, y: 0 } },
  };
}

let parent: HTMLElement | undefined;
afterEach(() => parent?.remove());

function mount(
  levels: Level[],
  hooks: {
    customIds?: ReadonlySet<string>;
    bundledIds?: ReadonlySet<string>;
    onPlay?: (l: Level) => void;
    onEdit?: (l?: Level) => void;
    onDelete?: (l: Level) => void;
    onPlayRandom?: (d: Difficulty) => void;
    initialDifficulty?: Difficulty;
    onDifficultyChange?: (d: Difficulty) => void;
  } = {},
) {
  parent = document.createElement("div");
  document.body.appendChild(parent);
  const screen = createMenuScreen({
    parent,
    levels,
    onPlay: hooks.onPlay ?? (() => {}),
    onEdit: hooks.onEdit ?? (() => {}),
    ...(hooks.customIds ? { customIds: hooks.customIds } : {}),
    ...(hooks.bundledIds ? { bundledIds: hooks.bundledIds } : {}),
    ...(hooks.onDelete ? { onDelete: hooks.onDelete } : {}),
    ...(hooks.onPlayRandom ? { onPlayRandom: hooks.onPlayRandom } : {}),
    ...(hooks.initialDifficulty ? { initialDifficulty: hooks.initialDifficulty } : {}),
    ...(hooks.onDifficultyChange ? { onDifficultyChange: hooks.onDifficultyChange } : {}),
  });
  return { screen, parent };
}

describe("createMenuScreen", () => {
  it("renders a card per level with its name", () => {
    const { parent } = mount([level("a", "Alpha"), level("b", "Bravo")]);
    const cards = parent.querySelectorAll(".menu-level-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain("Alpha");
    expect((cards[1] as HTMLElement).dataset.levelId).toBe("b");
  });

  it("calls onPlay with the clicked level", () => {
    let played: Level | undefined;
    const lv = level("a", "Alpha");
    const { parent } = mount([lv], { onPlay: (l) => (played = l) });
    (parent.querySelector(".menu-level-card") as HTMLElement).click();
    expect(played).toEqual(lv);
  });

  it("calls onEdit with no level for the New-level button", () => {
    let edited: Level | undefined | "none" = "none";
    const { parent } = mount([level("a", "Alpha")], { onEdit: (l) => (edited = l) });
    (parent.querySelector(".menu-edit-button") as HTMLElement).click();
    expect(edited).toBeUndefined();
  });

  it("offers an edit action per level that passes the level", () => {
    let edited: Level | undefined;
    const lv = level("a", "Alpha");
    const { parent } = mount([lv], { onEdit: (l) => (edited = l) });
    (parent.querySelector(".menu-level-edit") as HTMLElement).click();
    expect(edited).toEqual(lv);
  });

  it("deletes only after the inline two-step confirm (🗑 → Sure? → click), custom levels only", () => {
    const deleted: string[] = [];
    const { parent } = mount([level("built", "Built-in"), level("mine", "Mine")], {
      customIds: new Set(["mine"]),
      onDelete: (l) => deleted.push(l.id),
    });
    const deletes = parent.querySelectorAll(".menu-level-delete");
    expect(deletes).toHaveLength(1); // built-in levels can't be deleted
    const del = deletes[0] as HTMLElement;
    del.click(); // first click only arms the button — no native popups, ever
    expect(deleted).toEqual([]);
    expect(del.textContent).toBe("Sure?");
    expect(del.classList.contains("confirm")).toBe(true);
    del.click(); // second click deletes
    expect(deleted).toEqual(["mine"]);
    expect(parent.querySelector(".menu-level-badge")?.textContent).toBe("custom");
  });

  it("disarms the delete confirm when clicking anywhere else", () => {
    const deleted: string[] = [];
    const { parent } = mount([level("mine", "Mine")], {
      customIds: new Set(["mine"]),
      onDelete: (l) => deleted.push(l.id),
    });
    const del = parent.querySelector(".menu-level-delete") as HTMLElement;
    del.click();
    expect(del.textContent).toBe("Sure?");
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(del.textContent).toBe("🗑");
    del.click(); // armed again, but still no delete without the second click
    expect(deleted).toEqual([]);
  });

  it("marks an overridden built-in as 'modified' with a restore (↺) action", () => {
    const { parent } = mount([level("built", "Built-in")], {
      customIds: new Set(["built"]),
      bundledIds: new Set(["built"]),
      onDelete: () => {},
    });
    expect(parent.querySelector(".menu-level-badge")?.textContent).toBe("modified");
    const del = parent.querySelector(".menu-level-delete") as HTMLElement;
    expect(del.textContent).toBe("↺");
    expect(del.title).toContain("restores the original");
  });

  it("shows no random-level card unless onPlayRandom is provided", () => {
    const { parent } = mount([level("a", "Alpha")]);
    expect(parent.querySelector(".menu-random-card")).toBeNull();
  });

  it("plays a random level at the selected difficulty (after the Generating… tick)", () => {
    vi.useFakeTimers();
    try {
      const played: Difficulty[] = [];
      const { parent } = mount([], { onPlayRandom: (d) => played.push(d) });
      const options = parent.querySelectorAll<HTMLButtonElement>(".menu-difficulty-option");
      expect([...options].map((o) => o.textContent)).toEqual(["Easy", "Medium", "Hard"]);
      expect(options[0]?.classList.contains("selected")).toBe(true); // defaults to easy

      options[2]?.click(); // Hard
      expect(options[2]?.classList.contains("selected")).toBe(true);
      expect(options[0]?.classList.contains("selected")).toBe(false);

      const card = parent.querySelector<HTMLButtonElement>(".menu-random-card")!;
      card.click();
      expect(card.disabled).toBe(true);
      expect(card.textContent).toContain("Generating…");
      expect(played).toEqual([]); // deferred so the label can paint
      vi.runAllTimers();
      expect(played).toEqual(["hard"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending generate when disposed before the timer fires", () => {
    vi.useFakeTimers();
    try {
      const played: Difficulty[] = [];
      const { screen, parent } = mount([], { onPlayRandom: (d) => played.push(d) });
      (parent.querySelector(".menu-random-card") as HTMLElement).click();
      screen.dispose();
      vi.runAllTimers();
      expect(played).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pre-selects the initial difficulty and reports changes", () => {
    const changes: Difficulty[] = [];
    const { parent } = mount([], {
      onPlayRandom: () => {},
      initialDifficulty: "medium",
      onDifficultyChange: (d) => changes.push(d),
    });
    const options = parent.querySelectorAll<HTMLButtonElement>(".menu-difficulty-option");
    expect(options[1]?.classList.contains("selected")).toBe(true);
    options[0]?.click();
    expect(changes).toEqual(["easy"]);
  });

  it("removes its DOM on dispose", () => {
    const { screen, parent } = mount([level("a", "Alpha")]);
    expect(parent.querySelector(".menu-screen")).not.toBeNull();
    screen.dispose();
    expect(parent.querySelector(".menu-screen")).toBeNull();
  });
});
