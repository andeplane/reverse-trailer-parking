# ADR-003: Verification by closed-loop reverse replay

Status: **accepted** (reviewed, rev 2) · 2026-07-19

## Context

Reverse-path carving (ADR-001) guarantees a solution exists in the *continuous* kinematic model.
Two gaps remain between that guarantee and the shipped game: (a) discrete integration — the
fixed-timestep Euler steps of a reverse run do not exactly retrace the forward run's samples, and
reverse trailer motion amplifies small errors exponentially (time constant ≈ trailer length); (b)
the real game runs `stepWorld` (collision resolution, jackknife bind), not bare `stepRig`. A level
should not ship on a theoretical argument alone.

## Decision

Before a generated level is shown, **replay the solution in reverse through the real `stepWorld`**
with a small closed-loop tracking controller, and require `hasRigCrossedExit` to fire.

- **Feed-forward + feedback**: steering reference is the recorded forward profile (the *achieved*
  post-slew steer) indexed by arc length; feedback is a trailer-backing cascade — cross-track
  error of the trailer axle → desired trailer heading → desired hitch angle ψ → steering. In this
  codebase's convention (ψ = carHeading − trailerHeading, v < 0) the middle loop is
  **ψ_des = −k_θ · headingError** — the minus sign is load-bearing (θ̇ᵗ ≈ (v/d)·ψ with v < 0);
  review caught the opposite sign as a blocker. Gains (k_y = 0.18 m⁻¹, k_θ = 1.8, k_ψ = 3,
  ψ_des clamped to ±0.7·jackknifeMax) are fixed, tuned once in tests. Throttle is bang-bang
  around a target reverse speed (the model has no partial-speed regulation).
- **Reference lookup** is windowed around expected arc progress (paths may pass near themselves;
  nearest-point over the whole path could snap to the wrong branch). Past s = 0 the reference
  extrapolates straight along the s = 0 tangent; the recorded path starts with the rig fully
  outside the exit line, so the win-crossing segment is itself recorded.
- **Pass**: full rig crosses the exit (`hasRigCrossedExit`) within an **arc-length-normalised
  budget**, `2.5 × (recordedArcLength / 3 m/s) + 5 s` — reverse speed is capped at half the
  forward cruise, so "3× forward duration" under-budgets.
  **Fail**: budget exhausted; cross-track error > max(0.35 m, 0.5 × local margin); |ψ| within 3°
  of jackknifeMax; or **arc-progress stall** (< 1 cm progress over 30 consecutive throttled
  steps). The stall test matters: `stepRig`'s jackknife bind reverts the pose and zeroes speed
  without any observable flag, and a head-on collision dead-stop can have near-zero cross-track
  error — both are invisible to the other criteria.
- **Failure policy**: (1) re-decorate with 1.5× margin; (2) re-roll a derived seed (bounded, ~5
  attempts). Never ship an unverified level. Whole-pipeline cost is ≪ 100 ms per attempt, so
  re-rolling is cheap.
- The verified replay's duration also yields `parSeconds`.

## Alternatives considered

- **Open-loop replay** (recorded steering, no feedback): reverse instability amplifies the
  forward/backward discretisation mismatch roughly as e^(s/d) (d ≈ 2–3 m trailer length) — tens of
  metres of path can turn millimetre errors into metres. Rejected as the sole mechanism; retained
  as the feed-forward term.
- **No verification** (trust ADR-001): leaves the discretisation + collision-pipeline gaps open;
  one impossible level costs more player trust than the verifier costs to build. Rejected.
- **Ship-on-timeout after N failures** ("probably solvable"): violates the product bar; re-rolling
  is cheap enough to keep the guarantee absolute. Rejected.
- **Full motion planner as verifier**: strictly harder than tracking a known-good path. Rejected.

## Consequences

- Every shipped random level has been *driven to completion by the game's own physics* — the
  strongest practical guarantee available.
- The tracker is reusable test infrastructure: it can regression-test the vehicle model (a physics
  change that breaks tracking of known paths is a red flag) and could later power a hint/ghost
  feature.
- The tracker adds one tuned component; its gains are validated by the generator's own property
  tests across seeds, so a bad tune fails loudly in CI, not in production.
