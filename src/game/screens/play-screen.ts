import type { Clock } from "../../engine/loop/clock";
import type { InputSource } from "../../engine/input/input-source";
import { createKeyboardInput } from "../../engine/input/keyboard-input";
import { createTouchInput } from "../../engine/input/touch-input";
import type { Renderer } from "../../engine/render/renderer";
import { createControlsOverlay } from "../hud/controls-overlay";
import { createLoseOverlay, type LoseOverlay } from "../hud/lose-overlay";
import { createWinOverlay, type WinOverlay } from "../hud/win-overlay";
import { healthFraction, isWrecked } from "../vehicle/damage";
import type { Level } from "../level/level-types";
import { levelToWorld } from "../level/level-to-world";
import { applyDebugState, debugStateOf, encodeDebugState, parseDebugState } from "../level/debug-state";
import { hasRigCrossedExit } from "../level/win";
import { rigFootprints } from "../collision/collision-system";
import { createSandbox, type Sandbox } from "../sandbox";
import { drivableCar, toRig, type VariantCatalog } from "../vehicle/vehicle-types";
import type { Vec2 } from "../../engine/math/vec2";
import { fitZoom } from "../view/camera-fit";
import { createPlayCamera } from "./play-camera";
import type { Screen } from "./screen";

function makeSteeringIndicator(parent: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.id = "steering-indicator";
  el.style.backgroundImage = `url(${import.meta.env.BASE_URL}assets/steering-wheel.png)`;
  parent.appendChild(el);
  return el;
}

/**
 * The play screen: drives one level. Builds the world from the level, wires input (touch or
 * keyboard), the steering HUD, a back-to-menu button, and the collision debug toggle, and advances
 * the sandbox each frame.
 */
export function createPlayScreen(args: {
  clock: Clock;
  renderer: Renderer;
  controlsRoot: HTMLElement;
  level: Level;
  catalog: VariantCatalog;
  onExitToMenu: () => void;
  onNextLevel?: () => void;
  /** Win-overlay label for the next action (random levels use "Play another ▸"). */
  nextLabel?: string;
  /** True when this is the last level in the list (win overlay celebrates finishing everything). */
  isLastLevel?: boolean;
  isTouch?: boolean;
}): Screen {
  const { clock, renderer, controlsRoot, level, catalog, onExitToMenu, onNextLevel, isLastLevel } = args;
  const isTouch =
    args.isTouch ?? (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);

  let world = levelToWorld(level, catalog);
  // Reproduce an exact scenario from a pasted debug URL (?dbg=<levelId>&x=..&y=..&h=..).
  const urlState = parseDebugState(window.location.search);
  if (urlState && urlState.levelId === level.id) world = applyDebugState(world, urlState);

  // Free-look camera: still follows the rig, but the player can zoom (wheel/pinch, anchored at
  // the cursor) and pan (drag) an offset on top. Gestures land on a full-screen capture layer
  // below the HUD, so buttons and touch pedals stay clickable on top of it.
  const mapWidth = level.grid.cols * level.grid.tileSize;
  const mapHeight = level.grid.rows * level.grid.tileSize;
  const camera = createPlayCamera({
    minZoom: Math.min(1, fitZoom(mapWidth, mapHeight)),
    maxZoom: 3,
    maxPanRadius: Math.hypot(mapWidth, mapHeight) / 2,
  });
  const capture = document.createElement("div");
  capture.className = "play-capture";
  controlsRoot.appendChild(capture);

  const steeringEl = makeSteeringIndicator(controlsRoot);

  const sandboxRef: { current?: Sandbox } = {};
  let runStart = clock.now();
  const reset = (): void => {
    sandboxRef.current?.reset();
    camera.resetPan(); // the view snaps back to the rig; the chosen zoom is kept
    runStart = clock.now();
  };

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  const timerEl = document.createElement("div");
  timerEl.className = "play-timer";
  controlsRoot.appendChild(timerEl);

  // Health bar: remaining crash budget (impacts drain it; see vehicle/damage.ts).
  const healthEl = document.createElement("div");
  healthEl.className = "play-health";
  const healthFillEl = document.createElement("div");
  healthFillEl.className = "play-health-fill";
  healthEl.appendChild(healthFillEl);
  controlsRoot.appendChild(healthEl);
  function updateHealth(): void {
    const frac = healthFraction(sandbox.getWorld().damage);
    healthFillEl.style.width = `${(frac * 100).toFixed(1)}%`;
    healthEl.classList.toggle("warn", frac < 0.67 && frac >= 0.34);
    healthEl.classList.toggle("danger", frac < 0.34);
  }
  function elapsedSeconds(): number {
    return (clock.now() - runStart) / 1000;
  }
  function updateTimer(): void {
    const text =
      level.parSeconds !== undefined
        ? `${formatTime(elapsedSeconds())} · par ${formatTime(level.parSeconds)}`
        : formatTime(elapsedSeconds());
    if (timerEl.textContent !== text) timerEl.textContent = text;
  }
  updateTimer();

  const disposers: Array<() => void> = [];
  let input: InputSource;
  if (isTouch) {
    const overlay = createControlsOverlay({ parent: controlsRoot });
    overlay.setOnReset(reset);
    input = createTouchInput({ controls: overlay });
    disposers.push(() => overlay.dispose());
  } else {
    input = createKeyboardInput({ target: window, onReset: reset });
  }

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "play-back-button";
  backButton.textContent = "☰ Menu";
  backButton.addEventListener("click", onExitToMenu);
  controlsRoot.appendChild(backButton);

  const restartButton = document.createElement("button");
  restartButton.type = "button";
  restartButton.className = "play-restart-button";
  restartButton.textContent = "↺ Restart";
  restartButton.addEventListener("click", reset);
  controlsRoot.appendChild(restartButton);

  // First-time guidance: state the goal + controls, dismissed by the first input (or 8s).
  const banner = document.createElement("div");
  banner.className = "play-banner";
  const goal = document.createElement("p");
  goal.className = "play-banner-goal";
  goal.textContent = "Back the trailer out through the yellow gate";
  const how = document.createElement("p");
  how.className = "play-banner-controls";
  how.textContent = isTouch
    ? "Pedals drive · right slider steers · pinch zooms"
    : "↑ ↓ drive · ← → steer · R restarts · scroll zooms";
  banner.append(goal, how);
  controlsRoot.appendChild(banner);
  const dismissBanner = (): void => {
    banner.remove();
    window.removeEventListener("keydown", dismissBanner);
    window.removeEventListener("pointerdown", dismissBanner);
  };
  window.addEventListener("keydown", dismissBanner);
  window.addEventListener("pointerdown", dismissBanner);
  const bannerTimer = setTimeout(dismissBanner, 8000);

  const sandbox = createSandbox({
    clock,
    input,
    renderer,
    world,
    steeringEl,
    camera: (rearAxle) => camera.frameFor(rearAxle),
  });
  sandboxRef.current = sandbox;

  // --- Camera gestures on the capture layer -----------------------------
  function rigPosition(): Vec2 {
    return drivableCar(sandbox.getWorld()).rearAxle;
  }
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinchLast: { dist: number; mid: { x: number; y: number } } | null = null;
  let panLast: { x: number; y: number } | null = null;

  function pinchState(): { dist: number; mid: { x: number; y: number } } | null {
    if (activePointers.size < 2) return null;
    const [a, b] = [...activePointers.values()];
    return {
      dist: Math.max(Math.hypot(b!.x - a!.x, b!.y - a!.y), 1),
      mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
    };
  }
  /** Pans so the world point that was under `from` lands under the current client point. */
  function panTo(clientX: number, clientY: number, from: { x: number; y: number }): void {
    const wFrom = renderer.screenToWorld(from.x, from.y);
    const wTo = renderer.screenToWorld(clientX, clientY);
    camera.panBy({ x: wFrom.x - wTo.x, y: wFrom.y - wTo.y });
  }
  const onCapturePointerDown = (pe: PointerEvent): void => {
    // Keep the drag alive even when the pointer crosses HUD elements. Synthetic events
    // (jsdom tests) have no active pointer to capture, hence the guard.
    try {
      capture.setPointerCapture?.(pe.pointerId);
    } catch {
      /* no active pointer */
    }
    activePointers.set(pe.pointerId, { x: pe.clientX, y: pe.clientY });
    if (activePointers.size >= 2) {
      pinchLast = pinchState();
      panLast = null;
    } else {
      panLast = { x: pe.clientX, y: pe.clientY };
    }
  };
  const onCapturePointerMove = (pe: PointerEvent): void => {
    if (!activePointers.has(pe.pointerId)) return;
    activePointers.set(pe.pointerId, { x: pe.clientX, y: pe.clientY });
    const pinch = pinchState();
    if (pinch && pinchLast) {
      panTo(pinch.mid.x, pinch.mid.y, pinchLast.mid);
      camera.zoomAt({
        anchor: renderer.screenToWorld(pinch.mid.x, pinch.mid.y),
        factor: pinch.dist / pinchLast.dist,
        rig: rigPosition(),
      });
      pinchLast = pinch;
    } else if (panLast) {
      panTo(pe.clientX, pe.clientY, panLast);
      panLast = { x: pe.clientX, y: pe.clientY };
    }
  };
  const onCapturePointerEnd = (pe: PointerEvent): void => {
    activePointers.delete(pe.pointerId);
    if (activePointers.size < 2) pinchLast = null;
    const remaining = [...activePointers.values()];
    panLast = remaining.length === 1 ? { ...remaining[0]! } : null;
  };
  const onCaptureWheel = (we: WheelEvent): void => {
    we.preventDefault();
    camera.zoomAt({
      anchor: renderer.screenToWorld(we.clientX, we.clientY),
      factor: Math.exp(-we.deltaY * 0.0015),
      rig: rigPosition(),
    });
  };
  capture.addEventListener("pointerdown", onCapturePointerDown);
  capture.addEventListener("pointermove", onCapturePointerMove);
  capture.addEventListener("pointerup", onCapturePointerEnd);
  capture.addEventListener("pointercancel", onCapturePointerEnd);
  capture.addEventListener("wheel", onCaptureWheel, { passive: false });

  const recenterButton = document.createElement("button");
  recenterButton.type = "button";
  recenterButton.className = "play-recenter-button";
  recenterButton.textContent = "⌖";
  recenterButton.title = "Recenter camera";
  recenterButton.addEventListener("click", () => camera.reset());
  controlsRoot.appendChild(recenterButton);

  // Screen-edge arrow pointing at the exit when the follow-camera has it off-screen.
  const exitArrow = document.createElement("div");
  exitArrow.className = "play-exit-arrow";
  exitArrow.textContent = "➤";
  controlsRoot.appendChild(exitArrow);
  function updateExitArrow(): void {
    const exit = world.exit;
    if (!exit) return;
    const mid = renderer.worldToScreen({ x: (exit.a.x + exit.b.x) / 2, y: (exit.a.y + exit.b.y) / 2 });
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const offScreen = mid.x < 0 || mid.x > vw || mid.y < 0 || mid.y > vh;
    exitArrow.classList.toggle("visible", offScreen);
    if (!offScreen) return;
    const margin = 30;
    const x = Math.min(vw - margin, Math.max(margin, mid.x));
    const y = Math.min(vh - margin, Math.max(margin, mid.y));
    const angle = Math.atan2(mid.y - y, mid.x - x);
    exitArrow.style.left = `${x}px`;
    exitArrow.style.top = `${y}px`;
    exitArrow.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  }

  // When debug is on, keep the URL in sync with the rig's exact state so it can be copied and
  // pasted back to reproduce the scenario.
  function writeDebugUrl(): void {
    history.replaceState(null, "", encodeDebugState(debugStateOf(sandbox.getWorld(), level.id)));
  }
  function clearDebugUrl(): void {
    history.replaceState(null, "", window.location.pathname);
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "d" || e.key === "D") {
      const on = !sandbox.isDebug();
      sandbox.setDebug(on);
      if (on) writeDebugUrl();
      else clearDebugUrl();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  let framesSinceUrlWrite = 0;

  let winOverlay: WinOverlay | null = null;
  let loseOverlay: LoseOverlay | null = null;

  function checkLose(): void {
    if (!isWrecked(sandbox.getWorld().damage)) return;
    loseOverlay = createLoseOverlay({
      parent: controlsRoot,
      levelName: level.name,
      onRetry: () => {
        loseOverlay?.dispose();
        loseOverlay = null;
        reset();
        updateHealth();
      },
      onMenu: onExitToMenu,
    });
  }

  function checkWin(): void {
    const world = sandbox.getWorld();
    if (!world.exit) return;
    const footprints = rigFootprints(toRig(drivableCar(world)), catalog);
    if (!hasRigCrossedExit(footprints, world.exit)) return;
    const timeText =
      level.parSeconds !== undefined
        ? `Time ${formatTime(elapsedSeconds())} · par ${formatTime(level.parSeconds)}`
        : `Time ${formatTime(elapsedSeconds())}`;
    winOverlay = createWinOverlay({
      parent: controlsRoot,
      levelName: level.name,
      timeText,
      isLastLevel: isLastLevel ?? false,
      ...(onNextLevel ? { onNext: onNextLevel } : {}),
      ...(args.nextLabel !== undefined ? { nextLabel: args.nextLabel } : {}),
      onRetry: () => {
        winOverlay?.dispose();
        winOverlay = null;
        sandbox.reset();
      },
      onMenu: onExitToMenu,
    });
  }

  return {
    tick(frameMs?: number): void {
      if (winOverlay || loseOverlay) return; // frozen after win/loss until Retry/Next/Menu
      recenterButton.classList.toggle("visible", camera.isAdjusted());
      updateTimer();
      sandbox.tick(frameMs);
      updateExitArrow();
      updateHealth();
      if (sandbox.isDebug() && ++framesSinceUrlWrite >= 20) {
        framesSinceUrlWrite = 0;
        writeDebugUrl();
      }
      checkWin();
      if (!winOverlay) checkLose();
    },
    dispose(): void {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(bannerTimer);
      dismissBanner();
      if (sandbox.isDebug()) clearDebugUrl();
      winOverlay?.dispose();
      loseOverlay?.dispose();
      for (const d of disposers) d();
      backButton.remove();
      restartButton.remove();
      timerEl.remove();
      healthEl.remove();
      exitArrow.remove();
      steeringEl.remove();
      capture.remove();
      recenterButton.remove();
      renderer.setCamera({ x: 0, y: 0 }, 1); // don't leak play zoom/pan into the next screen
      sandbox.dispose();
    },
  };
}
