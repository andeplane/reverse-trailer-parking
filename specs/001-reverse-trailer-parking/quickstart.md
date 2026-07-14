# Quickstart: Reverse Trailer Parking — Driving Sandbox (Milestone 1)

## Prerequisites
- Node 22, pnpm 10 (`pnpm` only — never npm/yarn).
- `OPENAI_API_KEY` (to generate car/trailer/steering-wheel sprites via the `ai-image-generator` skill).

## Install & run
```bash
pnpm install
pnpm dev          # Vite dev server — open the printed URL
```
You should see a straight-down top-down space with a drivable car+trailer, one or more **placed**
cars (some with trailers), and the on-screen controls.

## Drive it
**Desktop (keyboard):** **↑** forward · **↓** reverse · release → brakes to a stop · **←/→** steer
(recenters on release) · **R** reset. The steering-wheel indicator shows the current wheel angle.

**Phone (touch):** **Forward / Reverse** buttons (hold to drive) · **vertical steering slider on the
right** (position = steer angle, centre = straight) · drive + steer together (multi-touch). No page
scroll/zoom while driving.

**Try the feel:**
- Drive forward in a line (trailer settles behind), then **reverse while steering** — the trailer
  swings and jackknifes, clamping at the limit.
- **Drive into a placed car or the wall** — you're blocked at contact, never overlapping.
- **Reverse the trailer into an obstacle** — the trailer collides too.

## Verify (tests, types, lint)
```bash
pnpm test               # Vitest once
pnpm test --coverage    # coverage (aim ~100%, 80% is the hard gate)
pnpm exec tsc --noEmit  # strict type-check (must be clean)
pnpm lint               # ESLint (must be clean)
pnpm build              # type-check + production build
```

## What to look for (maps to spec)
- **Accelerate/brake, not teleport** — speed ramps up, brakes to a full stop (FR-005/006).
- **Wheels determine direction** — no turning while stationary; turn radius follows the vehicle's
  wheel positions + steer angle (FR-008/010).
- **Trailer articulation** — settles in line forward, jackknifes on reverse, clamps cleanly (FR-012/013/014).
- **Collision** — the rig (car **and** trailer) never overlaps a placed car, its trailer, or the
  boundary; blocked at contact even at speed (FR-016e/f, SC-008).
- **Variants** — placed cars of different variants have visibly different lengths / turn radii /
  footprints, all from geometry data — no code change (FR-016a/b, SC-009).
- **Deterministic** — same inputs → same path & collisions (FR-016; tests assert this).
- **Mobile** — usable from ~360px, portrait + landscape, controls unclipped, smooth motion (FR-024/025/026).

## Sprites
Generate `car` (one or a few variants), `trailer`, and `steering-wheel` with the
`ai-image-generator` skill (transparent PNGs, GPT Image 1.5), saved under `public/assets/`,
committed by name. **All world art is pure straight-down overhead (roof-view), no perspective/tilt**
(research.md → Decision 7). Placeholder quality is fine this milestone.

## Where things live
- Pure geometry/kinematics/collision → `src/game/vehicle/`, `src/game/collision/`, `src/engine/math/`
  (heavily unit-tested)
- Multi-car world & step → `src/game/vehicle/world.ts` · Variant catalog (data) → `variants.ts`
- Fixed-step loop & clock → `src/engine/loop/` · Input adapters → `src/engine/input/`
- Rendering (Phaser) → `src/engine/render/` · View mapping, HUD/controls, sandbox wiring → `src/game/`
- Design docs → `specs/001-reverse-trailer-parking/` (plan, research, data-model, contracts)
