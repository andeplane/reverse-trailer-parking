# ADR-001: Solvability by reverse-path carving

Status: **accepted** (reviewed, rev 2) · 2026-07-19

## Context

Randomly generated reverse-trailer-parking levels must be winnable. Reversing an articulated rig is
kinematically constrained (bounded steering, jackknife limit, no side-slip), so naive random
placement frequently produces unwinnable maps, and players punished by an impossible level will not
know it was impossible.

## Decision

Generate the **solution before the level**: simulate the rig driving *forward in through the exit*
into an empty lot using the game's own `stepRig` kinematics, record the swept corridor, make the
final pose the player's start, and only place obstacles that stay clear of the corridor (by a
difficulty-scaled margin). The time-reversed drive-in is then a feasible winning run by
construction, and a closed-loop replay through the full collision pipeline (ADR-003) verifies it
end-to-end before the level is shown.

Why this is sound: the kinematic bicycle+trailer model is time-reversible *in the continuous
limit* — dθ/ds and dθᵗ/ds depend only on the achieved steer as a function of arc length and flip
sign with velocity, so the configuration path is direction-invariant. (Review note: the discrete
Euler stepper is *not* exactly its own inverse — per-step residuals are O(dt²), amplified as
e^(s/d) when reversed open-loop — which is precisely why verification is closed-loop, ADR-003.)
A forward path that never exceeds the jackknife limit is traversable in reverse with the same
steer-by-arc-length profile, and reverse traversal at |v| no greater than the forward speed never
demands more steering slew than the forward pass achieved. Forward simulation is trivially stable
(the trailer self-centres: the ψ-dynamics eigenvalue is −(|v|/d)·cos ψ < 0 driving forward), so
generation never fights the instability that makes reverse planning hard.

## Alternatives considered

- **Generate-then-solve** (random lot + articulated-vehicle motion planner, e.g. RRT/hybrid-A* in
  the (x, y, θ, ψ) space): the planner is by far the most complex component, its failures are
  ambiguous (unsolvable level vs. planner timeout), and its solution paths look robotic. Rejected
  for complexity and false negatives.
- **Template/chunk assembly** (hand-authored solvable fragments stitched together): guarantees
  local solvability only; corridor continuity across seams still needs a global check; variety is
  bounded by the template library. Rejected — more authoring, weaker guarantee.
- **Rejection sampling with a heuristic check** (e.g. corridor-width flood fill): a width heuristic
  cannot capture articulated reversing feasibility (curvature + jackknife constraints); would ship
  impossible levels. Rejected.

## Consequences

- Solvability is by construction + verification, not probabilistic.
- The generator owns a *known solution* per level: enables par times, future ghost/hint replays,
  and regression tests.
- Difficulty maps cleanly onto corridor margin, path curvature/length, and obstacle density.
- The guaranteed corridor means a *forward* escape (turning around) may also exist on easy — that
  is acceptable and self-corrects as margins shrink with difficulty.
- The generator depends on the vehicle model; if `stepRig`'s equations change, recorded solutions
  change with it (they are re-simulated per generation, never stored), so there is no persistence
  coupling.
