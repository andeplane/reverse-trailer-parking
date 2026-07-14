# Research: Reverse Trailer Parking — Driving Sandbox (Milestone 1)

Engine, controls, and the base motion model were decided during `/speckit-specify`. The
`/speckit-clarify` session (2026-07-14) expanded scope to **explicit-coordinate geometry**,
**geometry-driven variants**, **multiple cars (placed + drivable, one type)**, **optional
trailers on any car**, and **solid-body collision**. This document records all decisions with
rationale and the math.

---

## Decision 1 — Rendering/engine: Phaser 3 (render/input only)

**Decision**: **Phaser 3** for rendering, input, camera, and viewport scaling (Scale Manager),
confined to `src/engine/`. **No** Phaser physics (Arcade/Matter) for the vehicle or collision.

**Rationale**: batteries-included WebGL/Canvas rendering, Scale Manager (responsive +
orientation), camera follow, sprites, cross-device input — the parts we don't want to hand-roll
on mobile. Its physics engines are the wrong tool: our motion is *geometric* (kinematic) and our
collision is a small, deterministic SAT check we control.

**Alternatives**: PixiJS + own everything (more plumbing, rejected); plain Canvas (most
boilerplate, rejected); Phaser physics for the rig/collision (jittery articulation,
non-deterministic, rejected — see Decisions 2 & 4).

**Wiring**: `phaser-renderer.ts` implements a generic `Renderer` against a tiny `PhaserSurface`
seam, unit-testable with a fake surface; engine choice stays reversible.

---

## Decision 2 — Vehicle motion: our own kinematic model (NO physics engine)

**Decision**: **Kinematic bicycle model** for the car + **one-trailer articulated kinematics**
for the trailer, integrated at a **fixed timestep**, with **simple accelerate/brake** speed.

**The math** (radians, metres; car reference = rear-axle centre). State: rear-axle `(x,y)`,
heading `θ`, signed speed `v`, steer `δ`; trailer heading `φ`; articulation `ψ = θ − φ`.

```
speed:   v += throttle·aThrottle·dt (clamp ±vMax) ; throttle==0 ⇒ brake toward 0, snap at 0
steer:   δ slews toward s·δmax, clamp ±δmax          (s = normalised steer input)
car:     θ̇ = (v/L)·tan(δ) ;  ẋ = v·cosθ ;  ẏ = v·sinθ     (θ̇ ∝ v ⇒ stationary steering ⇒ no turn)
trailer: φ̇ = (v/d)·sin(θ−φ) − (h/d)·θ̇·cos(θ−φ)
clamp:   ψ = θ − φ into [−ψmax, ψmax] ; re-derive φ           (jackknife stop)
```
Forward (`v>0`) settles `φ→θ`; reverse (`v<0`) destabilises → jackknife, then clamps. This is
the no-side-slip rolling-constraint result: **direction emerges from the wheels**, not a set
heading. Simple longitudinal dynamics: accelerate on throttle, brake to a stop on release.

**Rejected**: rigid-body engine + revolute hitch (jittery, non-deterministic, heavy); full
tire-force/slip model (needless for slow parking, non-deterministic to tune).

---

## Decision 3 — Geometry authored as explicit coordinates (clarified)

**Decision**: A vehicle **variant** is authored as explicit coordinates — the (x, y) body-local
positions of its wheels (`FL, FR, RL, RR` for a car; axle wheels for a trailer), its body
**width/length**, and (cars) the (x, y) **hitch** position. Every scalar the kinematics and
collision need is **derived** from these, so the math is correct for any variant.

**Derivations** (`vehicle-geometry.ts`, pure):
- `rearAxleCentre = midpoint(RL, RR)`, `frontAxleCentre = midpoint(FL, FR)`
- longitudinal axis `û = normalise(frontAxleCentre − rearAxleCentre)`
- **wheelbase** `L = |frontAxleCentre − rearAxleCentre|`
- **track width** `= |RL − RR|` projected ⟂ `û` (render/footprint; not used by turning)
- **hitch offset** `h = (rearAxleCentre − hitchLocal) · û` (signed distance behind rear axle),
  plus any lateral hitch offset carried through to world placement
- trailer: `axleCentre = midpoint(axle wheels)`; **trailer length** `d = |hitchLocal − axleCentre|`
- **footprint** = an oriented box `width × length` centred on the body (for collision + sprite)

**Rationale**: matches the user's exact framing ("the 4 wheels have x,y positions, the hitch has
an x,y position, and the math must be right"). Coordinates are the single source of truth;
`L, h, d, track, footprint` are computed, never hand-entered inconsistently. New variants =
pure data. The proven bicycle/trailer equations are reused unchanged with derived `L, h, d`.

**World placement**: a wheel/hitch/footprint in world space = variant-local coord rotated by the
body heading and translated to the body's world reference — one shared transform helper.

**Rejected**: a single scalar `wheelbase` param (loses wheel/hitch positions the user wants
explicit, and can't place the 4 wheels or an offset hitch correctly).

---

## Decision 4 — Collision: our own OBB + SAT, deterministic block/slide

**Decision**: Each vehicle body (car and trailer) is an **oriented bounding box (OBB)** sized
`width × length` from its geometry. Overlap is tested with the **Separating Axis Theorem
(SAT)**, which also yields the **minimum translation vector (MTV)**. The boundary is walls as
OBBs/half-planes. With only a handful of vehicles, test all pairs (O(n²), n small) — no
broadphase needed.

**Resolution** (drivable rig vs immovable placed vehicles + boundary), deterministic:
1. Advance the rig one fixed step (Decision 2).
2. Test the car OBB and trailer OBB against every obstacle OBB + boundary.
3. On any overlap, **bisect the sub-step** (halve the advanced fraction a few fixed iterations)
   to find the last non-overlapping position → the rig **stops at contact** (no tunnelling, even
   at speed, because we check the taken step, not just the endpoint).
4. Apply the **MTV** to remove any residual overlap (push out along the least-penetration axis).
5. **Slide (enhancement)**: project the remaining velocity onto the contact tangent so the rig
   grazes along an obstacle instead of dead-stopping; zero the into-surface component.
6. Re-derive the trailer pose from the corrected car pose and re-apply the jackknife clamp so
   the coupling stays consistent.

Placed cars are **immovable** (no push, bounce, momentum, or damage this milestone).

**Rationale**: OBB+SAT is the standard, cheap, exact test for oriented rectangles and matches the
straight-down footprints 1:1. Bisection-to-contact is simple, deterministic, and tunnelling-proof
for our speeds; MTV guarantees no residual overlap; sliding is a small polish on top. Everything
is pure → unit-testable and reproducible. Fixed-timestep sub-stepping keeps `stepWorld`
deterministic (FR-016, FR-016f).

**Rejected**: circle/AABB approximations (wrong footprint for long angled vehicles); a physics
engine's contact solver (non-deterministic, heavy); speculative/CCD raycast contact (overkill at
these speeds — bisection suffices).

**Sequencing note**: full **sliding** (step 5) is the one piece we may land last / defer to
polish if it complicates determinism; **block-at-contact + MTV** (steps 3–4) is the required
baseline and satisfies "cannot overlap or pass through."

---

## Decision 5 — Multi-car world, one type, optional trailer (clarified)

**Decision**: A `World` holds a list of `Car` instances; **exactly one** has `role: "drivable"`,
the rest `role: "placed"`. Each car optionally owns one `Trailer`. `stepWorld(world, input, dt)`
advances only the drivable rig (kinematics + collision vs all placed cars & boundary); placed
cars are static. One `Car` type serves both roles — role is a field, not a subclass.

**Rationale**: matches "all cars can be placed AND drivable" and "parked cars can also have a
trailer." Keeps a single geometry/render/collision path for every vehicle. Trivially generalises
to future levels (just author more placed cars). Rendering iterates all vehicles → `world-view.ts`
maps each car + trailer (+ wheels) to `Entity[]`.

**Rejected**: separate `Obstacle` vs `PlayerCar` types (duplicates geometry/render/collision,
rework later); trailer welded to a single rig (can't give placed cars trailers).

---

## Decision 6 — Controls: uniform `ControlInput`, DOM overlay

Unchanged from specify. Both sources emit `{ throttle ∈ [−1,1], steer ∈ [−1,1] }`; the model
consumes it so desktop and mobile behave identically. Desktop: ↑/↓ throttle, ←/→ ramp/recenter
steer, `R` reset. Mobile: forward/reverse buttons + right-side steering slider (position = steer
angle); multi-touch. HUD (drive buttons, slider, steering-wheel indicator per FR-004a) is a
**responsive DOM overlay** — native multi-touch, `touch-action:none` (no scroll/zoom/select),
CSS responsive layout for portrait/landscape ≥360px. Keeps Phaser focused on the world.

---

## Decision 7 — Visual style: pure straight-down top-down (matches reference image)

**Decision**: 100% orthographic overhead — **no** camera tilt/perspective/isometric skew; the
camera pans (follow the drivable rig) / zooms but never rotates to an angle. Sprites are flat
overhead roof-view art placed on a 2D plane and rotated in-plane by heading; z-order ground →
trailers → cars. Collision OBBs live in the same ground plane as the sprites (footprints match
art 1:1).

**Sprite briefs** (`ai-image-generator`, transparent PNG, GPT Image 1.5): `car` (one or a few
variants), `trailer`, `steering-wheel` (HUD, exempt), optional tarmac tile. Every prompt ends
"top-down, straight overhead view, no perspective, no tilt, no text, no watermarks, no logos".
Keep prompts consistent so variant sprites share scale/style/palette. Placeholder quality is fine
this milestone. Saved to `public/assets/`, committed by name.

---

## Decision 8 — Testing: aim high, 80% is the only gate

**Decision**: **Aim for 100% but it is NOT required** (some real Phaser bootstrap / browser-
gesture behaviour is genuinely hard to test — we won't fake tests to hit a number). **Only 80%
is a hard gate.** Push all logic into pure, injectable units; keep Phaser/DOM at the edge behind
seams.

- Pure & exhaustively tested: `angles`, `vec2`, `obb` (SAT/MTV), `vehicle-geometry` (derived
  L/h/d/track/footprint), `vehicle-model` (`stepRig`), `collision-system`, `world` (`stepWorld`,
  incl. block/slide, no-tunnel-at-speed, determinism, no-NaN), `variants` validation, `world-view`,
  input mappings, `steering-indicator`.
- `fixed-step-loop` — `FakeClock` + scripted frames. `phaser-renderer` — `FakePhaserSurface`.
  DOM overlay/touch — `jsdom`.
- Excluded: only `src/main.ts`.

**Rationale**: architecture isolates side-effecting code behind interfaces, so we approach 100%
naturally; anything genuinely awkward is left uncovered rather than faked, staying well above 80%.
