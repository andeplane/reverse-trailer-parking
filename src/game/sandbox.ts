import type { Seconds } from "../engine/math/units";
import type { Clock } from "../engine/loop/clock";
import { createFixedStepLoop } from "../engine/loop/fixed-step-loop";
import type { InputSource } from "../engine/input/input-source";
import type { Renderer } from "../engine/render/renderer";
import { bindSteeringIndicator, steerToRotation } from "./hud/steering-indicator";
import { drivableCar, findCarVariant, type World } from "./vehicle/vehicle-types";
import { stepWorld } from "./vehicle/world";
import { worldToEntities } from "./view/world-view";

const DEFAULT_DT = (1 / 120) as Seconds;

export interface Sandbox {
  /** Advances by an explicit frame duration (ms), or measures it via the clock if omitted. */
  tick(frameMs?: number): void;
  /** Restores the world to its state at sandbox creation. */
  reset(): void;
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
}): Sandbox {
  const { clock, input, renderer, onReset } = args;
  const dt = args.dt ?? DEFAULT_DT;
  const initialWorld = args.world;
  let world = args.world;

  const loop = createFixedStepLoop({ dt, clock });
  const updateSteeringIndicator = args.steeringEl ? bindSteeringIndicator(args.steeringEl) : null;

  function render(): void {
    renderer.sync(worldToEntities(world, world.catalog));
    const drivable = drivableCar(world);
    renderer.follow(drivable.rearAxle);
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

    dispose(): void {
      input.dispose();
      renderer.dispose();
    },
  };
}
