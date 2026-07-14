---
description: "Task list for Reverse Trailer Parking — Driving Sandbox (Milestone 1)"
---

# Tasks: Reverse Trailer Parking — Driving Sandbox (Milestone 1)

**Input**: Design documents from `specs/001-reverse-trailer-parking/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (vehicle-model, collision, engine-interfaces), quickstart.md

**Tests**: **REQUIRED** — the project enforces an 80% line-coverage hard gate (aim ~100%).
Each implementation task includes writing its colocated `*.test.ts`. Pure modules (geometry,
kinematics, collision, world, math, mappings) get exhaustive unit tests; Phaser sits behind a
fake `PhaserSurface`; DOM adapters are tested under `jsdom`. Only `src/main.ts` is coverage-excluded.

**Organization**: Grouped by user story (from spec.md) so each is independently testable.

**Conventions** (CLAUDE.md): pnpm only; kebab-case files; PascalCase types; DI via typed deps +
`Partial` overrides; interfaces over concretes; zero `any`; Phaser only in `src/engine/`; pure
Phaser-free simulation; **explicit-coordinate geometry (wheels + hitch), derived scalars**;
**variants are data**; **one Car type, roles placed/drivable**; **our own OBB/SAT collision**;
**100% straight-down top-down**; **mobile-first**.

**Story priorities** (spec.md): US1 = P1 (MVP), US2 = P2, US4 = P2, US3 = P3.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap the empty repo into a runnable Vite + TS(strict) + Vitest + Phaser project.

- [X] T001 Initialize pnpm project: `package.json` with scripts (`dev`,`build`,`test`,`test:watch`,`lint`,`lint:fix`) and deps — `phaser`; devDeps `vite`, `typescript`, `vitest`, `@vitest/coverage-v8`, `jsdom`, `eslint`, `typescript-eslint`. `pnpm` only.
- [X] T002 [P] Add `tsconfig.json` (strict, `noUncheckedIndexedAccess`, ES2022, bundler resolution, `src/**`).
- [X] T003 [P] Add `vite.config.ts` (root, `public/` assets).
- [X] T004 [P] Add `vitest.config.ts`: coverage `provider: v8`, `include: ['src/**/*.ts']`, `exclude: ['src/**/*.test.ts','src/**/*.d.ts','src/main.ts']`, `thresholds.lines: 80`; `environmentMatchGlobs` → `jsdom` for `*hud*`/`*overlay*`/`*input*` tests, `node` otherwise.
- [X] T005 [P] Add `eslint.config.js` (typescript-eslint, `no-explicit-any: error`, kebab-case filename + naming rules per CLAUDE.md).
- [X] T006 [P] Add `index.html` with viewport meta (`user-scalable=no`), `#game-root` + `#controls-root`, base CSS (full-viewport, `overflow:hidden`, `touch-action:none`, no selection).
- [X] T007 [P] Create source tree (`src/engine/{math,loop,input,render}`, `src/game/{vehicle,collision,view,hud}`), placeholder `src/main.ts`, `public/assets/.gitkeep`, `.gitignore`.

**Checkpoint**: `pnpm dev`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint` run on an empty scaffold.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared, cross-story engine seams (pure math + interfaces). No game behaviour yet.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T008 [P] Implement `src/engine/math/angles.ts` + `angles.test.ts`: `normaliseAngle` to `(−π,π]`, `clamp`, `lerp`, safe `tan`. Cover wrap-around, boundaries, negatives.
- [X] T009 [P] Implement `src/engine/math/vec2.ts` + test: `add`,`sub`,`scale`,`rotate`,`dot`,`perp`,`length`,`midpoint`,`normalise`. Cover zero-vector + rotation edge cases.
- [X] T010 [P] Implement `src/engine/math/obb.ts` + test: `Obb` type, `obbCorners`, `obbOverlap` (SAT), `obbMtv` (min translation vector, `null` if disjoint). Cover overlapping, touching-not-overlapping, containment, rotated boxes. (Shared: `World.boundary` + collision use this.)
- [X] T011 [P] Implement `src/engine/loop/clock.ts` + test: `Clock` interface + `performanceClock` (inject a fake `performance`; assert `now()` returns a number).
- [X] T012 Implement `src/engine/loop/fixed-step-loop.ts` + test: `createFixedStepLoop({dt,clock,maxCatchUp?})` → `{steps,alpha}`; cap catch-up. Test with `FakeClock` + scripted frame times (0/1/many/clamped). Depends on T011.
- [X] T013 [P] Implement `src/engine/input/input-source.ts` + test: `ControlInput` type, `InputSource` interface (`read`,`dispose`), `clampControlInput` → `[-1,1]`. Cover out-of-range clamping.
- [X] T014 [P] Add `src/engine/render/renderer.ts`: `Entity` type + `Renderer` interface (`sync`,`follow`,`dispose`). (Type-only.)
- [X] T015 [P] Add `src/engine/render/phaser-surface.ts`: `PhaserSurface` interface (`addSprite`,`setTransform`,`removeSprite`,`centerCamera`). (Type-only.)
- [X] T016 Add `src/engine/index.ts` barrel re-exporting public engine interfaces/types.

**Checkpoint**: Shared math (incl. OBB/SAT) + loop + input/render contracts exist and are green.

---

## Phase 3: User Story 1 - Free-drive the articulated rig in an open space (Priority: P1) 🎯 MVP

**Goal**: A visible car+trailer in an open straight-down space that moves with correct articulated
kinematics, with geometry authored as explicit wheel/hitch coordinates and derived scalars. One
drivable rig, no other cars yet.

**Independent Test**: Unit-test `stepRig`/geometry over scripted inputs (accelerate/brake,
stationary-steer-no-move, straight-line trailer settle, reverse jackknife+clamp, determinism,
no-NaN, derived L/h/d correct for a variant); run the sandbox with a scripted `InputSource` to
*watch* the rig drive/reverse and articulate — no keyboard/touch required.

- [X] T017 [P] [US1] Implement `src/game/vehicle/vehicle-types.ts`: branded units, `CarVariant`/`TrailerVariant` (explicit wheel + hitch coords, width/length, steerMax, jackknifeMax), `CarState`/`TrailerState` (incl. `role`, optional `trailer`), `Rig`, `World`, `VariantCatalog`, `CarSpawn` per data-model.md.
- [X] T018 [P] [US1] Implement `src/game/vehicle/variants.ts` + test: an initial car variant (`sedan`) + trailer variant (`caravan`) as data, plus `validateCarVariant`/`validateTrailerVariant`/`createVariantCatalog` (throw `RangeError` on bad geometry: non-positive sizes, degenerate axles, steer/jackknife out of range). Depends on T017.
- [X] T019 [US1] Implement `src/game/vehicle/vehicle-geometry.ts` + test: `deriveCarGeometry` (rear/front axle centres, forward axis, wheelbase `L`, track, hitch offset `h`), `deriveTrailerGeometry` (axle centre, length `d`), `wheelWorldPositions`, `hitchWorld`, `carFootprint`/`trailerFootprint` (→ `Obb`). Cover a couple of variants; assert L/h/d/track correct. Depends on T017, T010.
- [X] T020 [US1] Implement `src/game/vehicle/vehicle-model.ts` + **extensive** test: pure `stepRig({rig,input,dt,catalog})` per contracts/vehicle-model.md using **derived** L/h/d — speed accel/brake-to-zero/reverse; steer slew clamped; car bicycle `θ̇=v·tan(δ)/L`; trailer `φ̇=(v/d)·sin(θ−φ)−(h/d)·θ̇·cos(θ−φ)`; jackknife clamp; normalise + finiteness. Assert every guarantee (accelerate-not-teleport, brake to exactly 0, reverse symmetry, stationary-steer-no-move, straight-line `φ→θ`, reverse jackknife+clamp, determinism, no NaN, no-trailer path). Depends on T017, T018, T019.
- [X] T021 [US1] Implement `src/game/vehicle/world.ts` + test: `createWorld` (validates exactly one drivable car) and `stepWorld({world,input,dt})` advancing **only** the drivable rig via `stepRig` (no obstacles/collision yet — collision wired in US4). Cover single-rig advance + determinism + drivable-car validation. Depends on T020.
- [X] T022 [P] [US1] Implement `src/game/view/world-view.ts` + test: `worldToEntities(world, catalog)` → `Entity[]` for each car + its trailer + **each wheel as its own entity, front (steered) wheels rotated by the car heading + steer angle δ and rear/trailer wheels by their body heading** (positions/rotations from derived geometry), so the direction the wheels point is visually distinguishable per FR-002. Cover aligned + articulated + a non-zero steer angle (assert front-wheel rotation = heading + δ, rear = heading). Depends on T017, T014, T019.
- [X] T023 [US1] Implement `src/engine/render/phaser-renderer.ts` + test: `createPhaserRenderer({surface})` implementing `Renderer` — `sync` create/update/remove sprites to match entity ids, `follow` centres camera, `dispose` clears. Test against a `FakePhaserSurface` recording calls; no real Phaser. Depends on T014, T015.
- [X] T024 [US1] Implement `src/engine/render/create-phaser-surface.ts`: real `PhaserSurface` bootstrapping `Phaser.Game` + Scene with **Scale Manager (FIT), camera NOT rotated (pure straight-down)**, sprite create/transform/remove, `centerCamera`. (Thin real-Phaser glue.) Depends on T015.
- [X] T025 [P] [US1] Implement `src/game/hud/steering-indicator.ts` + test: pure `steerToRotation(δ, steerMax)` + `bindSteeringIndicator(el)` (CSS `transform: rotate`). Cover centre/full-lock both ways (jsdom bind). Satisfies FR-004a.
- [X] T026 [P] [US1] Implement `src/engine/input/scripted-input.ts` + test: `createScriptedInput(program)` deterministic `InputSource` playing forward→steer→reverse→jackknife (demo + US1 standalone visual test). Depends on T013.
- [X] T027 [US1] Implement `src/game/sandbox.ts` + test: `createSandbox({clock,input,renderer,world,steeringEl?,onReset?})` — each fixed step `input.read()` → `stepWorld` → `renderer.sync(worldToEntities)` + `renderer.follow(drivable rear axle)` + steering-indicator update; `reset()`, `dispose()`. Test with `FakeClock` + fake `InputSource`/`Renderer` (rig advances, reset restores). Depends on T012, T021, T022, T023, T025.
- [X] T028 [US1] Generate sprites via `ai-image-generator` — `car-sedan.png`, `trailer-caravan.png`, `steering-wheel.png` — **pure straight-down overhead, transparent PNG (GPT Image 1.5)** per research.md Decision 7; save to `public/assets/`, commit by name.
- [X] T029 [US1] Wire `src/main.ts`: boot real `PhaserSurface`, load sprites, build a `World` with one drivable rig, start `createSandbox` driven by `createScriptedInput` so `pnpm dev` shows it driving + articulating. Depends on T024, T026, T027, T028.

**Checkpoint**: `pnpm dev` shows a straight-down drivable car+trailer auto-driving with correct
articulation; geometry + `stepRig` fully unit-tested. **MVP demoable without human input.**

---

## Phase 4: User Story 2 - Drive with desktop keyboard controls (Priority: P2)

**Goal**: A human drives on desktop — ↑/↓ throttle, ←/→ steer (ramp/recenter), R resets.

**Independent Test**: In a desktop browser, hold ↑/↓ to accelerate/brake/reverse, ←/→ to steer
(wheels + indicator move), press R to reset — all via keyboard.

- [X] T030 [US2] Implement `src/engine/input/keyboard-input.ts` + test (jsdom): `createKeyboardInput({target,steerRate?,onReset?})` — ↑/↓ → throttle ±1; ←/→ ramp steer toward ∓1 held / recenter on release; `R` → `onReset`; clamped `ControlInput` from `read()`; `dispose()` detaches. Cover ramp, recenter, combined throttle+steer, reset. Depends on T013.
- [X] T031 [US2] Update `src/main.ts` to use `createKeyboardInput` (on `window`) for non-touch and wire `onReset` → `sandbox.reset()`. Depends on T029, T030.

**Checkpoint**: Rig fully drivable by keyboard on desktop; US1 auto-drive still available.

---

## Phase 5: User Story 4 - Multiple cars, variants, and collision (Priority: P2)

**Goal**: Placed cars of different variants (some with trailers) share the space; solid-body
collision blocks the drivable rig (car AND trailer) from overlapping obstacles or the boundary.

**Independent Test**: Spawn the drivable car + placed cars of different variants; drive into them
and the wall — confirm blocked-at-contact (no overlap, no tunnelling even at speed), the trailer
collides too, and variants differ in turning radius/footprint.

- [X] T032 [P] [US4] Add more variants to `src/game/vehicle/variants.ts` (e.g. `long-suv`, a second trailer) as data + tests for their validation and differing derived geometry (longer `L`, smaller `steerMax` → larger turn radius). Depends on T018.
- [X] T033 [US4] Implement `src/game/collision/collision-system.ts` + **extensive** test per contracts/collision.md: `rigFootprints`, `obstacleFootprints`, `lerpRig`, `resolveRigCollision` (bisect-to-contact + MTV push-out; sliding optional). Tests: drive into obstacle at low **and full speed** → no overlap, no tunnelling; reverse trailer into obstacle → blocked; wedge between two placed cars; determinism; no NaN. Depends on T010, T019, T021.
- [X] T034 [US4] Wire collision into `src/game/vehicle/world.ts` `stepWorld`: after `stepRig`, call `resolveRigCollision` against placed-car + boundary footprints, re-derive trailer + re-clamp; update tests to assert post-step no-penetration invariant. Depends on T021, T033.
- [X] T035 [US4] Add a world-setup helper in `src/game/vehicle/world-setup.ts` (NOT `main.ts` — it must live in a coverage-included module so its test counts) spawning one drivable rig + several placed cars (mixed variants, some towing trailers) + boundary walls; + test the spawn (counts, one drivable, footprints placed). Depends on T034, T032.
- [X] T036 [US4] Ensure `world-view.ts` + renderer draw **all** cars and their trailers **including per-wheel entities with correct steer/heading rotation** (multi-vehicle, correct z-order ground→trailers→cars→wheels) + update tests. Depends on T022, T035.
- [X] T037 [US4] Update `src/main.ts` to build the multi-car world (T035) and verify end-to-end: drive into a placed car / wall / a placed car's trailer at speed → blocked with no overlap; two variants show different turn radii. Depends on T031, T035, T036.

**Checkpoint**: Multiple variant cars render; the rig cannot penetrate obstacles or the boundary.

---

## Phase 6: User Story 3 - Play well on a phone (Priority: P3)

**Goal**: Touch controls (forward/reverse buttons + right steering slider), responsive layout,
multi-touch, no page scroll/zoom, smooth on mobile.

**Independent Test**: On a ~360px touch viewport (portrait + landscape): hold drive buttons to
move, drag the right slider to steer, both at once; controls unclipped, no scroll/zoom, smooth.

- [ ] T038 [US3] Implement `src/game/hud/controls-overlay.ts` + test (jsdom): build DOM overlay in `#controls-root` — forward + reverse buttons (left), **vertical steering slider on the right**, steering-wheel container, **and a reset button** (so FR-004 reset is reachable on touch devices, which have no keyboard `R`); apply `touch-action:none`, prevent default gestures, expose typed accessors (button-held states, slider value `[-1,1]`, and an `onReset` callback / reset-pressed accessor). Cover reset-press dispatch. Satisfies FR-020/021/023/025 and FR-004 (mobile).
- [ ] T039 [US3] Implement `src/engine/input/touch-input.ts` + test (jsdom): `createTouchInput({overlay})` — held forward/reverse → throttle, slider → steer; simultaneous button + slider (pointer events / multi-touch); clamped `ControlInput`; `dispose()`. Cover drive-only, steer-only, both-at-once. Depends on T013, T038.
- [ ] T040 [US3] Add responsive/mobile CSS + wiring: portrait **and** landscape from ~360px up, controls reachable/unclipped, no horizontal scroll, no pinch-zoom/selection; ensure `create-phaser-surface` Scale Manager handles resize/orientation (recentre, no rotation). Files: `index.html`/overlay CSS + `src/engine/render/create-phaser-surface.ts`. Depends on T024, T038. Satisfies FR-024.
- [ ] T041 [US3] Update `src/main.ts`: detect touch → build overlay + use `createTouchInput`; wire the overlay reset button → `sandbox.reset()` (mobile parity with desktop `R`); keep keyboard on desktop; steering indicator bound on both. Depends on T031, T038, T039.
- [ ] T042 [US3] Mobile verification against `specs/001-reverse-trailer-parking/quickstart.md`: run `pnpm dev` in a ~360px portrait + landscape viewport (+ a real phone if available) — confirm multi-touch drive+steer, unclipped controls, no scroll/zoom, smooth continuous motion (FR-026), **input responsiveness ≤ ~100 ms from press/release/steer to visible rig response (SC-006, on desktop keyboard + mobile touch)**, and collision still works. Record tuning needs for Polish.

**Checkpoint**: Playable on phone and desktop; all four stories independently work.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T043 [P] Tune variant geometry + feel params in `src/game/vehicle/variants.ts` (speeds, steer lock, trailer length, hitch/wheel positions, jackknife limit) from T042 findings.
- [ ] T044 [P] Optional: complete collision **sliding** (tangent projection) in `src/game/collision/collision-system.ts` if deferred from T033, keeping determinism; add tests.
- [ ] T045 [P] Run `pnpm test --coverage` (config in `vitest.config.ts`); confirm ≥80% (aim ~100%); add tests for uncovered branches under `src/**` (leave only genuinely-hard glue uncovered, per research Decision 8).
- [ ] T046 [P] Ensure `pnpm exec tsc --noEmit` clean and `pnpm lint` passes with **zero `any`** in `src/`.
- [ ] T047 Run the full `quickstart.md` flow end-to-end (dev + drive desktop & mobile, collide, swap variants, tests, `pnpm build`).
- [ ] T048 [P] Reconcile docs if anything diverged (`CLAUDE.md`, plan/research) and confirm generated sprites are committed by name.

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)**: none.
- **Foundational (P2)**: depends on Setup — **blocks all user stories**.
- **US1 (P3)**: depends on Foundational. The MVP (single drivable rig, geometry + kinematics).
- **US2 (P4)**: depends on Foundational + US1 (adds keyboard to the US1 sandbox).
- **US4 (P5)**: depends on Foundational + US1 (adds OBB collision + placed cars; modifies `world.ts`/`world-view.ts`/`main.ts`). Independent of US2 except serializing on `main.ts`.
- **US3 (P6)**: depends on Foundational + US1; touch modules independent of US2/US4; serializes on `main.ts`.
- **Polish (P7)**: after the desired stories.

### Story independence
- **US1** stands alone (scripted input, one rig).
- **US2** (keyboard) and **US3** (touch) each add an input modality; independent of each other.
- **US4** (collision + variants) is a simulation addition; independent of the input stories.
- US2/US4/US3 only serialize on edits to `src/main.ts` (and US4 also edits `world.ts`/`world-view.ts`).

### Within a story
- Types → variants/geometry → model → world; model/view before renderer wiring; adapters before `main.ts`.
- Each module lands with colocated tests (coverage gate).

### Parallel opportunities
- Setup: T002–T007 `[P]`.
- Foundational: T008, T009, T010, T011, T013, T014, T015 `[P]` (T012 after T011; T016 last).
- US1: T017, T018, T022, T025, T026 `[P]`; T019 after T017/T010; T020 after T017/T018/T019; T021 after T020; T023 after T014/T015; T027 converges; T028 anytime.
- US4: T032 `[P]` with T033; T033 after T010/T019/T021; then T034→T035→T036→T037.

---

## Parallel Example: User Story 1

```bash
# After Foundational, launch independent US1 modules together:
Task: "T017 vehicle-types.ts"
Task: "T018 variants.ts + tests"
Task: "T022 world-view.ts + tests"
Task: "T025 steering-indicator.ts + tests"
Task: "T026 scripted-input.ts + tests"
# Then T019 (geometry) → T020 (stepRig) → T021 (world); T023 (renderer) once T014/T015 land;
# converge on T027 (sandbox) → T029 (main.ts demo).
```

---

## Implementation Strategy

### MVP first (User Story 1)
1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1.
4. **STOP & VALIDATE**: geometry + `stepRig` tests green; `pnpm dev` shows the rig auto-driving with
   correct articulation and jackknife. The "does the movement feel right?" checkpoint.

### Incremental delivery
- **US1** → watch the physics (scripted) → MVP.
- **+US2** → drive it yourself on desktop (fastest way to tune feel).
- **+US4** → add placed cars, variants, and collision (the clarified architecture).
- **+US3** → play on a phone (mobile-first target).
- **Polish** → tune variants, finish sliding, close coverage, run quickstart.

> **Human hands-on MVP** = US1 + US2. US1 alone is the testable/demoable MVP via scripted input.
> Consider building **US4 before US3** (both P2/P3): collision + variants are easiest to tune with
> keyboard on desktop before layering mobile controls.

### Notes
- `[P]` = different files, no incomplete dependencies.
- Commit after each task or logical group; stage files by name (never `git add .`).
- Keep Phaser imports in `src/engine/`; keep `src/game/vehicle/` + `src/game/collision/` Phaser-free and pure.
- Explicit-coordinate geometry, straight-down top-down, and mobile-first are permanent — verify every phase.
