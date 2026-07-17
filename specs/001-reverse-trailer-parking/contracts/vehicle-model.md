# Contract: Vehicle Model & World (pure simulation API)

`src/game/vehicle/` — the deterministic, Phaser-free core. Public contract for the rest of the
game and the tests. Geometry is derived from explicit coordinates; kinematics + collision run at
a fixed timestep.

## Geometry derivation — `vehicle-geometry.ts`

```ts
function deriveCarGeometry(variant: CarVariant): {
  rearAxleCentre: Vec2; frontAxleCentre: Vec2; forward: Vec2;
  wheelbase: Metres; trackWidth: Metres; hitchOffset: Metres; // signed, behind rear axle
};
function deriveTrailerGeometry(variant: TrailerVariant): {
  axleCentre: Vec2; trailerLength: Metres;
};
function carFootprint(car: CarState, variant: CarVariant): Obb;      // world OBB
function trailerFootprint(trailer: TrailerState, hitchWorld: Vec2, variant: TrailerVariant): Obb;
function wheelWorldPositions(car: CarState, variant: CarVariant): { fl:Vec2; fr:Vec2; rl:Vec2; rr:Vec2 };
function hitchWorld(car: CarState, variant: CarVariant): Vec2;
```
**Contract**: pure; outputs are exact functions of variant + state. `wheelbase, trailerLength > 0`;
`hitchOffset` finite. These derived values feed the kinematics so the equations are correct for
**any** variant (satisfies FR-016a/b — "the 4 wheel positions + hitch position, math correct").

## `stepRig` — kinematics only (no collision)

```ts
function stepRig(args: {
  rig: Rig; input: ControlInput; dt: Seconds; catalog: VariantCatalog;
}): Rig;
```
- **Pure**, no mutation, deterministic. Advances one car (+ optional trailer) by the bicycle +
  articulation model using **derived** `L, h, d`.
- **Postconditions** (every input): `|steer| ≤ steerMax`; `−vMaxR ≤ speed ≤ vMaxF`;
  `|ψ| ≤ jackknifeMax`; headings ∈ `(−π,π]`; all finite.
- **Guarantees** (tested): accelerate-not-teleport (FR-005); brake to exactly 0 (FR-006); reverse
  symmetry (FR-007); stationary-steer ⇒ no move (FR-010); straight-line `φ→θ` (FR-012); reverse
  grows `|ψ|` then clamps (FR-013/014); no trailer ⇒ car-only kinematics.

## `stepWorld` — kinematics + collision + multi-car

```ts
function stepWorld(args: {
  world: World; input: ControlInput; dt: Seconds;
}): World;
```
- **Pure**, deterministic. Advances **only** the drivable rig via `stepRig`, then resolves
  collision against every placed car's footprint(s) and the boundary (see contracts/collision.md).
  Placed cars are unchanged (immovable).
- **Preconditions**: `dt > 0`; exactly one `role:"drivable"` car; variants validated. `input`
  clamped internally.
- **Postconditions** (FR-016e/f, every input): after the step, neither the drivable car OBB nor
  its trailer OBB overlaps any placed-car OBB, any placed trailer OBB, or the boundary; the rig is
  never advanced *through* an obstacle (no tunnelling — the taken sub-step is checked, not just the
  endpoint); trailer coupling + jackknife clamp remain satisfied; all fields finite; same
  `(world, input, dt)` ⇒ identical `World'` (determinism, FR-016).

## Builders

```ts
function createWorld(args: {
  cars: CarSpawn[]; boundary: Obb[]; catalog: VariantCatalog;
}): World;                                   // validates exactly one drivable car
function createInitialRig(args: { variantId: string; trailerVariantId?: string;
  position?: Vec2; heading?: Radians }): Rig; // at rest, trailer in line (ψ=0)
```
`CarSpawn` = `{ variantId; role; position; heading; trailerVariantId? }`.

## Consumers
- `src/game/sandbox.ts` — calls `stepWorld` each fixed step with the current `ControlInput`.
- `src/game/view/world-view.ts` — reads `World` → `Entity[]` (never mutates).
- Tests — scripted `ControlInput` sequences over many steps assert all guarantees.
