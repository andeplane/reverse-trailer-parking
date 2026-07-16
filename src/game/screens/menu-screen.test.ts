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

function mount(levels: Level[], onPlay: (l: Level) => void = () => {}, onEdit: () => void = () => {}) {
  parent = document.createElement("div");
  document.body.appendChild(parent);
  const screen = createMenuScreen({ parent, levels, onPlay, onEdit });
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
    const { parent } = mount([lv], (l) => (played = l));
    (parent.querySelector(".menu-level-card") as HTMLElement).click();
    expect(played).toEqual(lv);
  });

  it("calls onEdit when the editor button is clicked", () => {
    let edited = false;
    const { parent } = mount([level("a", "Alpha")], () => {}, () => (edited = true));
    (parent.querySelector(".menu-edit-button") as HTMLElement).click();
    expect(edited).toBe(true);
  });

  it("removes its DOM on dispose", () => {
    const { screen, parent } = mount([level("a", "Alpha")]);
    expect(parent.querySelector(".menu-screen")).not.toBeNull();
    screen.dispose();
    expect(parent.querySelector(".menu-screen")).toBeNull();
  });
});
