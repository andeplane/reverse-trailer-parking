import type { Seconds } from "../engine/math/units";
import type { Vec2 } from "../engine/math/vec2";
import type { Clock } from "../engine/loop/clock";
import { createFixedStepLoop } from "../engine/loop/fixed-step-loop";
import type { InputSource } from "../engine/input/input-source";
import type { Renderer } from "../engine/render/renderer";
import { bindSteeringIndicator, steerToRotation } from "./hud/steering-indicator";
import { drivableCar, findCarVariant, type World } from "./vehicle/vehicle-types";
import { stepWorld } from "./vehicle/world";
import { worldToEntities } from "./view/world-view";
import { worldToDebugEntities } from "./view/debug-view";

/** The game's fixed simulation timestep — shared so offline simulation (e.g. the random-level
 * generator's drive-in and verification replay) steps with exactly the play-time physics. */
export const PLAY_DT = (1 / 120) as Seconds;

export interface Sandbox {
  /** Advances by an explicit frame duration (ms), or measures it via the clock if omitted. */
  tick(frameMs?: number): void;
  /** Restores the world to its state at sandbox creation. */
  reset(): void;
  /** The current (post-step) world — e.g. for win detection. */
  getWorld(): World;
  /** Toggles the collision-geometry debug overlay. */
  setDebug(enabled: boolean): void;
  isDebug(): boolean;
  dispose(): void;
}

export function createSandbox(args: {
  clock: Clock;
  input: InputSource;
  renderer: Renderer;
  world: World;
  dt?: Seconds;
  steeringEl?: HTMLElement;
  onReset?: () => void;
  /** Overrides the default rig-follow camera (e.g. the play screen's free-look camera). */
  camera?: (rearAxle: Vec2) => { center: Vec2; zoom: number };
}): Sandbox {
  const { clock, input, renderer, onReset, camera } = args;
  const dt = args.dt ?? PLAY_DT;
  const initialWorld = args.world;
  let world = args.world;

  const loop = createFixedStepLoop({ dt, clock });
  const updateSteeringIndicator = args.steeringEl ? bindSteeringIndicator(args.steeringEl) : null;
  let debugEnabled = false;

  function render(): void {
    const entities = worldToEntities(world, world.catalog);
    const withDebug = debugEnabled ? [...entities, ...worldToDebugEntities(world, world.catalog)] : entities;
    renderer.sync(withDebug);
    const drivable = drivableCar(world);
    if (camera) {
      const frame = camera(drivable.rearAxle);
      renderer.setCamera(frame.center, frame.zoom);
    } else {
      renderer.follow(drivable.rearAxle);
    }
    if (updateSteeringIndicator) {
      const variant = findCarVariant(world.catalog, drivable.variantId);
      updateSteeringIndicator(steerToRotation(drivable.steer, variant.steerMax));
    }
  }

  return {
    tick(frameMs?: number): void {
      const { steps } = loop.advance(frameMs);
      for (let i = 0; i < steps; i++) {
        world = stepWorld({ world, input: input.read(), dt });
      }
      render();
    },

    reset(): void {
      world = initialWorld;
      onReset?.();
      render();
    },

    getWorld(): World {
      return world;
    },

    setDebug(enabled: boolean): void {
      debugEnabled = enabled;
      render();
    },

    isDebug(): boolean {
      return debugEnabled;
    },

    dispose(): void {
      input.dispose();
      renderer.dispose();
    },
  };
}
