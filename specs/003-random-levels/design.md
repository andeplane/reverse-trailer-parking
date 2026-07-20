# Random Level Generation — Design

Status: **reviewed & revised** · 2026-07-19
Revision 2 — incorporates three independent reviews (kinematics/control, architecture fit,
gameplay/difficulty). Review reports' findings are folded in below; changes from rev 1 are the
control-law sign fix, the outside-start rule, steer-cap retune, waypoint feasibility coupling,
guaranteed pinch points, margin taper + dock bay, and the app-shell contract details.
ADRs: [adr-001](adr-001-solvability-by-reverse-path-carving.md) (core algorithm),
[adr-002](adr-002-seeded-determinism.md) (seeding/identity),
[adr-003](adr-003-verification-replay.md) (solvability verification).

## Goal

A "Play random level" mode: the player picks a difficulty (**easy / medium / hard**) and gets a
freshly generated level that is (a) *verified solvable*, (b) *difficult in proportion to the
chosen difficulty*, and (c) *visually coherent* — it should read like a real parking lot (grass
verges, bay rows, parked cars, curbed islands, trees), not tile noise.

## Why this is hard

Reversing a car+trailer is an unstable control problem; a randomly assembled lot easily produces
unwinnable levels. Checking solvability *after* random assembly requires a motion planner for
articulated vehicles — heavy, and it can fail on solvable levels.

## Core idea: reverse-path carving (ADR-001)

The kinematic model is **time-reversible in the continuous limit**: the configuration path
(rear axle, heading, hitch angle ψ) depends on the *achieved* steer as a function of arc length,
not on speed or direction of traversal. The discrete Euler stepper retraces it up to O(dt)
residuals, which the closed-loop verification replay (ADR-003) absorbs. So we generate the
solution first and build the level around it:

1. **Drive in.** Place the rig **entirely outside** the exit line (front bumper ~0.2 m outside,
   heading inward — so the win-crossing segment is part of the recorded path) and simulate driving
   **forward** into the empty lot with a guidance controller (below). Every step is a real
   `stepRig` step at the game's fixed timestep (**1/120 s**, the sandbox `DEFAULT_DT` — exported
   from one shared place). Record per step: pose, ψ, **achieved** steer (post-slew `rig.car.steer`,
   not the command), cumulative arc length `s`, and both footprint OBBs.
2. **Carve the corridor.** The union of swept footprints, inflated by a difficulty-scaled
   **clearance margin**, is the protected free space. The margin **tapers to 0.3 m over the final
   ~12 m of arc** (near the player start) so flanking parked cars are placeable, and the **car's**
   footprint (not the trailer's) is additionally inflated by a *correction allowance* (0 / 0.2 /
   0.4 m by difficulty) so the player always has forward-shunt room where the car swept.
3. **Start = end.** The drive-in's final pose becomes the level `drivable` (trailer spawns aligned,
   which the docking phase guarantees to within 1° — a correctness input to the verifier's initial
   error, not just polish). The exit is where the drive-in began.
4. **Decorate.** Fill the rest with structured decorators (below); every candidate is rejected if
   it intersects the corridor. Then **enforce difficulty**: if the required pinch points didn't
   occur naturally, actively place them (see Difficulty).
5. **Verify by replay (ADR-003).** Rebuild via `levelToWorld` and drive the recorded solution
   backwards through the *real* `stepWorld` with a closed-loop tracker. Ship only levels whose
   replay fully crosses the exit (`hasRigCrossedExit`). On failure: re-decorate with 1.5× margin,
   then re-roll derived seeds (bounded). Never ship unverified.

## Module layout

```
src/engine/math/rng.ts                 # Rng interface + mulberry32 (game-agnostic, seeded)
src/game/level/random/
  difficulty.ts                        # Difficulty type + parameter table
  drive-in.ts                          # forward drive-in: waypoints + pure pursuit + recording
  corridor.ts                          # swept-corridor clearance queries (tapered margins)
  decorate.ts                          # grass/islands/bays/cars/curbs/trees + pinch enforcement
  reverse-tracker.ts                   # closed-loop reverse tracking (verification)
  generate-level.ts                    # orchestrator: generateRandomLevel({seed, difficulty, catalog})
```

`generateRandomLevel` returns `{ level, solution, replaySeconds, attempts }`; only `level` crosses
into the app shell. All modules pure, DI-friendly, engine-agnostic (arrows game→engine only —
`stepRig`, `stepWorld`, `rigFootprints`, `levelToWorld`, tile helpers, `hasRigCrossedExit`).

### RNG (engine layer)

```ts
export interface Rng { /** Uniform float in [0, 1). */ next(): number }
export function mulberry32(seed: number): Rng;
// helpers: rngRange({rng, min, max}), rngInt({rng, min, max}), rngPick(rng, items)
```

No `Math.random` anywhere in the generator. The seed *source* is injected into the app shell
(`drawSeed?: () => number`, defaulting to a `Math.random`-based draw) so tests control it.

## Phase 1 — lot skeleton

- `tileSize = 2.5` m; grid size by difficulty. Asphalt fill + 1-tile grass border ring.
- Random exit edge (N/E/S/W). The **grass-ring opening is a whole-tile span (3 tiles)** with the
  precise wall gap centred inside it (so curb pill-ends terminate on tile edges); gap centre at
  least 2 tiles + half-gap from corners. An asphalt access-road stub replaces the ring in front of
  the gap. `boundaryWithExitGap` opens the wall automatically.

## Phase 2 — drive-in (the hidden solution)

**Start pose:** heading = `−outward`; rear axle at exit midpoint + `outward · (frontOverhang +
0.2 m)` (sedan front overhang ≈ 3.6 m from rear axle) — the whole rig strictly outside the exit's
outward half-plane. Cruise with bang-bang throttle to a ~3 m/s target (better sample density and
reverse-slew headroom than full speed).

**Straight run-in.** Steer is locked to 0 until the trailer tail is ≥ 1 m inside the exit line,
plus an extra straight of 4 / 1 / 0 m (easy/med/hard) — so the *player's final move* is always
"line it up, then straight back through the gate"; difficulty lives mid-path, never at the gap.

**Waypoint chain.** k waypoints (difficulty), each sampled at 6–14 m distance with per-segment
turn Δθ capped by difficulty **and by feasibility**: `Δθ ≤ segLen / (1.25 · R_eff)` and
`segLen ≥ 2·R_eff·sin(Δθ/2)·1.1`, where `R_eff = L / tan(0.64·steerMax) ≈ 6.5 m` (see steering
cap below). Waypoints are biased to the central ~60 % of the interior (no wall-hugging corridors),
must keep ≥ corridor-half-width + 1 tile from walls, and a chain whose polyline self-intersects is
resampled. Chain acceptance floors (difficulty): total arc length, straight-line start↔exit
distance, path bounding box spanning ≥ 45 % of the interior on one axis, and the final heading not
within ±30° of pointing back at the gap.

**Guidance.** Pure pursuit on the car (lookahead ≈ 4.5 m), steer clamped to **0.64 · steerMax**
(NOT 0.8 — at 0.8 the steady-state hitch angle ψ_ss ≈ 47.5° collides with the 0.6·jackknifeMax
safety clamp at 48°; at 0.64 ψ_ss ≈ 0.45·jackknifeMax ≈ 36°, leaving real headroom, with
R_min ≈ 6.5 m). Safety: if |ψ| > 0.6·jackknifeMax, hold steer 0 until it decays; **every step
checks the swept rig against the boundary OBBs and grid bounds** — contact aborts and resamples
the chain (the corridor cannot protect against walls; they aren't decoration).

**Docking finish.** After the last waypoint, snap onto the nearest **axis-aligned, cell-centred
lane** (choose the axis nearest current heading), pure-pursue the lane centreline until heading
error < 2°, lateral error < 0.15 m and |ψ| < 1°, then brake to stop. On success the decorator may
paint a `bay`+`bay-open` **under the car** (caravan pokes into the aisle — exactly the built-in
`reverse-out` composition) and place flanking parked cars at ±1 bay column (allowed by the margin
taper). If docking fails its step budget, fall back to "straighten anywhere" (|ψ| < 1° still
required) without the bay dressing.

Retries: waypoint-chain aborts resample within the same RNG stream (deterministic); after 8 chain
failures the seed attempt fails upward to the orchestrator.

## Phase 3 — decoration

Order (all candidates corridor- and mutual-overlap-checked; tile checks via the corridor's cell
shadow, car placements via exact OBB-vs-swept-OBB SAT with the local margin):

1. **Rectangular grass islands** (2×3 … 3×5 — no "rounded blobs"; curb runs merge straight, so
   rounded corners become zigzag artifacts), full-perimeter curbs, 1–2 trees/hedges inside.
   Easy guarantees ≥ 1 island (anti-desolation).
2. **Bay rows** with aisle rules: min run 3 bays (2 allowed only when flanking the dock); the 2
   tiles in front of every entrance must be asphalt (corridor counts); opposing entrances ≥ 2
   tiles apart; rows attach to the grass ring or island long edges only — never floating, never on
   the access road. Occupancy ~0.6 across difficulties (density is scenery; difficulty comes from
   pinches). Parked cars in bays never tow (a towed rig doesn't fit a 5 m bay); only **loose cars**
   (hard) may tow, placed parallel along edges.
3. **Loose parked cars** (hard: 1–3) axis-aligned near edges.
4. **Open-space fill** (medium/hard). After the scenery pass, keep dropping curbed islands on
   interior non-corridor asphalt until the open fraction (plain asphalt / interior non-corridor
   cells) is ≤ `maxOpenFraction` (medium 0.55, hard 0.32; best-effort — reserved bay aisles stay
   open). Without this the lot outside the corridor is an empty field: the player just U-turns in
   the open and never meets the pinch points, so hard plays easy. Adjacent islands merge (no curb
   between green cells; the shared edge's older curb is removed).
5. **Curbs** along remaining grass↔asphalt boundaries (not the access road).
6. **Trees** on ring grass, ≥ 3 tiles apart, ≤ ~6 per level (sparse is the built-ins' style).

**Pinch enforcement (difficulty guarantee).** After decoration, sample free width along the
corridor. Required: ≥ 2 (medium) / ≥ 3 (hard) pinch points where total corridor width ≤
`rigWidth + 2·margin + 0.5 m`, pinches ≥ 8 m apart in arc length, none within the first/last 10 m.
If the roll under-delivered, actively place a curbed island or 3-bay run tangent to the corridor
at the widest remaining gap until satisfied (bounded attempts; failure → seed attempt fails).
This turns difficulty from an expected value into a guarantee.

## Difficulty table (initial tuning)

| Knob | Easy | Medium | Hard |
|---|---|---|---|
| Grid (cols×rows) | 12×14 | 13×15 | 15×17 |
| Exit wall gap | 7.5 m | 6.0 m | 5.0 m |
| Waypoints k | 1–2 | 2–3 | 3–5 |
| Max per-segment turn | 35° | 70° | 100° (feasibility-capped) |
| Base clearance margin | 2.0 m | 1.3 m | 1.0 m |
| Car correction allowance | 0 | 0.2 m | 0.4 m |
| Required pinch points | 0 | 2 | 3 |
| Min arc length | 15 m | 25 m | 35 m |
| Min start↔exit distance | 10 m | 14 m | 18 m |
| Extra straight run-in | 4 m | 1 m | 0 m |
| Grass islands | 1–2 | 1–2 | 2–3 |
| Loose cars | 0 | 0–1 | 1–3 |
| Max open fraction (fill) | 1 (no fill) | 0.55 | 0.32 |

Player rig: always the **red sedan + white caravan** (game identity). Par:
`parSeconds = clamp(ceil(1.6 × replaySeconds), max(20, arc/2.4), 180)` rounded up to 5 s
(2.4 = 0.6·maxSpeedReverse guards against a too-cautious tracker inflating par).

## Phase 4 — verification replay (ADR-003)

Closed-loop cascade tracker, reversing along the recorded path (reference indexed by arc length,
windowed lookup around expected progress). With this codebase's conventions (+y up, headings CCW,
**ψ = carHeading − trailerHeading**, hitchOffset h > 0 behind the rear axle) and v < 0:

```
e_y     = n̂ · (trailerAxle − path(s))        n̂ = left normal of the FORWARD path tangent
θᵗ_des  = θ_tan(s) + clamp(atan(k_y·e_y), ±0.5 rad)
ψ_des   = clamp( −k_θ · wrap(θᵗ_des − θᵗ), ±0.7·jackknifeMax )     // NOTE the minus sign:
        // θ̇ᵗ ≈ (v/d)·ψ and v<0, so correcting a positive trailer-heading error needs ψ<0
steer   = clamp( steer_ff(s) + k_ψ·(ψ − ψ_des), ±steerMax )
```

Gains (≈3× bandwidth separation, speed-invariant ratios): `k_y = 0.18 m⁻¹`, `k_θ = 1.8`,
`k_ψ = 3` (dimensionless). Throttle is bang-bang around a target reverse speed (4 m/s straight,
2 m/s when |steer_ff| is high or |e_y| > 0.3·margin) — the model has no partial-speed regulation.
Past s = 0 the reference extrapolates straight along the s=0 tangent until the win predicate fires
(the recorded path already includes the outside-start crossing segment).

- **Pass:** `hasRigCrossedExit` before the budget `2.5 × (arcLength / 3 m/s) + 5 s`.
- **Fail:** cross-track `|e_y| > max(0.35 m, 0.5·local margin)`; **arc-progress stall** (< 1 cm
  over 30 consecutive throttled steps — catches both jackknife bind, which is otherwise
  unobservable from the returned state, and head-on collision dead-stops); or |ψ| ≥
  jackknifeMax − 3°; or budget exhausted.
- Failure policy: re-decorate at 1.5× margin → re-roll derived seed (≤ 5) → (orchestrator keeps
  drawing) — never ship unverified.

## UI / app integration

- **Menu:** a `🎲 Random level` card above the list with an Easy | Medium | Hard segmented control
  (≥ 44 px targets, in-app DOM). Tap = generate + play instantly. Last-picked difficulty persists
  to localStorage (`parking.randomDifficulty`) and is highlighted.
- **App shell:** new `playRandomLevel(difficulty)` on the `App` interface — builds
  `createPlayScreen` **directly** (not via `playLevel`, whose next-level lookup can't see random
  ids) with `onNextLevel: () => app.playRandomLevel(difficulty)` and a new
  `nextLabel: "Play another ▸"` threaded to the win overlay (`createWinOverlay` gains an optional
  `nextLabel`). Restart replays the same level (in-memory). `createApp` gains optional
  `drawSeed?: () => number`.
- **Win overlay:** shows "Under par!" when the run beat `parSeconds` (small, cheap, and random
  mode's whole reward loop is par).
- **Identity (ADR-002):** `id = "random-<difficulty>-<seed>"`; the id encodes the **requested**
  seed — internal re-rolls are part of the deterministic pipeline for that seed. Display name
  `Random <difficulty> #<seed in base36 uppercase>`. Session-only: never persisted, not in the
  menu list, no editor entry.
- **Boot param (v1):** `?rnd=<difficulty>:<seed>` in `main.ts` starts straight into that exact
  level — shareable seeds, and the hook the visual-verification screenshots use.

## Testing strategy (Vitest, deterministic)

- `rng.test.ts` — determinism, range.
- `drive-in.test.ts` — fixed seeds: stays in bounds, never touches boundary OBBs, |ψ| under clamp,
  ends straightened (|ψ| < 1°), floors respected (arc, start↔exit distance), records achieved steer.
- `corridor.test.ts` — tapered-margin clearance queries, hit/miss cases.
- `decorate.test.ts` — decorators never intersect corridor/each other; aisle rules hold; grid
  valid; pinch enforcement produces required pinches; directed adversarial cases for the
  relax/retry branches (coverage of failure paths).
- `reverse-tracker.test.ts` — tracks a recorded S-curve on an empty lot; sign regression test
  (a perturbed start converges, not diverges); stall detection fires on a walled path.
- `generate-level.test.ts` — structural properties over ~20 seeds × 3 difficulties
  (`validateLevel`, corridor clear of obstacles, deep-equal determinism, id/seed encoding);
  **full verification replay over ~3 seeds × 3 difficulties** (CI-time bounded — full-replay cost
  is ~0.1–0.5 s/level).
- `menu-screen.test.ts` / `app-shell.test.ts` — difficulty buttons wire through with injected
  `drawSeed`; "Play another" draws a new seed at the same difficulty; difficulty persistence.

## Resolved review decisions (rev 1 → rev 2)

- Tracker middle-loop sign flipped (**was the BLOCKER**); gains and clamps specified with units.
- Drive-in starts fully outside the exit line so the replay can actually satisfy the win predicate.
- Forward steer cap 0.8 → **0.64·steerMax** (jackknife-clamp headroom); tracker ψ_max 0.7·jk.
- Replay budget arc-length-normalised (reverse is speed-capped at half forward speed).
- Bind detection via arc-progress stall + ψ threshold (bind is invisible in returned state).
- Waypoint sampling coupled to turning-radius feasibility; self-intersecting chains rejected.
- Difficulty guaranteed via pinch points, not just permitted by margins; hard's base margin raised
  to 1.0 m (uniform 0.7 m everywhere is tedious, not fair) with car-side correction allowance.
- Margin taper near the start + bay painted under the car + flanking cars (the "parked" fantasy).
- dt corrected to 1/120 (shared constant); `Math.random` only via injected `drawSeed`.
- Bay aisle rules; rectangular islands; no towed trailers in bays; occupancy ≈ constant.
