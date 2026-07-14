# IDEAS.md

A running backlog of ideas for the reverse-trailer-parking game. Not
commitments — a list to pull from. Roughly ordered by appeal, but reorder
freely. Keep the entry format: **title**, why it helps, and rough scope.

## 1. Trajectory guide lines ("easy mode") — predicted path overlay

Like the curved guide lines in a reversing car (e.g. Tesla's backup camera),
render **projected path curves directly into the top-down scene** showing where
the rig will go if the player holds the current steering angle.

- **Two independent sets of lines:**
  - **Car lines** — the arc the car's wheels/body will trace.
  - **Trailer lines** — a *separate* set (visually distinct: different color /
    dash style) for where the trailer will swing and track. This is the
    valuable one: because of articulation, the trailer's path diverges from the
    car's, and seeing it predicted is exactly the "aha" that makes reversing a
    trailer learnable.
- **Driven by the real geometry:** the same wheel-rolling / hitch-angle model
  that moves the rig also produces these curves — project the current steer
  angle + hitch angle forward for a fixed horizon (N seconds or N meters) and
  draw the swept path. The lines update live as the steering slider / arrow
  keys change.
- **Two-sided lane edges:** draw left/right edges of each body (like real car
  guide lines) rather than a single center line, so the player sees the swept
  width, not just a path.
- **Easy mode only:** it's an assist. Toggle on for "easy", off for the real
  challenge — lowers the frustration floor without removing the skill ceiling.
- **Why it helps:** turns the hardest skill (predicting trailer swing while
  reversing) into something readable and teachable.
- **Rough scope:** a pure function `predictPath(rigState, steerInput, horizon)`
  → polylines for car + trailer, rendered as a scene overlay. No new physics —
  reuses the deterministic movement model integrated forward, so the guide line
  is literally "run the sim forward with frozen inputs and draw the trace" and
  stays perfectly consistent with actual motion. Good candidate for a
  deterministic unit test (same state in → same curves out).

## (add further ideas below)
