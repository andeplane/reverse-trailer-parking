// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createWinOverlay } from "./win-overlay";

let parent: HTMLElement | undefined;
afterEach(() => parent?.remove());

function mount(opts: { onNext?: () => void; onRetry?: () => void; onMenu?: () => void; isLastLevel?: boolean } = {}) {
  parent = document.createElement("div");
  document.body.appendChild(parent);
  const overlay = createWinOverlay({
    parent,
    levelName: "The Big Lot",
    onRetry: opts.onRetry ?? (() => {}),
    onMenu: opts.onMenu ?? (() => {}),
    ...(opts.onNext ? { onNext: opts.onNext } : {}),
    ...(opts.isLastLevel !== undefined ? { isLastLevel: opts.isLastLevel } : {}),
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

  it("removes its DOM on dispose", () => {
    const { overlay, parent } = mount();
    overlay.dispose();
    expect(parent.querySelector(".win-overlay")).toBeNull();
  });
});
