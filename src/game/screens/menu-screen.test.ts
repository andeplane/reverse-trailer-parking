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
    confirmDelete?: (l: Level) => boolean;
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
    ...(hooks.confirmDelete ? { confirmDelete: hooks.confirmDelete } : {}),
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

  it("offers delete (behind a confirm) only for custom levels", () => {
    const deleted: string[] = [];
    const { parent } = mount([level("built", "Built-in"), level("mine", "Mine")], {
      customIds: new Set(["mine"]),
      onDelete: (l) => deleted.push(l.id),
      confirmDelete: () => true,
    });
    const deletes = parent.querySelectorAll(".menu-level-delete");
    expect(deletes).toHaveLength(1); // built-in levels can't be deleted
    (deletes[0] as HTMLElement).click();
    expect(deleted).toEqual(["mine"]);
    expect(parent.querySelector(".menu-level-badge")?.textContent).toBe("custom");
  });

  it("does not delete when the confirmation is declined", () => {
    const deleted: string[] = [];
    const { parent } = mount([level("mine", "Mine")], {
      customIds: new Set(["mine"]),
      onDelete: (l) => deleted.push(l.id),
      confirmDelete: () => false,
    });
    (parent.querySelector(".menu-level-delete") as HTMLElement).click();
    expect(deleted).toEqual([]);
  });

  it("removes its DOM on dispose", () => {
    const { screen, parent } = mount([level("a", "Alpha")]);
    expect(parent.querySelector(".menu-screen")).not.toBeNull();
    screen.dispose();
    expect(parent.querySelector(".menu-screen")).toBeNull();
  });
});
