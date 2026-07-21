// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { filledGrid } from "../../game/level/tile-types";
import type { Level } from "../level/level-types";
import { PACK_PAGE_SIZE } from "../level/packs";
import type { Difficulty } from "../level/random/difficulty";
import type { AttractMode } from "./attract-mode";
import { createMenuScreen, type MenuPack } from "./menu-screen";

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

function pack(difficulty: Difficulty, overrides: Partial<MenuPack> = {}): MenuPack {
  return {
    difficulty,
    starsFor: () => 0,
    earnedStars: 0,
    initialCount: PACK_PAGE_SIZE,
    ...overrides,
  };
}

const ALL_PACKS: MenuPack[] = [pack("easy"), pack("medium"), pack("hard")];

let parent: HTMLElement | undefined;
afterEach(() => parent?.remove());

function mount(
  hooks: {
    totalStars?: number;
    packs?: MenuPack[];
    customLevels?: Level[];
    onPlayPackLevel?: (d: Difficulty, i: number) => void;
    onPlay?: (l: Level) => void;
    onEdit?: (l?: Level) => void;
    onDelete?: (l: Level) => void;
    attract?: AttractMode;
  } = {},
) {
  parent = document.createElement("div");
  document.body.appendChild(parent);
  const screen = createMenuScreen({
    parent,
    totalStars: hooks.totalStars ?? 0,
    packs: hooks.packs ?? ALL_PACKS,
    customLevels: hooks.customLevels ?? [],
    onPlayPackLevel: hooks.onPlayPackLevel ?? (() => {}),
    onPlay: hooks.onPlay ?? (() => {}),
    onEdit: hooks.onEdit ?? (() => {}),
    ...(hooks.onDelete ? { onDelete: hooks.onDelete } : {}),
    ...(hooks.attract ? { attract: hooks.attract } : {}),
  });
  return { screen, parent };
}

describe("createMenuScreen", () => {
  it("shows the total star count and one pack per difficulty", () => {
    const { parent } = mount({ totalStars: 27 });
    expect(parent.querySelector(".menu-total-stars")?.textContent).toBe("★ 27");
    const headers = [...parent.querySelectorAll<HTMLElement>(".menu-pack-header")];
    expect(headers.map((h) => h.dataset.difficulty)).toEqual(["easy", "medium", "hard"]);
    expect(headers[0]?.textContent).toContain("Easy");
  });

  it("opens the first pack by default with a page of numbered level tiles", () => {
    const { parent } = mount();
    const open = parent.querySelectorAll(".menu-pack.open");
    expect(open).toHaveLength(1);
    expect(open[0]?.classList.contains("menu-pack-easy")).toBe(true);
    const tiles = open[0]!.querySelectorAll(".menu-pack-level");
    expect(tiles).toHaveLength(PACK_PAGE_SIZE);
    expect(tiles[0]?.querySelector(".menu-pack-level-num")?.textContent).toBe("1");
  });

  it("accordion: opening another pack closes the current one", () => {
    const { parent } = mount();
    const headers = parent.querySelectorAll<HTMLElement>(".menu-pack-header");
    headers[2]!.click();
    expect(parent.querySelector(".menu-pack-easy")?.classList.contains("open")).toBe(false);
    expect(parent.querySelector(".menu-pack-hard")?.classList.contains("open")).toBe(true);
    headers[2]!.click(); // toggling the open one closes it
    expect(parent.querySelectorAll(".menu-pack.open")).toHaveLength(0);
  });

  it("renders earned-star pips per tile and the pack's star total", () => {
    const { parent } = mount({
      packs: [pack("easy", { earnedStars: 5, starsFor: (i) => (i === 0 ? 3 : i === 1 ? 2 : 0) })],
    });
    expect(parent.querySelector(".menu-pack-stars")?.textContent).toBe("★ 5");
    const tiles = parent.querySelectorAll(".menu-pack-level");
    expect(tiles[0]?.querySelectorAll(".menu-star.earned")).toHaveLength(3);
    expect(tiles[1]?.querySelectorAll(".menu-star.earned")).toHaveLength(2);
    expect(tiles[2]?.querySelectorAll(".menu-star.earned")).toHaveLength(0);
  });

  it("shows the player's progress window (initialCount) and pages more on More", () => {
    const { parent } = mount({ packs: [pack("easy", { initialCount: 24 })] });
    const grid = parent.querySelector(".menu-pack-grid")!;
    expect(grid.querySelectorAll(".menu-pack-level")).toHaveLength(24);
    (grid.querySelector(".menu-pack-more") as HTMLElement).click();
    expect(grid.querySelectorAll(".menu-pack-level")).toHaveLength(24 + PACK_PAGE_SIZE);
    expect(grid.querySelector(".menu-pack-more")).not.toBeNull(); // endless — always more
  });

  it("launches a pack level after the deferred Generating… tick, once", () => {
    vi.useFakeTimers();
    try {
      const played: Array<[Difficulty, number]> = [];
      const { parent } = mount({ onPlayPackLevel: (d, i) => played.push([d, i]) });
      const tile = parent.querySelectorAll<HTMLElement>(".menu-pack-level")[4]!;
      tile.click();
      expect(tile.classList.contains("generating")).toBe(true);
      expect(played).toEqual([]); // deferred so the tile state can paint
      tile.click(); // double-tap while generating must not double-launch
      parent.querySelectorAll<HTMLElement>(".menu-pack-level")[1]!.click();
      vi.runAllTimers();
      expect(played).toEqual([["easy", 4]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending launch when disposed before the timer fires", () => {
    vi.useFakeTimers();
    try {
      const played: number[] = [];
      const { screen, parent } = mount({ onPlayPackLevel: (_, i) => played.push(i) });
      (parent.querySelector(".menu-pack-level") as HTMLElement).click();
      screen.dispose();
      vi.runAllTimers();
      expect(played).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists custom levels under the Custom header and plays on click", () => {
    let played: Level | undefined;
    const lv = level("mine", "My lot");
    const { parent } = mount({ customLevels: [lv], onPlay: (l) => (played = l) });
    expect(parent.querySelector(".menu-custom-header")?.textContent).toBe("Custom levels");
    const card = parent.querySelector(".menu-level-card") as HTMLElement;
    expect(card.textContent).toContain("My lot");
    card.click();
    expect(played).toEqual(lv);
  });

  it("wires editing: per-level ✎ passes the level, New level passes nothing", () => {
    const edits: Array<Level | undefined> = [];
    const { parent } = mount({ customLevels: [level("mine", "Mine")], onEdit: (l) => edits.push(l) });
    (parent.querySelector(".menu-level-edit") as HTMLElement).click();
    (parent.querySelector(".menu-edit-button") as HTMLElement).click();
    expect(edits).toHaveLength(2);
    expect(edits[0]?.id).toBe("mine");
    expect(edits[1]).toBeUndefined();
  });

  it("deletes only after the inline two-step confirm — no native popups, ever", () => {
    const deleted: string[] = [];
    const { parent } = mount({
      customLevels: [level("mine", "Mine")],
      onDelete: (l) => deleted.push(l.id),
    });
    const del = parent.querySelector(".menu-level-delete") as HTMLElement;
    del.click(); // arms
    expect(deleted).toEqual([]);
    expect(del.textContent).toBe("Sure?");
    del.click(); // confirms
    expect(deleted).toEqual(["mine"]);
  });

  it("disarms the delete confirm when clicking anywhere else", () => {
    const deleted: string[] = [];
    const { parent } = mount({
      customLevels: [level("mine", "Mine")],
      onDelete: (l) => deleted.push(l.id),
    });
    const del = parent.querySelector(".menu-level-delete") as HTMLElement;
    del.click();
    expect(del.textContent).toBe("Sure?");
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(del.textContent).toBe("🗑");
    del.click();
    expect(deleted).toEqual([]);
  });

  it("drives and disposes the attract demo it was given, and badges it", () => {
    const calls: Array<number | undefined> = [];
    let disposed = 0;
    const attract: AttractMode = {
      tick: (ms) => calls.push(ms),
      dispose: () => (disposed += 1),
    };
    const { screen, parent } = mount({ attract });
    expect(parent.querySelector(".menu-attract-badge")).not.toBeNull();
    screen.tick(16);
    expect(calls).toEqual([16]);
    screen.dispose();
    expect(disposed).toBe(1);
  });

  it("shows no attract badge without a demo, and removes its DOM on dispose", () => {
    const { screen, parent } = mount();
    expect(parent.querySelector(".menu-attract-badge")).toBeNull();
    screen.tick(); // no attract — must not throw
    screen.dispose();
    expect(parent.querySelector(".menu-screen")).toBeNull();
  });
});
