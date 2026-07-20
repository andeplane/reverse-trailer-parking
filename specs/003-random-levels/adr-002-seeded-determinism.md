# ADR-002: Seeded determinism and level identity

Status: **accepted** (reviewed, rev 2) · 2026-07-19

## Context

Random levels need reproducibility: restart must replay the identical level, tests must be
deterministic, and a "wow, look at this level" moment should be shareable/reportable by a compact
identifier. The project's DI rules forbid hidden global randomness.

## Decision

- One **injected `Rng`** (interface + `mulberry32(seed)` in `src/engine/math/rng.ts`) drives every
  random choice in generation. `generateRandomLevel({ seed, difficulty, catalog })` is a **pure
  function**: same inputs → deep-equal `Level` (retry loops derive sub-seeds deterministically,
  e.g. `seed + attempt`).
- Level identity encodes the recipe: `id = "random-<difficulty>-<seed>"`,
  `name = "Random <difficulty> #<seed in base36 uppercase>"`. **The id carries the *requested*
  seed**: internal relax/re-roll attempts (ADR-003) derive sub-seeds deterministically, so the
  whole pipeline — including its failure recoveries — is a pure function of the requested seed,
  and two requested seeds can never collide on an id. Restart reuses the in-memory level; "Play
  another" draws a new seed via an **injected seed source** (`drawSeed?: () => number` on
  `createApp`, defaulting to a `Math.random`-based draw) — review found a bare `Math.random` in
  the menu violates the DI rule and blocks the app-shell tests.
- A `?rnd=<difficulty>:<seed>` boot param (parsed in `main.ts`) starts directly into that exact
  level — shareable seeds and the hook used by visual verification.
- Random levels are **session-only**: never written to `LevelStorage`, never listed in the menu's
  level list, no editor affordance. They are cheap to regenerate; persistence would turn a
  generator tweak into a save-compatibility problem.

## Alternatives considered

- Persisting generated levels as custom levels: pollutes the level list, couples saves to generator
  version. Rejected (a player who loves a level can still note the seed; a `?rnd=` boot param can
  be added later).
- `Math.random()` inside the generator: untestable, violates DI. Rejected.
- Hash-based per-subsystem RNG streams (à la Minecraft): more isolation than we need for one
  generator; single sequential stream is simpler and still deterministic. Rejected for v1.

## Consequences

- Tests pin seeds and assert exact levels; CI is stable.
- A generator-code change *does* change the level a given seed produces — acceptable because seeds
  are session-scoped, not persisted promises.
- Determinism requires care in iteration order (no `Set`/object-key iteration feeding the RNG
  path) — decorators consume RNG in a fixed documented order.
