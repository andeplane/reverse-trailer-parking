<!-- SPECKIT START -->
Active feature plan: `specs/001-reverse-trailer-parking/plan.md`
(with `research.md`, `data-model.md`, `contracts/`, `quickstart.md` alongside it).
Read it for technologies, project structure, the vehicle-motion math, and test strategy.
<!-- SPECKIT END -->

# CLAUDE.md

When things change (architecture, game engine choice +++), ALWAYS update this file with the most important details that you shoulda lways remember.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A TypeScript game.

**Game engine: Phaser 3** (decided 2026-07-14). Phaser is used **only for
rendering, input, camera, and viewport scaling**, confined to `src/engine/` as a
thin adapter. **We do NOT use Phaser's physics** (Arcade or Matter) for the
vehicle — the car+trailer motion is our own code (see "Vehicle physics" below).
Keep all Phaser imports inside `src/engine/`; `src/game/` stays engine-agnostic
so the choice remains reversible.

Keep **game-agnostic systems separated from game-specific logic** (see
Architecture Principles): "our engine layer" is a thin adapter around Phaser, not
a from-scratch renderer.

## Vehicle physics — our own kinematic model (NOT a physics engine)

The car+trailer motion is hand-written, not from a rigid-body engine. Rules:

- **Simple longitudinal dynamics**: throttle accelerates gradually up to a max
  speed; releasing the throttle brakes to a full stop (no infinite coasting, no
  instant jump to full speed). Same for reverse.
- **Direction emerges from the wheels, not a set heading**: wheels roll in the
  direction they point and cannot slide sideways. The car's turning is a
  geometric consequence of steer angle + wheelbase + travel — never a directly
  assigned heading. Do not "just rotate the car by steerAngle."
- **Trailer is articulated geometry**: connected at a hitch; its motion depends
  on the hitch angle, trailer length (hitch-to-axle), and trailer axle/wheel
  positions. Forward driving lets the trailer settle in line; reversing can
  swing it toward a **jackknife**, which is **clamped** (trailer never overlaps
  or passes through the car) with no snapping/teleport/NaN.
- **Geometry is EXPLICIT COORDINATES, scalars are DERIVED**: every vehicle
  variant is authored as the (x, y) positions of its wheels, its body
  width/length, and (cars) the (x, y) hitch position. Derive wheelbase `L`,
  hitch offset `h`, trailer length `d`, track width, and the collision footprint
  from those coordinates — never hand-enter a scalar `wheelbase`. The bicycle +
  articulation equations are reused with the derived values, so the math is
  correct for any variant.
- **Variants are data, not code**: cars/trailers differ by geometry (length,
  wheel positions, max steer angle, hitch position) in a validated catalog.
  Adding a variant = adding data.
- **One vehicle type, two roles**: a `Car` is `placed` (static) OR `drivable`
  (player-controlled) — a runtime field, not a subclass. A `World` holds many
  cars (one drivable + N placed). ANY car may tow 0 or 1 trailer (placed cars
  included).
- **Collision is our own, not an engine**: vehicle footprints are oriented boxes
  (OBB); overlap via SAT + MTV (`src/engine/math/obb.ts`). The drivable rig (car
  AND trailer) cannot penetrate placed cars or the boundary — resolve by
  bisecting the sub-step to contact + MTV push-out (tunnelling-proof, sliding is
  a bonus). Placed cars are immovable (no bounce/momentum/damage this milestone).
- **Deterministic**: same input sequence + elapsed time → same motion AND same
  collision outcome. Use a fixed timestep and injected `Clock`; keep `stepWorld`
  pure so the model is unit-testable.

## MOBILE-FIRST — NEVER forget this

This game **must work well on phones**. This is a permanent, non-negotiable
constraint on every feature, layout, and control decision — treat it as always
in scope:

- Responsive and fully usable from ~360px wide up to desktop, in **both portrait
  and landscape**; no clipped controls, no horizontal page scroll.
- Touch controls are first-class: on-screen forward/reverse buttons + a vertical
  steering slider on the **right** edge (sets steer angle proportionally).
  Support multi-touch (drive + steer at once).
- Touch must not trigger page scroll, pinch-zoom, or text selection.
- Large, thumb-reachable touch targets; smooth real-time motion on a mid-range
  phone.
- Always show a steering-angle indicator (steering-wheel/gauge UI) in addition
  to the wheels drawn on the car, on both desktop and mobile.

Desktop controls: Left/Right steer, Up = forward, Down = reverse.

## Visual style — 100% straight-down top-down (NEVER angled)

The game is a **pure orthographic overhead** 2D game, like classic top-down parking games
(see the reference image). The camera looks **straight down** — **no tilt, no perspective,
no isometric skew, no 3D/pseudo-3D**. It may pan (follow the rig) and zoom, but never
rotates to an angled view. **All world sprites are flat overhead (roof-view) art**, rotated
in-plane by heading; generate car/trailer sprites as pure top-down views, not 3/4 or angled.
(The steering-wheel HUD indicator is exempt — it's a flat UI icon.)

Tooling is **Vite** + **TypeScript** (strict) + **Vitest**. This is a plain TS
project, not a React/CDF app.

## Package Manager

`pnpm`. Always use `pnpm`, never `npm` or `yarn`.

## Common Commands

```bash
pnpm dev          # Vite dev server
pnpm build        # type-check + production build
pnpm test         # run Vitest once
pnpm test:watch   # Vitest in watch mode
pnpm test --coverage   # run with coverage
pnpm lint         # ESLint
pnpm lint:fix     # ESLint with autofix
pnpm exec tsc --noEmit # strict type-check without emitting
```

## Architecture Principles

### Engine / game separation

- `src/engine/` — game-agnostic layer: either our own generic systems, or a thin
  adapter around the chosen engine (e.g. Phaser). No game-specific types or logic.
- `src/game/` — the specific game, built only on the engine layer's public API.
- The dependency arrow only points one way: `game` → `engine`, never back.
- Third-party engine imports (Phaser, etc.) should be confined to `src/engine/`
  so the game layer stays engine-agnostic and the engine choice stays reversible.

### Dependency injection everywhere

DI is a first-class requirement in this project. Systems declare their
dependencies explicitly and receive them; they must not reach out to global
singletons or construct their collaborators inline. This keeps every system
testable in isolation and swappable (e.g. a headless renderer or a fake clock in
tests).

Use **constructor / factory injection with typed dependency objects and partial
overrides**:

```ts
interface Clock { now(): number }
interface Renderer { draw(scene: Scene): void }

type EngineDeps = {
  clock: Clock;
  renderer: Renderer;
};

const defaultDeps: EngineDeps = {
  clock: { now: () => performance.now() },
  renderer: createRenderer(), // real renderer (our own, or an engine adapter)
};

export function createGameLoop(overrides: Partial<EngineDeps> = {}) {
  const deps = { ...defaultDeps, ...overrides };
  // deps.clock / deps.renderer used here — never `performance.now()` directly
}
```

In tests, pass fakes: `createGameLoop({ clock: fakeClock })`. No module-level
mocking should be necessary — if you find yourself reaching for `vi.mock`, that
is a signal the dependency should be injected instead.

### Interface-based systems

Every non-trivial system implements an explicit TypeScript `interface` describing
its public API. Production code depends on the interface, not the concrete class,
so test doubles stay type-safe and implementations remain substitutable. Never
use `as unknown as T` to force a mock into place — that signals a missing or
wrong interface.

## Code Standards

### TypeScript type safety

- **Strict mode is on.** `pnpm exec tsc --noEmit` must be clean; lint errors are
  not negotiable.
- **Zero `any` in `src/`.** Use `unknown` + a type guard at boundaries. If a
  third-party lib forces `any`, wrap it in a typed adapter so `any` doesn't leak.
- **Make impossible states unrepresentable.**
  - *Discriminated unions over flag bags* — model game/entity state as an
    exhaustive union with a `status`/`kind` discriminant instead of a bag of
    optional booleans.
    ```ts
    type EntityState =
      | { kind: "idle" }
      | { kind: "moving"; velocity: Vec2 }
      | { kind: "dead"; diedAt: number };
    ```
  - *Branded types* — brand primitives that must not be mixed up (e.g.
    `EntityId`, `Millis`, `Tiles`). Validate once at the boundary; downstream
    code trusts the type.
    ```ts
    type EntityId = number & { readonly __brand: "EntityId" };
    ```
- **Let types flow.** Derive types instead of restating them — reach for `Pick`,
  `Omit`, `Parameters`, `ReturnType`, `Awaited`, `typeof` before writing a new
  interface.
- **Pass objects, not positional args.** Any function with two or more
  parameters of the same primitive type takes a named-property object so callers
  can't silently swap arguments (`spawn({ x, y, hp })`, not `spawn(x, y, hp)`).

### Size and single responsibility

Flag any file that does more than one thing (e.g. simulation + rendering + input
in one place). Extract cohesive systems/modules. Split only when it creates a
genuinely cleaner separation — a well-named larger module beats several poorly
named tiny ones.


### DRY

Extract repeated logic: pure helpers to `src/**/utils`, shared systems to their
own module. Don't copy-paste math (vectors, collision, easing) — centralize it.

### Naming conventions

| Artifact | Convention | Examples |
|----------|-----------|----------|
| Files & directories | `kebab-case` | `game-loop.ts`, `collision-system.ts` |
| Classes & types & interfaces | `PascalCase` | `GameLoop`, `EntityId`, `Renderer` |
| Variables & functions | `camelCase` | `deltaTime`, `spawnEntity` |
| Module-level constants | `SCREAMING_SNAKE_CASE` | `MAX_ENTITIES`, `TICK_RATE` |
| Booleans | auxiliary-verb prefix | `isAlive`, `hasCollided`, `canMove` |

### Dead code

Remove commented-out blocks (version control preserves history), stray
`console.log`/`console.debug`, unused files, and unreachable code before
approval. These are blocking findings.

## Testing

Strongly-typed tests are a hard requirement.

- **Framework:** Vitest. Test files live next to their source as
  `*.test.ts`.
- **80% line coverage is a hard gate.** Coverage measures all `src/**/*.ts`
  except test files, type declarations, and the entry point. Do **not** exclude
  production systems from coverage.
- **Inject, don't mock.** Prefer passing typed fake dependencies over `vi.mock`.
  If a hard-coded import forces `vi.mock`, add a comment justifying why and treat
  the underlying code as a testability defect to fix.
- **Type-safe test doubles.** Mocks/fakes must satisfy the real interface — no
  `as unknown as T` casts. If the interface is large, write a helper that returns
  a correctly-typed partial fake.
- **Cover happy path, error path, empty state, and edge cases** for every system
  and utility. For simulation code, prefer a fake `Clock` and deterministic input
  so tests are reproducible.

Coverage config (Vitest) should look like:

```ts
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'text-summary', 'lcov'],
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/main.ts'],
  },
}
```

## Sprites & Art Assets

Game sprites and art are generated with AI via the **`ai-image-generator`
skill** (`.claude/skills/ai-image-generator/`). When you need a new sprite,
background, icon, or any visual asset, use that skill — do not hand-roll API
calls or reach for other tools.

- **Transparent sprites** (the common case — characters, items, tiles that sit
  on top of the game): use **GPT Image 1.5** (`gpt-image-1.5`) with
  `background: "transparent"` and `output_format: "png"`. GPT Image 2 **cannot**
  do transparency, so it's the wrong choice for most sprites.
- **Text-heavy or opaque art** (title screens, UI panels with copy, banners):
  use **GPT Image 2** (`gpt-image-2`).
- Requires `OPENAI_API_KEY` in the environment.
- Prompt with the skill's 5-part framework and always end with
  "No text, no watermarks, no logos" (unless text is the point).
- Save generated sprites into the game's asset directory (e.g. `src/game/assets/`
  or `public/assets/`), not the scratchpad, and commit them by name.
- For a matched set (e.g. a character's animation frames or a themed tileset),
  use GPT Image 2's batch mode and/or keep prompts consistent so style, palette,
  and scale stay coherent across sprites.

## Git Rules

- **Never** use `git add .` or `git add -A`. Stage specific files by name. Run
  `git status` and `git diff --staged` before committing to confirm exactly
  what's included.
- Commit or push only when asked.
