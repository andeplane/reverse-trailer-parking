# Implementation Plan: Reverse Trailer Parking — Driving Sandbox (Milestone 1)

**Branch**: `001-reverse-trailer-parking` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-reverse-trailer-parking/spec.md`

## Summary

Build the **driving sandbox + multi-car foundation**: a pure straight-down top-down space
where the player drives a car (optionally towing a trailer) among one or more **placed**
cars, with **solid-body collision** against them and the boundary. Motion is our **own
kinematic model** (no-side-slip bicycle model for the car + one-trailer articulation),
**not** a physics engine. Per the clarifications, every vehicle's geometry is authored as
**explicit coordinates** — the (x, y) positions of its wheels, its body width/length, and
(for cars) the (x, y) hitch position — and the model *derives* wheelbase, hitch offset,
trailer length, track width, and the collision footprint from those coordinates so the math
is correct for any **variant**. One `Car` type serves both roles (placed vs drivable is
runtime state); any car may tow 0 or 1 trailer. Rendering, input, camera and viewport
scaling come from **Phaser 3**, confined to `src/engine/`. The simulation (kinematics +
collision) is a pure, deterministic, fixed-timestep module in `src/game/` with no Phaser
dependency, fully unit-testable. Controls/HUD are a responsive DOM overlay for robust
multi-touch. Still **no** levels, goals, scoring, or timers this milestone.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), ES2022 browser ESM; Node 22 + pnpm 10 for tooling
**Primary Dependencies**: Phaser 3 (render/input/camera/Scale Manager only — **no** Arcade/Matter physics); Vite; Vitest + @vitest/coverage-v8; ESLint + typescript-eslint
**Storage**: N/A — no persistence/accounts/networking
**Testing**: Vitest. Pure simulation/geometry/collision/mapping tested under `node`; thin DOM-overlay wiring under `jsdom`. Fake `Clock` + scripted inputs for deterministic sim tests.
**Target Platform**: Modern mobile + desktop browsers (WebGL2 + Canvas fallback via Phaser). **Mobile-first**.
**Project Type**: Single-project client-side browser game (web frontend, no backend).
**Visual style**: **Pure 100% straight-down (orthographic) top-down 2D** — no tilt/perspective/isometric skew; camera pans/zooms, never rotates to an angle. All sprites flat overhead (roof-view). No 3D/pseudo-3D layer.
**Performance Goals**: Smooth on a mid-range phone (target 60 fps render); simulation fixed at 120 Hz decoupled from render; input reflected within ~100 ms. Collision is O(n²) over a handful of vehicles (n small) — trivially cheap.
**Constraints**: Usable from ~360px width up, portrait + landscape, no clipped controls / horizontal scroll; touch must not scroll/zoom/select; simulation deterministic + numerically stable (no NaN/tunnelling/detachment/runaway); **geometry is explicit coordinates** (wheels + hitch), all motion & collision derived from it; zero `any`; **aim ~100% coverage, 80% hard floor** (only `src/main.ts` excluded).
**Scale/Scope**: One scene; one drivable car + N placed cars (all one type); optional trailer per car; geometry-driven variants; solid-body collision. A handful of pure systems + thin Phaser/DOM adapters.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is an unpopulated template, so the effective constitution is
the engineering charter in **`CLAUDE.md`**. Gates:

| Gate (from CLAUDE.md) | Status | How this plan satisfies it |
|---|---|---|
| **Engine/game separation** — Phaser only in `src/engine/`; `game → engine` one-way | ✅ PASS | Phaser confined to `src/engine/render/`. Simulation (kinematics + collision + world) is Phaser-free in `src/game/`. |
| **DI everywhere** | ✅ PASS | `createSandbox({ clock, input, renderer, world })`; pure `stepWorld(world, input, dt)`; injected `Clock`. |
| **Interface-based systems** | ✅ PASS | `Clock`, `InputSource`, `Renderer`, `PhaserSurface` interfaces; tests pass typed fakes. |
| **Strict TS, zero `any`** | ✅ PASS | Branded units, discriminated `ControlInput`, variant geometry as typed data; `unknown`+guards at DOM boundary. |
| **No physics engine for the vehicle** | ✅ PASS | Kinematic model + our own SAT collision; Phaser physics unused. |
| **Mobile-first** | ✅ PASS | DOM overlay, Scale Manager, touch-action, ≥360px both orientations, fixed-step sim. |
| **Straight-down top-down** | ✅ PASS | Fixed non-rotating camera; flat overhead sprites; OBB footprints in the ground plane. |
| **Deterministic + testable** | ✅ PASS | Pure `stepWorld` + fixed timestep + injected clock; deterministic collision resolution. |
| **Coverage 80% floor / aim ~100%** | ✅ PASS (by design) | Logic in pure modules (geometry, kinematics, collision, world, mappings); Phaser behind a fake surface; DOM under jsdom; only `src/main.ts` excluded. |
| **Naming / file conventions** | ✅ PASS | ESLint + structure below. |

**Result**: No violations. Complexity Tracking table empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-reverse-trailer-parking/
├── plan.md              # This file
├── research.md          # Phase 0 — engine, kinematics-from-geometry, collision, variants
├── data-model.md        # Phase 1 — variants, vehicle/world state, geometry, collision shapes
├── quickstart.md        # Phase 1 — run, drive, collide, swap variants, test
├── contracts/           # Phase 1 — internal API contracts
│   ├── vehicle-model.md #   stepWorld / stepRig, geometry derivation, guarantees
│   ├── collision.md     #   OBB/SAT footprint + resolution contract
│   └── engine-interfaces.md  #   Clock / InputSource / Renderer / PhaserSurface
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — regenerate after this plan)
```

### Source Code (repository root)

```text
parking-reversed/
├── index.html                       # #game-root + #controls-root overlay
├── package.json · tsconfig.json · vite.config.ts · vitest.config.ts · eslint.config.js
├── public/assets/                   # AI sprites (car variants, trailer, steering-wheel) — pure top-down
└── src/
    ├── main.ts                      # composition root (coverage-excluded)
    ├── engine/                      # game-agnostic; ONLY place Phaser is imported
    │   ├── index.ts
    │   ├── math/
    │   │   ├── angles.ts            # normalise/clamp/lerp radians
    │   │   ├── vec2.ts              # 2D vector ops (add/sub/scale/rotate/dot/perp/length)
    │   │   └── obb.ts               # oriented bounding box + SAT overlap + MTV (pure)
    │   ├── loop/{clock.ts, fixed-step-loop.ts}
    │   ├── input/{input-source.ts, keyboard-input.ts, touch-input.ts, scripted-input.ts}
    │   └── render/{renderer.ts, phaser-surface.ts, phaser-renderer.ts, create-phaser-surface.ts}
    └── game/
        ├── vehicle/
        │   ├── vehicle-types.ts     # branded units; VehicleVariant (wheel/hitch coords), Car, Trailer, Rig, World
        │   ├── vehicle-geometry.ts  # derive axle centres, wheelbase L, hitch offset, trailer len, track, footprint OBB from coords
        │   ├── variants.ts          # catalog of car/trailer variants (pure data) + validation
        │   ├── vehicle-model.ts     # stepRig() pure kinematics (bicycle + trailer articulation)
        │   └── world.ts             # World state + stepWorld() (advance drivable rig w/ collision vs placed cars + boundary)
        ├── collision/
        │   └── collision-system.ts  # footprints from geometry; SAT tests; deterministic block/slide resolution
        ├── view/
        │   └── world-view.ts        # World → Entity[] (each car + trailer + wheels) for the renderer
        ├── hud/{steering-indicator.ts, controls-overlay.ts}
        └── sandbox.ts               # createSandbox(deps): input → stepWorld → renderer/HUD each fixed step
```

**Structure Decision**: Single-project browser game using the mandated `src/engine/` (Phaser
adapter + generic math incl. OBB/SAT) vs `src/game/` (this game) split, `game → engine` only.
The simulation — **geometry derivation, kinematics, collision, and the multi-vehicle World** —
is pure and Phaser-free in `src/game/`; Phaser lives only in `src/engine/render/`. Geometry is
authored as explicit coordinates in `variants.ts`; `vehicle-geometry.ts` derives every scalar
the kinematics and collision need, so "the math is right" for any variant by construction.
Controls/HUD remain a DOM overlay for robust multi-touch and responsive layout.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.
