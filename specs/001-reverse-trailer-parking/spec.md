# Feature Specification: Reverse Trailer Parking — Driving Sandbox (Milestone 1)

**Feature Branch**: `001-reverse-trailer-parking`
**Created**: 2026-07-14
**Status**: Draft
**Input**: User description: "A TS game inspired by 2D parking puzzle games, but with continuous motion and a car+trailer that must be navigated mostly in reverse. Motion must be geometrically 'realistic' (steering, hitch angle, trailer wheel positions, trailer length all matter). First milestone: set up basic mechanics — engine choice, physics/math, controls (desktop + phone), mobile-first, and an open space to freely drive the car+trailer to get a feel for it."

## Overview

This is the **first milestone** of a larger game. The eventual game is a puzzle in the
spirit of 2D "unblock the car" parking games, but instead of grid-snapped left/right/up/down
moves, the player drives a **car towing a trailer** with continuous, physically believable
motion — and the challenge centers on **reversing** the rig into place (with occasional
forward moves), where jackknifing and articulation make it genuinely tricky.

This milestone does **not** build the puzzle. It builds the **driving sandbox**: an open
space where the player can freely drive the car+trailer, forward and back, and get a feel
for how the articulated motion behaves. It validates the movement model, the controls, and
mobile playability. Following clarification, it also proves out the **multi-car
architecture**: one vehicle type serves both the drivable car and one or more **placed**
cars, vehicles come in geometry-driven **variants**, any car may tow an optional trailer,
and **solid-body collision** between vehicles (and the boundary) is in scope. Full levels,
goals, and scoring remain for later milestones.

## Clarifications

### Session 2026-07-14

- Q: How much multi-car support does this milestone include? → A: Placed (static) cars **and** collision are now in scope — the sandbox has one drivable car plus one or more placed cars, all the **same vehicle type** (a car is placeable *and* drivable), with solid-body collision between vehicles and against the boundary.
- Q: What does "distance between wheels" mean, and how is vehicle geometry defined? → A: Each vehicle's geometry is defined explicitly by the (x, y) positions of its **four wheels**, its body **width/length**, and the (x, y) position of its **trailer hitch**; all steering, articulation, and collision math is derived from those positions (not a single scalar "wheelbase"). Distance-between-wheels and track width are consequences of the wheel coordinates.
- Q: How does the trailer relate to cars? → A: A trailer is an **optional attachment (0 or 1)** that **any** car can tow — including placed/parked cars — coupled at that car's hitch (x, y), with its own variant geometry (wheel/axle positions, width, length).
- Q: Do vehicles come in variants? → A: Yes — cars and trailers come in variants differing in length, wheel positions (hence distance-between-wheels and track width), maximum steering angle, and hitch position; geometry is first-class variant **data**, so a new variant is data, not new code.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Free-drive the articulated rig in an open space (Priority: P1)

A player opens the game and sees a car with a trailer attached, sitting in an open,
empty space viewed from above. They drive it around freely — accelerating forward,
coasting to a stop, reversing, and steering — and watch the trailer follow, swing, and
(if they reverse while turning) begin to jackknife. The goal is simply to *feel* how the
rig moves.

**Why this priority**: This is the entire point of the milestone. Everything else
(controls, mobile support) exists to serve this experience. Without a believable,
enjoyable-to-drive articulated rig, there is no game to build on. This is the MVP.

**Independent Test**: Load the sandbox, apply a sequence of throttle/steer inputs (from
any input source), and confirm the car and trailer move with correct articulated geometry
— trailer trails the car when going forward, swings out and can jackknife when reversing,
and both come to rest when throttle is released.

**Acceptance Scenarios**:

1. **Given** the rig is at rest, **When** the player applies forward throttle, **Then** the car accelerates smoothly up to a maximum speed (not an instant jump to full speed).
2. **Given** the rig is moving forward, **When** the player releases the throttle, **Then** the rig decelerates (brakes) and comes to a full stop rather than coasting forever.
3. **Given** the rig is moving, **When** the player steers the front wheels, **Then** the car turns because its wheels roll in the direction they point and cannot slide sideways — the heading is a consequence of wheel geometry, not a directly-set value.
4. **Given** the rig is moving forward in a straight line, **When** it continues, **Then** the trailer settles into line directly behind the car.
5. **Given** the rig is reversing, **When** the player steers, **Then** the hitch angle between car and trailer changes and the trailer can swing toward a jackknife, matching real reversing behaviour.
6. **Given** the trailer is at a large hitch angle, **When** the player keeps reversing into the turn, **Then** the angle is limited so the trailer cannot pass through the car (jackknife is clamped, not glitchy).
7. **Given** the rig is anywhere in the space, **When** the player drives, **Then** the view keeps the rig visible (the camera follows or the space is fully in view).

---

### User Story 2 - Drive with desktop keyboard controls (Priority: P2)

A player on a laptop/desktop uses the keyboard: left/right arrows turn the steering
wheels, up accelerates forward, down reverses. The controls feel immediate and natural.

**Why this priority**: Desktop is the fastest environment to iterate and test the feel in,
and keyboard is the most precise input for tuning the physics. It directly enables US1 on
the developer's primary platform.

**Independent Test**: On a desktop browser, press each key and confirm the mapped action
occurs (left/right steer, up forward, down reverse), including holding for continuous input
and releasing to stop steering/throttle.

**Acceptance Scenarios**:

1. **Given** the game is focused on desktop, **When** the player holds Up, **Then** the rig accelerates forward; **When** released, **Then** it brakes to a stop.
2. **Given** the game is focused, **When** the player holds Down, **Then** the rig reverses.
3. **Given** the game is focused, **When** the player holds Left or Right, **Then** the front wheels steer that direction; **When** released, **Then** the wheels return toward centre.
4. **Given** the player presses steer and throttle together, **When** both are held, **Then** both apply simultaneously (steer while driving).

---

### User Story 3 - Play well on a phone (Priority: P3)

A player on a phone holds it in portrait or landscape and drives using on-screen touch
controls: forward and reverse buttons on one side, and a vertical steering slider on the
right that sets the steering angle. The layout fits the screen, the controls are reachable
by thumbs, and the motion stays smooth.

**Why this priority**: Mobile is a first-class target for this game (a permanent project
rule). It is P3 only because the physics (US1) and a precise test input (US2) should exist
first; mobile is how most players will actually experience it and must not be an
afterthought.

**Independent Test**: On a phone (or emulated touch device down to ~360px wide), confirm
the forward/reverse buttons drive the rig, the steering slider sets the steer angle
proportionally, no control is clipped off-screen, and motion remains smooth.

**Acceptance Scenarios**:

1. **Given** the game is open on a phone, **When** it loads, **Then** the sandbox and all touch controls fit on screen with no horizontal scrolling and no clipped controls, in both portrait and landscape.
2. **Given** the touch controls are visible, **When** the player presses and holds the forward (or reverse) button, **Then** the rig accelerates in that direction; **When** released, **Then** it brakes to a stop.
3. **Given** the steering slider, **When** the player drags it, **Then** the steering angle follows the slider position proportionally (full up/down = full lock each way, centre = straight).
4. **Given** the player is using touch, **When** they interact with controls, **Then** the browser does not scroll, zoom, or select text as a side effect.
5. **Given** a mid-range phone, **When** the player drives continuously, **Then** the animation stays visibly smooth.

---

### User Story 4 - Multiple cars, variants, and collision (Priority: P2)

Besides the drivable car, the space contains one or more **placed** cars (each possibly
towing a trailer), and vehicles exist in different **variants** (lengths, wheel layouts, max
steering angle, hitch position). Driving the rig into a placed car or the boundary is
**blocked** — the solid bodies never overlap — so the geometry feels real.

**Why this priority**: Clarification established that the architecture must support many cars
(one type, placeable and drivable), geometry-driven variants, optional trailers on any car,
and collision. It is co-P2 with keyboard controls — now in scope and architecturally
foundational — but the core single-rig *feel* (US1) still comes first. Independently testable
from the input stories.

**Independent Test**: Spawn the drivable car plus one or more placed cars of different
variants; drive around and into them — confirm variants differ in turning radius and
footprint, any car can carry a trailer, and the rig cannot overlap or pass through a placed
car, its trailer, or the boundary.

**Acceptance Scenarios**:

1. **Given** the space has placed cars of different variants, **When** the scene loads, **Then** each renders with its own geometry (length, wheel layout, footprint) and any attached trailer.
2. **Given** the rig is driving, **When** it is steered into a placed car, **Then** it is stopped at contact and does not overlap or pass through it.
3. **Given** the rig is reversing, **When** the trailer meets a placed car or the boundary, **Then** the trailer is blocked the same way (collision applies to the whole rig).
4. **Given** two vehicles of different variants, **When** each turns at full lock, **Then** their turning radii differ according to their wheel positions and max steer angle.
5. **Given** a placed car that itself has a trailer, **When** the rig approaches, **Then** the placed car+trailer present a single solid footprint.

---

### Edge Cases

- **Jackknife limit**: Reversing hard into a turn drives the hitch angle to its maximum; the trailer must clamp at the limit (visually "folded" against the car) without overlapping through the car or snapping/teleporting.
- **Direction reversal**: Rapidly switching between forward and reverse while moving must not produce NaN positions, infinite spin, or the trailer detaching — the rig decelerates through zero and reverses cleanly.
- **Release mid-turn**: Releasing throttle while steering leaves the wheels/steer angle as they are (or returns them toward centre per the input) while the rig brakes to a stop; no residual drift.
- **Simultaneous inputs / multi-touch**: Holding a drive button while dragging the steering slider (or pressing keyboard steer + throttle) applies both at once without one cancelling the other.
- **Very small / very large viewports**: From small phones (~360px) up to desktop, the sandbox and controls remain usable and correctly scaled; the rig never becomes too small to see or too large to maneuver.
- **Both input modes present**: On a touch-capable laptop, keyboard and touch controls both work without conflicting.
- **Stationary steering**: Steering while stopped changes the wheel angle but does not move the rig (wheels only turn the body when there is forward/backward motion).
- **Driving into an obstacle**: Pushing the rig into a placed car or the boundary stops it at contact without penetrating, and the simulation stays stable (no tunnelling at speed, no NaN).
- **Trailer-side collision**: The trailer (not only the car) collides with obstacles; reversing the trailer into a placed car is blocked the same way.
- **Wedging**: Manoeuvring the rig into a gap between two placed cars is blocked cleanly when it does not fit, rather than squeezing through.
- **Placed car with trailer**: A placed car may itself have a trailer; the car+trailer present a single solid footprint.

## Requirements *(mandatory)*

### Functional Requirements

#### Sandbox & presentation
- **FR-001**: The game MUST present an open space viewed top-down, large enough to drive and turn the rig freely, enclosed by a solid boundary. The space MUST contain one **drivable** car (optionally towing a trailer) and one or more **placed** cars (each optionally towing a trailer).
- **FR-001a**: The view MUST be a **pure, 100% straight-down (orthographic) top-down** perspective — the camera looks directly down at the ground with **no tilt, angle, perspective, or isometric skew**, matching the reference image. Vehicles are seen from directly overhead (roof view). The camera may pan/follow and zoom, but never rotate to an angled/3D view.
- **FR-002**: The game MUST display each car and any attached trailer, rendered so that car body, trailer body, and the direction the wheels point are visually distinguishable. Sprites MUST be drawn as pure overhead (roof-view) art consistent with the straight-down perspective — not 3/4 or angled views.
- **FR-003**: The view MUST keep the rig visible at all times while driving (via camera follow and/or a space that fits within the view).
- **FR-004**: The game MUST provide a way to reset the rig to its starting position and orientation.
- **FR-004a**: The game MUST show a dedicated on-screen indicator of the current front-wheel steering angle (e.g., a steering-wheel graphic that rotates, or an angle gauge) — a readable UI element in addition to the wheels drawn on the car, so the player can tell how much lock is applied at a glance. This indicator MUST be present on both desktop and mobile.

#### Movement model (the core "feel")
- **FR-005**: Applying throttle MUST accelerate the rig gradually up to a maximum speed; the rig MUST NOT jump instantly to full speed.
- **FR-006**: Releasing throttle MUST cause the rig to brake and come to a complete stop (not coast indefinitely).
- **FR-007**: The rig MUST support both forward and reverse motion with the same accelerate-on-input / brake-on-release behaviour.
- **FR-008**: The car's change of direction MUST emerge from its wheels: each wheel rolls in the direction it points and cannot slide sideways, so turning is a geometric consequence of the vehicle's explicit wheel positions, the front-wheel steer angle, and travel — computed from the wheel coordinates, not a directly assigned heading value.
- **FR-009**: Steering MUST change the angle of the car's front (steered) wheels, up to that vehicle variant's maximum steering lock in each direction.
- **FR-010**: The steer angle MUST only produce turning while the rig is moving; steering a stationary rig changes the wheel angle but does not translate the body.
- **FR-011**: A trailer (when present) MUST be connected to its towing car at the car's hitch position and follow via articulated geometry: the trailer's motion MUST depend on the hitch angle, the hitch position (x, y) on the car, and the trailer's own geometry (hitch-to-axle length, axle/wheel positions, width). Any car — drivable or placed — MAY tow at most one trailer.
- **FR-012**: When driving forward in a straight line, the trailer MUST settle into line behind the car.
- **FR-013**: When reversing, the geometry MUST reproduce real reversing behaviour: steering can swing the trailer toward a jackknife, and the counter-intuitive reverse steering relationship is a natural result of the model (not scripted).
- **FR-014**: The hitch angle MUST be limited so the trailer cannot pass through or overlap the car; at the limit the trailer clamps cleanly (a jackknife stop), with no teleporting, snapping, or numeric blow-up.
- **FR-015**: The simulation MUST remain numerically stable under all input sequences (including rapid direction changes and holding against the jackknife limit) — no NaN/Infinity positions, no detachment, no runaway spin.
- **FR-016**: The simulation MUST advance deterministically for a given sequence of inputs and elapsed time, so the movement can be tested reproducibly.

#### Vehicles, variants & geometry
- **FR-016a**: Every vehicle (car or trailer) MUST be defined by explicit geometry: the (x, y) positions of its wheels, its body width and length, and — for a car — the (x, y) position of its trailer hitch. All motion, articulation, and collision MUST be computed from this geometry so it is correct for any variant.
- **FR-016b**: The system MUST support multiple vehicle **variants** differing in length, wheel positions (hence distance-between-axles and track width), maximum steering angle, and hitch position. Adding a variant MUST be a matter of data (geometry values), not new code paths.
- **FR-016c**: A single vehicle type MUST serve both roles: any car can be **placed** (static in the space) or **drivable** (player-controlled). The role is runtime state, not a separate type.
- **FR-016d**: The space MUST support more than one car at once (one drivable + N placed this milestone), each carrying its own geometry and optional trailer independently.

#### Collision
- **FR-016e**: Vehicle bodies (car and trailer) MUST be solid: the drivable rig MUST NOT overlap or pass through a placed car, a placed car's trailer, or the space boundary. Collision MUST use each vehicle's actual footprint derived from its geometry (width/length/wheel layout), consistent with the visible sprites.
- **FR-016f**: On contact, the drivable rig MUST be prevented from penetrating (stopped/blocked at contact — sliding along the obstacle is acceptable but overlap is not), and the simulation MUST stay stable and deterministic during and after contact (no tunnelling at speed, jitter, NaN, or detachment).

#### Controls — desktop
- **FR-017**: On desktop, Left/Right arrow keys MUST steer the wheels left/right, Up MUST drive forward, and Down MUST reverse.
- **FR-018**: Holding a control key MUST apply it continuously; releasing MUST stop that input (throttle releases to braking; steer releases toward centre).
- **FR-019**: Steering and throttle inputs MUST be combinable (e.g., Up + Left steers while driving forward).

#### Controls — mobile / touch
- **FR-020**: On touch devices, the game MUST provide on-screen forward and reverse buttons that drive the rig while held and brake on release.
- **FR-021**: On touch devices, the game MUST provide a vertical steering slider on the right side whose position sets the steering angle proportionally (centre = straight, extremes = full lock each way).
- **FR-022**: Touch controls MUST support pressing a drive button and moving the steering slider at the same time (multi-touch), each acting independently.
- **FR-023**: Touch interactions with the controls MUST NOT trigger page scroll, pinch-zoom, text selection, or other browser default gestures.

#### Mobile-first quality (permanent project constraint)
- **FR-024**: The layout MUST be responsive and fully usable from small phones (~360px wide) through desktop, in both portrait and landscape, with no clipped controls and no horizontal page scroll.
- **FR-025**: Touch targets MUST be large enough to operate comfortably with a thumb.
- **FR-026**: The game MUST sustain smooth, real-time motion on a mid-range phone.

### Key Entities *(include if feature involves data)*

- **Vehicle Variant**: A reusable geometry definition for a car or a trailer — the (x, y) positions of its wheels, body width and length, maximum steering angle (cars), and hitch position (cars). New variants are pure data. Distance-between-wheels and track width are consequences of the wheel positions.
- **Car**: An instance of a car variant. Attributes: position, heading, current speed, current front-wheel steer angle, its variant geometry (wheel positions, width, length, max steer lock, hitch position), acceleration/braking rates, and a **role** (placed = static, or drivable = player-controlled). The same type serves both roles.
- **Trailer**: An optional towed instance (0 or 1 per car) of a trailer variant. Attributes: heading, its variant geometry (axle/wheel positions, hitch-to-axle length, width), and the hitch angle relative to its towing car (bounded by a jackknife limit). Any car — placed or drivable — may have one.
- **Rig**: A car plus its attached trailer (if any), treated as the coupled unit for motion. The drivable rig is the player-controlled car and its trailer.
- **Space / Boundary**: The open drivable area, its solid outer boundary, and the camera/view that keeps the drivable rig on screen. Holds one drivable car and one or more placed cars.
- **Collision**: Solid-body overlap between vehicle footprints (and the boundary). The drivable rig cannot penetrate placed vehicles or the boundary; footprints derive from each vehicle's geometry.
- **Control Input**: The current intent from the player, independent of source (keyboard or touch): a throttle value (forward/none/reverse) and a steer value (left…centre…right). The movement model consumes this uniform input so desktop and mobile behave identically.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new player can, within their first 2 minutes of driving, complete at least one full forward loop and one reverse maneuver that visibly swings the trailer — i.e., the rig is drivable enough to explore its behaviour without instruction.
- **SC-002**: Reversing while steering visibly produces the correct real-world articulated response (trailer swings and can jackknife) in 100% of trials, and the trailer never overlaps or passes through the car.
- **SC-003**: The rig accelerates from rest to full speed and brakes back to a full stop purely from holding and releasing the throttle, with no perceptible "instant teleport to full speed" and no indefinite coasting.
- **SC-004**: The same driving behaviour is reproducible from an identical input sequence (deterministic), enabling automated verification of the movement model.
- **SC-005**: The game is fully playable on a phone: on a mid-range device the motion stays smooth (no visible stutter during continuous driving), and all controls are reachable and unclipped from ~360px width upward in both orientations.
- **SC-006**: A control action (press/release/steer) is reflected in the rig's behaviour within about 100 ms, so the controls feel responsive on both desktop and mobile.
- **SC-006a**: At any moment the player can read the current front-wheel steering angle from an on-screen indicator (steering-wheel/gauge) that tracks the actual wheel angle, on both desktop and mobile.
- **SC-007**: Across an extended free-drive session with arbitrary inputs (including abusive rapid direction changes and sustained jackknife pressure), the simulation never produces a broken state (no NaN, no detachment, no runaway spin).
- **SC-008**: The drivable rig (car and trailer) never visually overlaps or passes through a placed car, a placed car's trailer, or the boundary in any driving trial; on contact it is stopped/blocked without jitter or tunnelling, even at full speed.
- **SC-009**: Swapping a vehicle to a different variant (e.g., longer body or smaller max steer) changes its turning radius and footprint accordingly with **no code change** — demonstrating geometry-driven variants.

## Assumptions

- **Scope: an enhanced sandbox.** This milestone builds the driving sandbox *plus* the multi-car foundation: geometry-driven variants, placed + drivable cars of one type, optional trailers on any car, and solid-body collision. It still has **no levels, goals, win/lose conditions, scoring, or timers** — those remain for later milestones.
- **Multiple cars, variants, optional trailers.** The space holds one drivable car and one or more placed cars, all the same type. Vehicles come in variants (geometry-only differences). Any car may tow 0 or 1 trailer (placed cars included). Detaching/reattaching trailers at runtime is out of scope.
- **Top-down 2D presentation — 100% straight-down.** The view is a pure orthographic overhead perspective (as in the reference image): the camera looks straight down with no tilt, angle, perspective, or isometric skew. Vehicles and the ground are rendered as flat overhead (roof-view) 2D art. Not 3D, not isometric, not angled. This governs both the camera and all sprite art (car, trailer, steering-wheel indicator excepted as a HUD element).
- **Simple longitudinal dynamics, geometric steering.** Speed uses a simple accelerate-on-throttle / brake-on-release model (no gears, clutch, tire-temperature, weight transfer, or engine simulation). Direction/articulation uses geometric wheel-rolling constraints (no full rigid-body dynamics engine, no tire-slip modelling). This matches the "realistic geometry, simple physics" intent.
- **Collision is simple solid-body blocking.** The drivable rig cannot penetrate placed vehicles or the boundary; contact stops/blocks it (sliding along is fine). There is no elastic bounce, momentum transfer, damage, or pushing — placed cars are immovable this milestone. The internal jackknife limit still prevents the trailer from passing through its own car.
- **Sprites are AI-generated placeholders.** Car and trailer art will be generated with the project's AI image tooling; final art quality is not a gate for this milestone (the reference image's fidelity is aspirational, not required).
- **No persistence, accounts, or networking.** Nothing is saved between sessions; there is no backend.
- **Single-player, local, browser-based.** The game runs client-side in a web browser.
- **Steering input model.** On desktop, steer is a hold-to-turn action that recenters on release; on mobile, the steering slider holds its position until moved. Both feed the same underlying steer-angle value.
