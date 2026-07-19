// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createLoseOverlay } from "./lose-overlay";

let parent: HTMLElement | undefined;
afterEach(() => parent?.remove());

function mount(opts: { onRetry?: () => void; onMenu?: () => void } = {}) {
  parent = document.createElement("div");
  document.body.appendChild(parent);
  const overlay = createLoseOverlay({
    parent,
    levelName: "The Big Lot",
    onRetry: opts.onRetry ?? (() => {}),
    onMenu: opts.onMenu ?? (() => {}),
  });
  return { overlay, parent };
}

describe("createLoseOverlay", () => {
  it("shows the wrecked title, the level name, and Retry/Menu buttons", () => {
    const { parent } = mount();
    expect(parent.querySelector(".lose-title")?.textContent).toContain("Wrecked");
    expect(parent.querySelector(".win-subtitle")?.textContent).toContain("The Big Lot");
    expect(parent.querySelector(".win-retry")).not.toBeNull();
    expect(parent.querySelector(".win-menu")).not.toBeNull();
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

  it("removes its DOM on dispose", () => {
    const { overlay, parent } = mount();
    overlay.dispose();
    expect(parent.querySelector(".lose-overlay")).toBeNull();
  });
});
