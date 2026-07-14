<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

# CLAUDE.md

When things change (architecture, game engine choice +++), ALWAYS update this file with the most important details that you shoulda lways remember.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A TypeScript game.

**Game engine: UNDECIDED.** The leading candidate is **Phaser**, but this is
not yet committed — do not assume Phaser, and equally do not assume there is no
engine. Until the choice is made and recorded here, keep engine-specific code
behind our own thin abstractions so the decision stays reversible. **When the
engine is chosen, update this section immediately** with the choice, the
version, and how it's wired in (per the update rule at the top of this file).

Regardless of the engine choice, keep **game-agnostic systems separated from
game-specific logic** (see Architecture Principles). If we adopt an engine like
Phaser, "our engine layer" becomes a thin adapter around it rather than a
from-scratch implementation.

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

## Git Rules

- **Never** use `git add .` or `git add -A`. Stage specific files by name. Run
  `git status` and `git diff --staged` before committing to confirm exactly
  what's included.
- Commit or push only when asked.
