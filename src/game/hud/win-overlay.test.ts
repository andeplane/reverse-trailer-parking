// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createWinOverlay } from "./win-overlay";

let parent: HTMLElement | undefined;
afterEach(() => parent?.remove());

function mount(
  opts: {
    onNext?: () => void;
    onRetry?: () => void;
    onMenu?: () => void;
    isLastLevel?: boolean;
    nextLabel?: string;
    stars?: number;
  } = {},
) {
  parent = document.createElement("div");
  document.body.appendChild(parent);
  const overlay = createWinOverlay({
    parent,
    levelName: "The Big Lot",
    onRetry: opts.onRetry ?? (() => {}),
    onMenu: opts.onMenu ?? (() => {}),
    ...(opts.onNext ? { onNext: opts.onNext } : {}),
    ...(opts.isLastLevel !== undefined ? { isLastLevel: opts.isLastLevel } : {}),
    ...(opts.nextLabel !== undefined ? { nextLabel: opts.nextLabel } : {}),
    ...(opts.stars !== undefined ? { stars: opts.stars } : {}),
  });
  return { overlay, parent };
}

describe("createWinOverlay", () => {
  it("shows the level name and Retry/Menu buttons", () => {
    const { parent } = mount();
    expect(parent.querySelector(".win-subtitle")?.textContent).toBe("The Big Lot");
    expect(parent.querySelector(".win-retry")).not.toBeNull();
    expect(parent.querySelector(".win-menu")).not.toBeNull();
  });

  it("omits Next when there is no next level", () => {
    const { parent } = mount();
    expect(parent.querySelector(".win-next")).toBeNull();
  });

  it("shows Next and wires it when a next handler is given", () => {
    let next = 0;
    const { parent } = mount({ onNext: () => (next += 1) });
    (parent.querySelector(".win-next") as HTMLElement).click();
    expect(next).toBe(1);
  });

  it("uses a custom next label when given (random levels say 'Play another ▸')", () => {
    const { parent } = mount({ onNext: () => {}, nextLabel: "Play another ▸" });
    expect(parent.querySelector(".win-next")?.textContent).toBe("Play another ▸");
  });

  it("wires Retry and Menu", () => {
    let retry = 0;
    let menu = 0;
    const { parent } = mount({ onRetry: () => (retry += 1), onMenu: () => (menu += 1) });
    (parent.querySelector(".win-retry") as HTMLElement).click();
    (parent.querySelector(".win-menu") as HTMLElement).click();
    expect(retry).toBe(1);
    expect(menu).toBe(1);
  });

  it("celebrates finishing the last level, but not otherwise", () => {
    const done = mount({ isLastLevel: true });
    expect(done.parent.querySelector(".win-finished")?.textContent).toContain("every level");
    done.parent.remove();
    const mid = mount({ isLastLevel: false });
    expect(mid.parent.querySelector(".win-finished")).toBeNull();
  });

  it("shows earned stars out of three, with a par hint below 3", () => {
    const { parent } = mount({ stars: 2 });
    const pips = [...parent.querySelectorAll(".win-star")];
    expect(pips).toHaveLength(3);
    expect(pips.map((p) => p.classList.contains("earned"))).toEqual([true, true, false]);
    expect(parent.querySelector(".win-star-hint")?.textContent).toContain("par");
  });

  it("drops the par hint at 3 stars, and shows no stars row when untracked", () => {
    const three = mount({ stars: 3 });
    expect(three.parent.querySelectorAll(".win-star.earned")).toHaveLength(3);
    expect(three.parent.querySelector(".win-star-hint")).toBeNull();
    three.parent.remove();
    const untracked = mount();
    expect(untracked.parent.querySelector(".win-stars")).toBeNull();
  });

  it("removes its DOM on dispose", () => {
    const { overlay, parent } = mount();
    overlay.dispose();
    expect(parent.querySelector(".win-overlay")).toBeNull();
  });
});
