# Contract: Collision (OBB + SAT, deterministic block/slide)

Pure, Phaser-free. Geometry primitives in `src/engine/math/obb.ts`; game resolution in
`src/game/collision/collision-system.ts`. Footprints come from vehicle geometry so they match the
straight-down sprites 1:1.

## OBB primitives — `src/engine/math/obb.ts`

```ts
interface Obb { center: Vec2; halfW: Metres; halfL: Metres; rotation: Radians }
function obbCorners(o: Obb): [Vec2, Vec2, Vec2, Vec2];
function obbOverlap(a: Obb, b: Obb): boolean;         // SAT: true iff overlapping
function obbMtv(a: Obb, b: Obb): Vec2 | null;         // min translation to separate a from b; null if disjoint
```
**Contract**: pure; `obbOverlap` is exact for oriented rectangles (SAT over the 4 face normals);
`obbMtv` returns the least-penetration push (magnitude + direction) or `null`. Symmetry/edge cases
(touching-but-not-overlapping, containment, rotated) covered by tests.

## Collision system — `src/game/collision/collision-system.ts`

```ts
function rigFootprints(rig: Rig, catalog: VariantCatalog): Obb[];     // car + trailer OBBs
function obstacleFootprints(world: World): Obb[];                     // placed cars + their trailers + boundary
function resolveRigCollision(args: {
  prevRig: Rig; sweptRig: Rig; obstacles: Obb[]; catalog: VariantCatalog; iterations?: number;
}): { rig: Rig; contacted: boolean };
```

**`resolveRigCollision` contract** (deterministic):
1. If `sweptRig` footprints don't overlap any obstacle → return `sweptRig`, `contacted:false`.
2. Otherwise **bisect** between `prevRig` (known clear) and `sweptRig` for a fixed number of
   iterations to the last non-overlapping interpolated pose → **stop at contact** (tunnelling-proof
   because `prevRig` was clear and we search the taken step).
3. Apply **MTV** to eliminate any residual overlap (push out along least-penetration axis).
4. **Slide (enhancement)**: project leftover motion onto the contact tangent; zero the
   into-surface component so the rig grazes rather than dead-stops.
5. Re-derive the trailer from the corrected car pose and re-apply the jackknife clamp.

- **Postconditions**: returned rig footprints overlap **no** obstacle; never placed *through* an
  obstacle; pure/deterministic (same inputs ⇒ same output); finite.
- **Baseline vs enhancement**: steps 1–3 (block-at-contact + MTV) are the **required** baseline
  (satisfies "cannot overlap or pass through", FR-016e). Step 4 (sliding) is polish and may land in
  the Polish phase if it risks determinism.

## Interpolation helper

```ts
function lerpRig(a: Rig, b: Rig, t: number, catalog: VariantCatalog): Rig; // t∈[0,1], re-derives trailer
```
Used by the bisection; pure and tested (endpoints, midpoint, angle wrap).

## Consumers
- `stepWorld` calls `resolveRigCollision` after `stepRig` each fixed step.
- Tests: drive the rig into a placed car / boundary at low and **full speed**, assert no overlap
  and no tunnelling; reverse a trailer into an obstacle; wedge between two placed cars; placed car
  that itself has a trailer.
