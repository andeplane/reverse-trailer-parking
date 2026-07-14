# Contract: Engine Interfaces (`src/engine/`)

The seams the game depends on. Production code depends on these **interfaces**, never on
concrete classes or Phaser directly. Tests inject typed fakes (no `as unknown as T`).

## `Clock` — `src/engine/loop/clock.ts`
```ts
interface Clock { now(): number; } // ms, monotonic
```
- Real impl `performanceClock` wraps `performance.now()`.
- Tests inject a `FakeClock` with a settable time. **No module calls `performance.now()`
  directly** (DI rule).

## `FixedStepLoop` — `src/engine/loop/fixed-step-loop.ts`
```ts
interface FixedStepLoop {
  advance(frameMs: number): { steps: number; alpha: number }; // # fixed steps + interp fraction
}
function createFixedStepLoop(args: { dt: Seconds; clock: Clock; maxCatchUp?: number }): FixedStepLoop;
```
- Accumulator: converts variable frame time into a whole number of fixed `dt` steps, caps
  catch-up to avoid spirals, exposes `alpha` for render interpolation.
- Fully testable with `FakeClock` + scripted `frameMs` values.

## `InputSource` — `src/engine/input/input-source.ts`
```ts
interface InputSource {
  read(): ControlInput; // current player intent, normalised [-1,1]
  dispose(): void;      // detach listeners
}
```
- `createKeyboardInput(args: { target: EventTarget; steerRate?: number }): InputSource`
  — ↑/↓ → throttle; ←/→ ramp/recenter steer.
- `createTouchInput(args: { overlay: ControlsOverlay }): InputSource`
  — reads DOM buttons + right-side steering slider (multi-touch).
- Adapters clamp to `[-1, 1]`. Both are unit-testable (jsdom events → asserted `ControlInput`).

## `Renderer` — `src/engine/render/renderer.ts`
```ts
interface Renderer {
  sync(entities: Entity[]): void;        // create/update/remove sprites to match
  follow(target: Vec2): void;            // camera follow point
  dispose(): void;
}
```
- Engine-generic: knows only `Entity` (id/texture/position/rotation), no game types.

## `PhaserSurface` — `src/engine/render/phaser-surface.ts`
```ts
interface PhaserSurface {
  addSprite(id: string, texture: string): void;
  setTransform(id: string, x: number, y: number, rotation: number): void;
  removeSprite(id: string): void;
  centerCamera(x: number, y: number): void;
}
```
- The **only** surface `phaser-renderer.ts` touches. Real impl wraps a Phaser `Scene`; a
  `FakePhaserSurface` (records calls) lets `phaser-renderer.ts` be unit-tested with **no real
  Phaser** — keeping the engine choice reversible and coverage high.

## Composition (`src/main.ts`, coverage-excluded)
```ts
const catalog = createVariantCatalog();            // validated car/trailer variants (data)
const world = createWorld({                        // 1 drivable + N placed cars, boundary
  cars: [
    { variantId: "sedan",   role: "drivable", position: start, heading: 0, trailerVariantId: "caravan" },
    { variantId: "long-suv", role: "placed",  position: p1, heading: HALF_PI },
    { variantId: "sedan",    role: "placed",  position: p2, heading: 0, trailerVariantId: "caravan" },
  ],
  boundary: lotWalls,
  catalog,
});

createSandbox({
  clock:    performanceClock,
  input:    isTouch ? createTouchInput({ overlay }) : createKeyboardInput({ target: window }),
  renderer: createPhaserRenderer({ surface: realPhaserSurface }),
  world,
});
```
`createSandbox` (in `src/game/sandbox.ts`) accepts these deps with `Partial` overrides for tests,
wiring input → `stepWorld` (kinematics + collision) → renderer/HUD each fixed step. Note
`src/engine/math/obb.ts` (SAT/MTV) is a pure engine primitive used by the game's collision system
(see contracts/collision.md).
