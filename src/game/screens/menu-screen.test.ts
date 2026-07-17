// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { filledGrid } from "../../game/level/tile-types";
import type { Level } from "../level/level-types";
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
    onPlay?: (l: Level) => void;
    onEdit?: (l?: Level) => void;
    onDelete?: (l: Level) => void;
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
    ...(hooks.onDelete ? { onDelete: hooks.onDelete } : {}),
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

  it("removes its DOM on dispose", () => {
    const { screen, parent } = mount([level("a", "Alpha")]);
    expect(parent.querySelector(".menu-screen")).not.toBeNull();
    screen.dispose();
    expect(parent.querySelector(".menu-screen")).toBeNull();
  });
});
