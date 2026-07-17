# Data Model: Reverse Trailer Parking — Driving Sandbox (Milestone 1)

All in-memory (no persistence). Types in `src/game/vehicle/vehicle-types.ts` unless noted.
Angles **radians**, distances **metres**, time **seconds** — branded so units can't mix.
**Geometry is authored as explicit coordinates; scalars (L, h, d, track, footprint) are
derived**, never hand-entered (see `vehicle-geometry.ts`).

## Branded units & primitives

```ts
type Radians = number & { readonly __brand: "Radians" };
type Metres  = number & { readonly __brand: "Metres" };
type Seconds = number & { readonly __brand: "Seconds" };
type MPerS   = number & { readonly __brand: "MPerS" };     // signed speed (− = reverse)
interface Vec2 { x: Metres; y: Metres }                    // helpers in engine/math/vec2.ts
```

## Authored geometry (variants — pure data)

Body-local coordinates: origin at the body reference, `+x` = forward (nose), `+y` = left.

### CarVariant
| Field | Type | Meaning |
|---|---|---|
| `id` | `string` | Variant name (e.g. `"sedan"`, `"long-suv"`) |
| `wheels` | `{ fl: Vec2; fr: Vec2; rl: Vec2; rr: Vec2 }` | Body-local wheel centres (front steer, rear fixed) |
| `hitch` | `Vec2` | Body-local trailer-hitch position |
| `bodyWidth`,`bodyLength` | `Metres` | Footprint size (roof-view sprite extent) |
| `steerMax` | `Radians` | Max front-wheel lock each way (`0 < steerMax < π/2`) |
| `maxSpeedForward`,`maxSpeedReverse` | `MPerS` | Speed caps |
| `accel`,`brake` | number | m/s² throttle / braking |
| `steerRate` | number | rad/s steer slew |
| `jackknifeMax` | `Radians` | Max \|car−trailer\| angle (`0 < ψmax < π`) |
| `texture` | `string` | Sprite asset key |

### TrailerVariant
| Field | Type | Meaning |
|---|---|---|
| `id` | `string` | Variant name |
| `hitch` | `Vec2` | Body-local coupling point (front of draw bar) |
| `axleWheels` | `{ l: Vec2; r: Vec2 }` | Body-local axle wheel centres |
| `bodyWidth`,`bodyLength` | `Metres` | Footprint size |
| `texture` | `string` | Sprite asset key |

`variants.ts` exports a validated catalog; `createVariant*`/`validateVariant*` throw `RangeError`
on bad geometry (non-positive sizes, degenerate axles, steer/jackknife out of range).

### DerivedGeometry (computed, not stored) — `vehicle-geometry.ts`
`rearAxleCentre`, `frontAxleCentre`, forward axis `û`, `wheelbase L`, `trackWidth`,
`hitchOffset h` (signed, behind rear axle) for cars; `axleCentre`, `trailerLength d` for
trailers; and a `footprint` OBB. Pure functions of the variant. Kinematics/collision consume
these — so the equations are correct for any variant by construction.

## Runtime state

### CarState
| Field | Type | Meaning |
|---|---|---|
| `variantId` | `string` | Which `CarVariant` |
| `role` | `"placed" \| "drivable"` | Runtime role (one drivable per world) |
| `rearAxle` | `Vec2` | World rear-axle centre (reference point) |
| `heading` (`θ`) | `Radians` | Body yaw, normalised `(−π, π]` |
| `speed` (`v`) | `MPerS` | Signed (placed cars: `0`) |
| `steer` (`δ`) | `Radians` | Front-wheel angle, `\|δ\| ≤ steerMax` |
| `trailer` | `TrailerState \| null` | Optional towed trailer (0 or 1) |

### TrailerState
| Field | Type | Meaning |
|---|---|---|
| `variantId` | `string` | Which `TrailerVariant` |
| `heading` (`φ`) | `Radians` | Body yaw, normalised `(−π, π]` |

> Wheel/hitch/axle world positions and footprint OBBs are **derived** each step/frame from
> state + variant geometry (never stored) to avoid drift.

### Rig
`{ car: CarState; trailer: TrailerState | null }` — a car and its trailer as the coupled unit.

### World
| Field | Type | Meaning |
|---|---|---|
| `cars` | `CarState[]` | All vehicles; exactly one `role: "drivable"` |
| `boundary` | `Obb[]` (or bounds rect) | Solid outer walls |
| `catalog` | `{ cars: CarVariant[]; trailers: TrailerVariant[] }` | Variant lookup |

Helpers: `drivableCar(world)`, `placedCars(world)`.

### ControlInput (`src/engine/input/input-source.ts`)
```ts
interface ControlInput { throttle: number; steer: number; } // both clamped [-1, 1]
```
Uniform, source-agnostic (keyboard/touch/scripted). `throttle`: +fwd / 0 coast-brake / −rev.
`steer`: target steer as fraction of the drivable car's `steerMax`.

### Obb (`src/engine/math/obb.ts`)
```ts
interface Obb { center: Vec2; halfW: Metres; halfL: Metres; rotation: Radians }
```
Oriented box for footprints/boundary. Functions: `obbOverlap(a,b): boolean`,
`obbMtv(a,b): Vec2 | null` (minimum translation vector, `null` if disjoint).

### Entity (render view-state, `src/engine/render/renderer.ts`)
```ts
interface Entity { id: string; texture: string; position: Vec2; rotation: Radians }
```
`world-view.ts` maps `World → Entity[]` (each car + its trailer, plus optional wheel marks).

## Relationships

```
CarVariant/TrailerVariant ─(derive)→ DerivedGeometry ─┐
World { cars[], boundary, catalog } ──────────────────┼─▶ stepWorld(world, input, dt) ─▶ World'
ControlInput ─────────────────────────────────────────┘        │
                                                                ├─▶ world-view: Entity[] ─▶ Renderer
                                                                └─▶ steering-indicator: δ ─▶ HUD
```
- `World` 1—* `Car`; `Car` 0..1 `Trailer`; each vehicle references a variant for geometry.
- Exactly one `Car.role === "drivable"`; placed cars are immovable.

## State transitions (per fixed step `dt`) — drivable rig only

1. **Speed** `v` ← accelerate toward `throttle` (cap `vMaxF/vMaxR`) or brake to 0.
2. **Steer** `δ` ← slew toward `steer·steerMax`, clamp `±steerMax`.
3. **Car pose** ← integrate `θ̇ = v·tan(δ)/L`, then `rearAxle` along `θ` (L derived).
4. **Trailer** (if any) ← integrate `φ̇ = (v/d)·sin(θ−φ) − (h/d)·θ̇·cos(θ−φ)` (h, d derived).
5. **Jackknife clamp** ← clamp `ψ = θ−φ` to `±ψmax`; re-derive `φ`.
6. **Collision** ← build rig footprints (car + trailer OBB); if overlapping any placed-car OBB
   or boundary: bisect the sub-step to the last non-overlapping pose, apply MTV, optionally slide;
   re-derive trailer + re-clamp `ψ`. (See contracts/collision.md.)
7. **Normalise/guard** ← wrap `θ,φ`; assert finite.

**Invariants** (tested): `|δ| ≤ steerMax`; `−vMaxR ≤ v ≤ vMaxF`; `|ψ| ≤ ψmax`; `θ,φ ∈ (−π,π]`;
no rig OBB overlaps a placed-car OBB or boundary after a step; all fields finite for every input.

## Validation rules

- Variants validated once when the catalog is built (throws on bad geometry).
- `ControlInput` clamped to `[-1,1]` at the adapter boundary.
- Exactly one drivable car per `World` (validated at construction).
- Impossible states unreachable by construction: jackknife + speed clamps, and post-step
  collision resolution guarantees no penetration.
