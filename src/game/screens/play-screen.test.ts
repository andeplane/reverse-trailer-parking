// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { filledGrid } from "../level/tile-types";
import type { Clock } from "../../engine/loop/clock";
import type { Entity, Renderer } from "../../engine/render/renderer";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import type { Level } from "../level/level-types";
import { createPlayScreen } from "./play-screen";

class FakeClock implements Clock {
  private t = 0;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

type CameraCall = { center: { x: number; y: number }; zoom: number };

function fakeRenderer(): Renderer & { cameraCalls: CameraCall[] } {
  const cameraCalls: CameraCall[] = [];
  return {
    cameraCalls,
    sync: (_e: Entity[]) => {},
    follow: () => {},
    setCamera: (center, zoom) => {
      cameraCalls.push({ center, zoom });
    },
    // Linear screen↔world mapping (32 px/m, y flipped) so camera-gesture math is exercised.
    screenToWorld: (clientX, clientY) => ({ x: clientX / 32, y: -clientY / 32 }),
    worldToScreen: () => ({ x: 0, y: 0 }),
    dispose: () => {},
  };
}

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function level(exit: Level["exit"]): Level {
  return {
    id: "t",
    name: "Test Level",
    grid: filledGrid(12, 12, 5),
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [],
    exit,
    parSeconds: 60,
  };
}

let controlsRoot: HTMLElement | undefined;
afterEach(() => controlsRoot?.remove());

function mount(lvl: Level, onExitToMenu = () => {}, onNextLevel?: () => void, onStars?: (stars: number) => void) {
  controlsRoot = document.createElement("div");
  document.body.appendChild(controlsRoot);
  const renderer = fakeRenderer();
  const screen = createPlayScreen({
    clock: new FakeClock(),
    renderer,
    controlsRoot,
    level: lvl,
    catalog,
    onExitToMenu,
    isTouch: false,
    ...(onNextLevel ? { onNextLevel } : {}),
    ...(onStars ? { onStars } : {}),
  });
  return { screen, controlsRoot, renderer };
}

describe("createPlayScreen", () => {
  it("mounts a steering indicator, back-to-menu and restart buttons, and a goal banner", () => {
    const { controlsRoot } = mount(level({ a: { x: 30, y: -3 }, b: { x: 30, y: 3 }, outward: { x: 1, y: 0 } }));
    expect(controlsRoot.querySelector("#steering-indicator")).not.toBeNull();
    expect(controlsRoot.querySelector(".play-back-button")).not.toBeNull();
    expect(controlsRoot.querySelector(".play-restart-button")).not.toBeNull();
    expect(controlsRoot.querySelector(".play-banner")?.textContent).toContain("yellow gate");
  });

  it("shows a run timer with par, and the final time on the win overlay", () => {
    const won = mount(level({ a: { x: 5, y: -30 }, b: { x: 5, y: 30 }, outward: { x: -1, y: 0 } }));
    expect(won.controlsRoot.querySelector(".play-timer")?.textContent).toContain("par 1:00");
    won.screen.tick(1000 / 60);
    expect(won.controlsRoot.querySelector(".win-time")?.textContent).toMatch(/^Time \d+:\d\d · par 1:00$/);
  });

  it("dismisses the goal banner on the first input", () => {
    const { controlsRoot } = mount(level({ a: { x: 30, y: -3 }, b: { x: 30, y: 3 }, outward: { x: 1, y: 0 } }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(controlsRoot.querySelector(".play-banner")).toBeNull();
  });

  it("does not win while the rig is still short of the exit", () => {
    const { screen, controlsRoot } = mount(
      level({ a: { x: 30, y: -3 }, b: { x: 30, y: 3 }, outward: { x: 1, y: 0 } }),
    );
    screen.tick(1000 / 60);
    expect(controlsRoot.querySelector(".win-overlay")).toBeNull();
  });

  it("shows the win overlay once the rig is fully past the exit", () => {
    // Exit at x=5 facing back (-x): the rig spawned at the origin is already entirely past it.
    const { screen, controlsRoot } = mount(
      level({ a: { x: 5, y: -30 }, b: { x: 5, y: 30 }, outward: { x: -1, y: 0 } }),
    );
    screen.tick(1000 / 60);
    expect(controlsRoot.querySelector(".win-overlay")).not.toBeNull();
  });

  it("wires the Menu button on the win overlay", () => {
    let toMenu = 0;
    const { screen, controlsRoot } = mount(
      level({ a: { x: 5, y: -30 }, b: { x: 5, y: 30 }, outward: { x: -1, y: 0 } }),
      () => (toMenu += 1),
    );
    screen.tick(1000 / 60);
    (controlsRoot.querySelector(".win-menu") as HTMLElement).click();
    expect(toMenu).toBe(1);
  });

  it("shows a Next button when a next level is available", () => {
    const { screen, controlsRoot } = mount(
      level({ a: { x: 5, y: -30 }, b: { x: 5, y: 30 }, outward: { x: -1, y: 0 } }),
      () => {},
      () => {},
    );
    screen.tick(1000 / 60);
    expect(controlsRoot.querySelector(".win-next")).not.toBeNull();
  });

  it("reports and displays stars on a tracked win (instant finish under par → 3)", () => {
    const reported: number[] = [];
    const { screen, controlsRoot } = mount(
      level({ a: { x: 5, y: -30 }, b: { x: 5, y: 30 }, outward: { x: -1, y: 0 } }),
      () => {},
      undefined,
      (stars) => reported.push(stars),
    );
    screen.tick(1000 / 60);
    expect(reported).toEqual([3]);
    expect(controlsRoot.querySelectorAll(".win-star.earned")).toHaveLength(3);
  });

  it("shows no stars row on an untracked win (no onStars)", () => {
    const { screen, controlsRoot } = mount(
      level({ a: { x: 5, y: -30 }, b: { x: 5, y: 30 }, outward: { x: -1, y: 0 } }),
    );
    screen.tick(1000 / 60);
    expect(controlsRoot.querySelector(".win-overlay")).not.toBeNull();
    expect(controlsRoot.querySelector(".win-stars")).toBeNull();
  });

  it("freezes the sim after winning (no further ticks advance it)", () => {
    const { screen, controlsRoot } = mount(
      level({ a: { x: 5, y: -30 }, b: { x: 5, y: 30 }, outward: { x: -1, y: 0 } }),
    );
    screen.tick(1000 / 60);
    const overlays = controlsRoot.querySelectorAll(".win-overlay").length;
    screen.tick(1000 / 60); // should not add a second overlay
    expect(controlsRoot.querySelectorAll(".win-overlay").length).toBe(overlays);
  });

  it("mounts a full health bar", () => {
    const { controlsRoot } = mount(level({ a: { x: 30, y: -3 }, b: { x: 30, y: 3 }, outward: { x: 1, y: 0 } }));
    expect(controlsRoot.querySelector(".play-health")).not.toBeNull();
    expect(controlsRoot.querySelector(".play-health-fill")).not.toBeNull();
  });

  it("shows the lose overlay after wrecking, and Retry restores a fresh run", () => {
    // Exit gap on the +x wall but far off the drive path, so full throttle ahead hits the wall
    // head-on at top speed (8 m/s → 256 damage points ≥ 100) instead of escaping through the gate.
    const { screen, controlsRoot } = mount(
      level({ a: { x: 30, y: 20 }, b: { x: 30, y: 26 }, outward: { x: 1, y: 0 } }),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    for (let i = 0; i < 3000 && !controlsRoot.querySelector(".lose-overlay"); i++) {
      screen.tick(1000 / 60);
    }
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp" }));
    expect(controlsRoot.querySelector(".lose-overlay .lose-title")?.textContent).toContain("Wrecked");
    expect(controlsRoot.querySelector(".win-overlay:not(.lose-overlay)")).toBeNull(); // lost, not won

    const fill = controlsRoot.querySelector(".play-health-fill") as HTMLElement;
    expect(parseFloat(fill.style.width)).toBe(0); // health pool emptied by the crash

    (controlsRoot.querySelector(".lose-overlay .win-retry") as HTMLElement).click();
    expect(controlsRoot.querySelector(".lose-overlay")).toBeNull();
    expect(parseFloat(fill.style.width)).toBe(100); // fresh run, full health again
    screen.tick(1000 / 60); // ticking resumes without the overlay coming back
    expect(controlsRoot.querySelector(".lose-overlay")).toBeNull();
  });

  describe("free-look camera", () => {
    const away = () => level({ a: { x: 30, y: -3 }, b: { x: 30, y: 3 }, outward: { x: 1, y: 0 } });
    const capture = (root: HTMLElement) => root.querySelector(".play-capture") as HTMLElement;
    const recenter = (root: HTMLElement) => root.querySelector(".play-recenter-button") as HTMLElement;
    const pointer = (type: string, id: number, x: number, y: number): Event => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
      Object.defineProperty(e, "pointerId", { value: id });
      return e;
    };

    it("mounts a gesture-capture layer and a hidden recenter button", () => {
      const { screen, controlsRoot } = mount(away());
      expect(capture(controlsRoot)).not.toBeNull();
      screen.tick(1000 / 60);
      expect(recenter(controlsRoot).classList.contains("visible")).toBe(false);
    });

    it("wheel-zooms in about the cursor and recenter restores the follow view", () => {
      const { screen, controlsRoot, renderer } = mount(away());
      screen.tick(1000 / 60);
      expect(renderer.cameraCalls.at(-1)?.zoom).toBe(1);

      capture(controlsRoot).dispatchEvent(
        new WheelEvent("wheel", { deltaY: -200, clientX: 100, clientY: 100, cancelable: true }),
      );
      screen.tick(1000 / 60);
      expect(renderer.cameraCalls.at(-1)?.zoom).toBeGreaterThan(1);
      expect(recenter(controlsRoot).classList.contains("visible")).toBe(true);

      recenter(controlsRoot).click();
      screen.tick(1000 / 60);
      expect(renderer.cameraCalls.at(-1)?.zoom).toBe(1);
      expect(recenter(controlsRoot).classList.contains("visible")).toBe(false);
    });

    it("drag pans the view and Restart snaps it back to the rig", () => {
      const { screen, controlsRoot, renderer } = mount(away());
      const cap = capture(controlsRoot);
      screen.tick(1000 / 60);
      const centreBefore = renderer.cameraCalls.at(-1)!.center;

      cap.dispatchEvent(pointer("pointerdown", 1, 100, 100));
      cap.dispatchEvent(pointer("pointermove", 1, 150, 100)); // drag right → view shifts left
      cap.dispatchEvent(pointer("pointerup", 1, 150, 100));
      screen.tick(1000 / 60);
      const panned = renderer.cameraCalls.at(-1)!.center;
      expect(panned.x).toBeCloseTo(centreBefore.x - 50 / 32);
      expect(panned.y).toBeCloseTo(centreBefore.y);

      (controlsRoot.querySelector(".play-restart-button") as HTMLElement).click();
      screen.tick(1000 / 60);
      expect(renderer.cameraCalls.at(-1)!.center).toEqual(centreBefore);
    });

    it("two-finger pinch zooms about the midpoint", () => {
      const { screen, controlsRoot, renderer } = mount(away());
      const cap = capture(controlsRoot);
      screen.tick(1000 / 60);

      cap.dispatchEvent(pointer("pointerdown", 1, 100, 100));
      cap.dispatchEvent(pointer("pointerdown", 2, 200, 100));
      cap.dispatchEvent(pointer("pointermove", 2, 300, 100)); // spread → distance doubles
      screen.tick(1000 / 60);
      expect(renderer.cameraCalls.at(-1)?.zoom).toBeCloseTo(2);

      cap.dispatchEvent(pointer("pointerup", 2, 300, 100));
      cap.dispatchEvent(pointer("pointerup", 1, 100, 100));
    });
  });

  it("cleans up DOM on dispose", () => {
    const { screen, controlsRoot } = mount(level({ a: { x: 30, y: -3 }, b: { x: 30, y: 3 }, outward: { x: 1, y: 0 } }));
    screen.dispose();
    expect(controlsRoot.querySelector("#steering-indicator")).toBeNull();
    expect(controlsRoot.querySelector(".play-back-button")).toBeNull();
    expect(controlsRoot.querySelector(".play-capture")).toBeNull();
    expect(controlsRoot.querySelector(".play-recenter-button")).toBeNull();
  });
});
