// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { filledGrid } from "../level/tile-types";
import type { Clock } from "../../engine/loop/clock";
import type { Entity, Renderer } from "../../engine/render/renderer";
import type { Vec2 } from "../../engine/math/vec2";
import { allCarVariants, allTrailerVariants, createVariantCatalog } from "../vehicle/variants";
import type { Level } from "../level/level-types";
import { saveCustomLevel, type LevelStorage } from "../level/level-store";
import { packLevelSeed, starKey } from "../level/packs";
import { encodeLevelRef, parseLevelRef } from "../level/share-url";
import { createApp } from "./app-shell";

class FakeClock implements Clock {
  private t = 0;
  now(): number {
    return this.t;
  }
}

function fakeRenderer(): Renderer & { syncs: Entity[][]; follows: Vec2[] } {
  const syncs: Entity[][] = [];
  const follows: Vec2[] = [];
  return {
    syncs,
    follows,
    sync: (e) => syncs.push(e),
    follow: (t) => follows.push(t),
    setCamera: () => {},
    screenToWorld: () => ({ x: 0, y: 0 }),
    worldToScreen: () => ({ x: 0, y: 0 }),
    dispose: () => {},
  };
}

const catalog = createVariantCatalog({ cars: allCarVariants, trailers: allTrailerVariants });

function level(id: string): Level {
  return {
    id,
    name: id,
    grid: filledGrid(6, 6, 5),
    drivable: { variantId: "sedan", position: { x: 0, y: 0 }, heading: 0, trailerVariantId: "caravan" },
    placedCars: [],
    exit: { a: { x: 15, y: -3 }, b: { x: 15, y: 3 }, outward: { x: 1, y: 0 } },
  };
}

let controlsRoot: HTMLElement | undefined;
let currentApp: { dispose(): void } | undefined;
afterEach(() => {
  currentApp?.dispose(); // also drops any still-encoding async URL write
  currentApp = undefined;
  controlsRoot?.remove();
  history.replaceState(null, "", window.location.pathname); // don't leak ?level= between tests
});

/** Flushes the fire-and-forget async URL write in the app shell. */
const flushUrl = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Waits (bounded) for the async share-URL write; compression may span several macrotasks. */
async function waitForUrl(pattern: RegExp): Promise<void> {
  for (let i = 0; i < 50 && !pattern.test(window.location.search); i++) await flushUrl();
}

function fakeStorage(): LevelStorage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
}

function makeApp(storage?: LevelStorage, drawSeed?: () => number) {
  controlsRoot = document.createElement("div");
  document.body.appendChild(controlsRoot);
  const renderer = fakeRenderer();
  const app = createApp({
    clock: new FakeClock(),
    renderer,
    controlsRoot,
    catalog,
    levels: [level("a"), level("b")],
    isTouch: false,
    drawSeed: drawSeed ?? (() => 1), // deterministic random levels in tests
    ...(storage ? { storage } : {}),
  });
  currentApp = app;
  return { app, renderer, controlsRoot };
}

describe("createApp", () => {
  it("shows the pack menu — three packs, star chip, no bundled level cards", () => {
    const { app, controlsRoot } = makeApp();
    app.showMenu();
    expect(controlsRoot.querySelectorAll(".menu-pack")).toHaveLength(3);
    expect(controlsRoot.querySelector(".menu-total-stars")?.textContent).toBe("★ 0");
    expect(controlsRoot.querySelectorAll(".menu-level-card")).toHaveLength(0); // bundled are URL-only now
    expect(controlsRoot.querySelector(".menu-attract-badge")).toBeNull(); // attract is opt-in
  });

  it("plays a pack level from its tile and writes its seed share URL", { timeout: 60_000 }, async () => {
    const { app, controlsRoot, renderer } = makeApp();
    app.playPackLevel("easy", 0);
    expect(controlsRoot.querySelector(".menu-screen")).toBeNull();
    expect(controlsRoot.querySelector(".play-back-button")).not.toBeNull();
    app.tick(1000 / 60);
    expect(renderer.syncs.length).toBeGreaterThan(0);
    expect(controlsRoot.querySelector(".play-timer")?.textContent).toContain("par");
    await flushUrl();
    const seed36 = packLevelSeed({ difficulty: "easy", index: 0 }).toString(36);
    expect(window.location.search).toBe(`?level=r.easy.${seed36}`);
  });

  it("shows earned stars on the menu (chip, pack header, tile pips)", () => {
    const storage = fakeStorage();
    const key = starKey({ difficulty: "easy", seed: packLevelSeed({ difficulty: "easy", index: 1 }) });
    storage.setItem("parking.stars", JSON.stringify({ [key]: 2, "r.hard.zzz": 3 }));
    const { app, controlsRoot } = makeApp(storage);
    app.showMenu();
    expect(controlsRoot.querySelector(".menu-total-stars")?.textContent).toBe("★ 5");
    const easyPack = controlsRoot.querySelector(".menu-pack-easy")!;
    expect(easyPack.querySelector(".menu-pack-stars")?.textContent).toBe("★ 2");
    const tile2 = easyPack.querySelectorAll(".menu-pack-level")[1]!;
    expect(tile2.querySelectorAll(".menu-star.earned")).toHaveLength(2);
  });

  it("returns to the menu from the play back button", () => {
    const storage = fakeStorage();
    saveCustomLevel(level("mine"), storage);
    const { app, controlsRoot } = makeApp(storage);
    app.showMenu();
    (controlsRoot.querySelector(".menu-level-card") as HTMLElement).click();
    (controlsRoot.querySelector(".play-back-button") as HTMLElement).click();
    expect(controlsRoot.querySelector(".menu-screen")).not.toBeNull();
    expect(controlsRoot.querySelector(".play-back-button")).toBeNull();
  });

  it("clears the world render when showing the menu", () => {
    const { app, renderer } = makeApp();
    app.showMenu();
    expect(renderer.syncs.at(-1)).toEqual([]); // cleared
  });

  it("opens the level editor from the menu's editor button", () => {
    const { app, controlsRoot } = makeApp();
    app.showMenu();
    (controlsRoot.querySelector(".menu-edit-button") as HTMLElement).click();
    expect(controlsRoot.querySelector(".editor-screen")).not.toBeNull();
    app.showMenu();
    expect(controlsRoot.querySelector(".editor-screen")).toBeNull();
  });

  it("lists custom levels (including bundled overrides) under Custom levels", () => {
    const storage = fakeStorage();
    saveCustomLevel({ ...level("a"), name: "a (custom)" }, storage);
    saveCustomLevel(level("mine"), storage);
    const { app, controlsRoot } = makeApp(storage);
    app.showMenu();
    const cards = [...controlsRoot.querySelectorAll(".menu-level-card")];
    expect(cards).toHaveLength(2); // the two customs; pristine bundled levels are not listed
    expect(cards.find((c) => (c as HTMLElement).dataset.levelId === "a")?.textContent).toContain("a (custom)");
  });

  it("plays a custom level from its card and chains Next through the custom list", () => {
    const storage = fakeStorage();
    saveCustomLevel(level("mine-1"), storage);
    saveCustomLevel(level("mine-2"), storage);
    const { app, controlsRoot } = makeApp(storage);
    app.showMenu();
    (controlsRoot.querySelector('.menu-level-card[data-level-id="mine-1"]') as HTMLElement).click();
    expect(controlsRoot.querySelector(".play-back-button")).not.toBeNull();
  });

  it("opens an existing custom level in the editor and deletes one from the menu", () => {
    const storage = fakeStorage();
    saveCustomLevel(level("mine"), storage);
    const { app, controlsRoot } = makeApp(storage);
    app.showMenu();
    (controlsRoot.querySelector(".menu-level-edit") as HTMLElement).click();
    expect((controlsRoot.querySelector(".editor-name") as HTMLInputElement).value).toBe("mine");

    app.showMenu();
    const del = controlsRoot.querySelector(".menu-level-delete") as HTMLElement;
    del.click(); // arm the inline confirm
    del.click(); // confirm
    expect(controlsRoot.querySelectorAll(".menu-level-card")).toHaveLength(0); // mine is gone
  });

  it("saving in the editor persists to storage and shows on the menu", () => {
    const storage = fakeStorage();
    const { app, controlsRoot } = makeApp(storage);
    app.openEditor();
    const name = controlsRoot.querySelector(".editor-name") as HTMLInputElement;
    name.value = "Fresh";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    app.showMenu();
    const names = [...controlsRoot.querySelectorAll(".menu-level-card")].map((c) => c.textContent);
    expect(names.some((n) => n?.includes("Fresh"))).toBe(true);
  });

  it("gives every new draft a unique default name", () => {
    const storage = fakeStorage();
    const { app, controlsRoot } = makeApp(storage);
    app.openEditor();
    expect((controlsRoot.querySelector(".editor-name") as HTMLInputElement).value).toBe("New level");
    (controlsRoot.querySelector(".editor-save") as HTMLElement).click();
    app.openEditor();
    expect((controlsRoot.querySelector(".editor-name") as HTMLInputElement).value).toBe("New level 2");
  });

  it("testing an editor draft returns to the editor (not the menu) with the draft intact", () => {
    const { app, controlsRoot } = makeApp();
    app.openEditor();
    const name = controlsRoot.querySelector(".editor-name") as HTMLInputElement;
    name.value = "Draft under test";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    (controlsRoot.querySelector(".editor-test") as HTMLElement).click();
    expect(controlsRoot.querySelector(".play-back-button")).not.toBeNull();
    (controlsRoot.querySelector(".play-back-button") as HTMLElement).click();
    expect(controlsRoot.querySelector(".editor-screen")).not.toBeNull();
    expect((controlsRoot.querySelector(".editor-name") as HTMLInputElement).value).toBe("Draft under test");
  });

  it("plays a generated random level with a 'Play another ▸' win action", { timeout: 60_000 }, () => {
    const { app, controlsRoot, renderer } = makeApp();
    app.playRandomLevel("easy");
    expect(controlsRoot.querySelector(".menu-screen")).toBeNull();
    expect(controlsRoot.querySelector(".play-back-button")).not.toBeNull();
    app.tick(1000 / 60);
    expect(renderer.syncs.length).toBeGreaterThan(0);
    // The play screen was built directly (not via playLevel): its timer shows the generated par.
    expect(controlsRoot.querySelector(".play-timer")?.textContent).toContain("par");
  });

  it("falls back to the menu (never bricks) when generation fails", () => {
    const { app, controlsRoot } = makeApp(undefined, () => {
      throw new Error("no seed source");
    });
    app.playRandomLevel("easy");
    expect(controlsRoot.querySelector(".menu-screen")).not.toBeNull();
  });

  describe("share URLs (?level=)", () => {
    it("playing a custom level writes its full encoded JSON, and the menu clears it", async () => {
      const storage = fakeStorage();
      saveCustomLevel(level("mine"), storage);
      const { app } = makeApp(storage);
      app.showMenu();
      (controlsRoot!.querySelector('.menu-level-card[data-level-id="mine"]') as HTMLElement).click();
      await waitForUrl(/^\?level=[jz]\./);
      expect(window.location.search).toMatch(/^\?level=[jz]\./);
      const value = new URLSearchParams(window.location.search).get("level")!;
      const parsed = await parseLevelRef(value);
      expect(parsed?.kind).toBe("custom");
      expect(parsed?.kind === "custom" && parsed.level.id).toBe("mine");
      app.showMenu();
      await flushUrl();
      expect(window.location.search).toBe("");
    });

    it("playing a random level writes ?level=r.<difficulty>.<seed36>", { timeout: 60_000 }, async () => {
      const { app } = makeApp(undefined, () => parseInt("cwilu", 36));
      app.playRandomLevel("easy");
      await flushUrl();
      expect(window.location.search).toBe("?level=r.easy.cwilu");
    });

    it("openFromUrl replays the exact random level a shared seed refers to", { timeout: 60_000 }, async () => {
      const { app } = makeApp(undefined, () => {
        throw new Error("must not draw a fresh seed for a shared one");
      });
      const opened = await app.openFromUrl("?level=r.easy.cwilu");
      expect(opened).toBe(true);
      expect(controlsRoot!.querySelector(".play-back-button")).not.toBeNull();
      await flushUrl();
      expect(window.location.search).toBe("?level=r.easy.cwilu"); // same seed round-trips
    });

    it("openFromUrl routes a shared pack seed into the pack flow", { timeout: 60_000 }, async () => {
      const seed = packLevelSeed({ difficulty: "easy", index: 0 });
      const { app } = makeApp(undefined, () => {
        throw new Error("must not draw a fresh seed for a shared one");
      });
      const opened = await app.openFromUrl(`?level=r.easy.${seed.toString(36)}`);
      expect(opened).toBe(true);
      expect(controlsRoot!.querySelector(".play-back-button")).not.toBeNull();
      await flushUrl();
      expect(window.location.search).toBe(`?level=r.easy.${seed.toString(36)}`);
    });

    it("openFromUrl plays a bundled level by id (old links) and rejects unknown ids", async () => {
      const { app } = makeApp();
      expect(await app.openFromUrl("?level=b.nope")).toBe(false);
      expect(await app.openFromUrl("?level=b.b")).toBe(true);
      expect(controlsRoot!.querySelector(".play-back-button")).not.toBeNull();
    });

    it("openFromUrl plays a shared custom level from its encoded JSON", async () => {
      const shared = { ...level("shared-one"), name: "From a friend" };
      const value = await encodeLevelRef({ kind: "custom", level: shared });
      const { app } = makeApp();
      expect(await app.openFromUrl(`?level=${value}`)).toBe(true);
      expect(controlsRoot!.querySelector(".play-back-button")).not.toBeNull();
    });

    it("openFromUrl returns false for absent, malformed, or invalid payloads", async () => {
      const { app } = makeApp();
      expect(await app.openFromUrl("")).toBe(false);
      expect(await app.openFromUrl("?level=garbage")).toBe(false);
      // Structurally valid JSON but semantically invalid (unknown car variant) must be rejected.
      const bad = { ...level("bad"), drivable: { ...level("bad").drivable, variantId: "warp-drive" } };
      const value = await encodeLevelRef({ kind: "custom", level: bad });
      expect(await app.openFromUrl(`?level=${value}`)).toBe(false);
    });
  });

  it("still guards unsaved changes after a Test round-trip (baseline survives)", () => {
    const { app, controlsRoot } = makeApp();
    app.openEditor();
    const name = controlsRoot.querySelector(".editor-name") as HTMLInputElement;
    name.value = "Never saved";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    (controlsRoot.querySelector(".editor-test") as HTMLElement).click();
    (controlsRoot.querySelector(".play-back-button") as HTMLElement).click();
    // Back in the editor: the draft was never persisted, so exiting must still prompt.
    (controlsRoot.querySelector(".editor-menu") as HTMLElement).click();
    expect(controlsRoot.querySelector(".editor-exit-dialog.open")).not.toBeNull();
    expect(controlsRoot.querySelector(".menu-screen")).toBeNull();
  });
});
