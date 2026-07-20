<!-- SPECKIT START -->
Active feature plan: `specs/001-reverse-trailer-parking/plan.md`
(with `research.md`, `data-model.md`, `contracts/`, `quickstart.md` alongside it).
Read it for technologies, project structure, the vehicle-motion math, and test strategy.
<!-- SPECKIT END -->

# CLAUDE.md

When things change (architecture, game engine choice +++), ALWAYS update this file with the most important details that you shoulda lways remember.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## App structure (as built — Milestone 2: levels, editor, exit/win)

Design/ADR: `specs/002-levels-editor/design.md`. The app is a **DOM screen state
machine** in `src/game/screens/` (`AppShell`) over one shared Phaser surface —
**not** Phaser Scenes (Phaser stays confined to `src/engine/render/`):

- **Menu** (`menu-screen.ts`) lists levels (built-ins easiest-first); every level
  has an ✎ **edit** action (editing a built-in saves a custom override shown as
  "modified" with a ↺ restore action), pure custom levels get 🗑 delete via an
  **inline two-step confirm (🗑 → "Sure?")** + a "custom" badge; "＋ New level"
  opens a blank editor with a **unique default name**. **NEVER use native browser
  popups (alert/confirm/prompt)** — always in-app UI.
- **Play** (`play-screen.ts`) drives a level via the sandbox, detects the **win**
  (car AND trailer fully cross the exit's outward half-plane — `level/win.ts`),
  and shows a win overlay (with run time; celebrates when it was the last level).
  HUD: transient goal/controls banner at start, ↺ Restart + ☰ Menu buttons, a
  run-timer (with par), and a screen-edge ➤ arrow toward the exit when the
  follow-camera has it off-screen (`Renderer.worldToScreen`).
  **Free-look camera** (`play-camera.ts`, pure): the camera still follows the rig,
  but a full-screen `.play-capture` layer (below the HUD) lets the player zoom
  (wheel / two-finger pinch, **anchored so the point under the cursor/midpoint
  stays fixed**) and drag-pan an offset that **rides along with the rig**; a ⌖
  recenter button appears when adjusted, Restart clears the pan (keeps zoom), and
  min zoom is clamped to fit the whole map (`view/camera-fit.ts` `fitZoom`, shared
  with the editor — the editor's wheel zoom is cursor-anchored too). The camera
  hook is injected into the sandbox (`camera:` arg) instead of its default
  `renderer.follow`.
  **Crash damage** (`vehicle/damage.ts`): each impact charges 4·v² points from
  the speed into the contact normal, only on the clear→contact edge (grinding =
  one hit) and never below the 0.5 m/s dead-zone; a HUD health bar drains, and
  ≥ 100 points shows the lose overlay (`hud/lose-overlay.ts`; win takes precedence).
- **Editor** (`editor-screen.ts` + pure `editor-model.ts`) — see below.
- The **app shell owns the bundled/custom split**: `createApp` takes bundled
  levels + a `LevelStorage`; custom levels merge on top by id on every menu
  show, so deleting a custom override resurrects the bundled original.
  **Testing an editor draft returns to the editor** with the draft intact.

**Levels are tile maps + edge curbs + data** (`src/game/level/`): a `Level` has a
**`TileGrid`** (`tile-types.ts`: asphalt/grass/bay/bay-open/hedge/tree cells with 0–3
rotation, **plus `hCurbs`/`vCurbs` boolean arrays — curbs live on the edges BETWEEN
tiles, not as tiles**) plus cars and an exit. Key geometry helpers: `EdgeRef`,
`nearestEdge` (with drag-direction bias), `edgeSegment`, `curbRuns` (merges
consecutive edges into straight runs), `resizeGrid`, `bayMarkedSides`/`bayLineEdges`
(a `bay` opens S at rot 0, turning CCW per rot step; adjacent bays share one line).
`levelToWorld()` derives the runtime `World` — solid tiles (hedge/tree) → cell-sized
`solids`, **curb runs → thin OBB strips**, and it **opens a gap in the boundary for
the exit**. **Bay lines and curbs are vector-drawn** (`src/game/view/tile-decor.ts`:
pill-ended strips so corners join smoothly) — only asphalt/grass/hedge/tree have
sprite textures. A parking bay is 1 tile wide × 2 tiles deep (`bay` + `bay-open`) at
2.5 m tiles so every car variant fits. Cars are positioned by **rear-axle reference**;
use `rearAxleForBodyCentre` / `levelCarAtCentre` to place by visible body centre.
Legacy saves with `curb`/`curb-corner` tiles migrate on parse (outline of edge curbs
on asphalt). Built-in levels are code (`built-in-levels.ts`, `fallback-level.ts`);
custom editor levels persist to localStorage.

**Editor UX** (issues hardened by an agent-browser e2e pass): topbar has the level
**name input** (selects on focus) and **cols×rows map-size inputs** (resize keeps
content glued, re-snaps the exit, drops outside cars), zoom ± and a **⛶ fit-view**
button. Tools: tile brushes (the **Bay brush paints the full 2-tile bay** —
closed end at cursor + entrance in the opening direction), **Curb (edges)**
(paint/erase the nearest edge; drag interpolates between samples and biases edge
orientation to the drag direction), car picker flyout, exit gate, Select/Move.
**Cars place continuously** (body centre at cursor, no snap; overlap is blocked with
a red ghost). **Placement ghosts render at their real layer** (tile ghosts below
vehicles — `worldToLayers`). Keys: **R** rotates the hovered thing — cars in
**−30° steps** (clockwise on screen), tiles a quarter turn; **Q** picks up whatever
is hovered as the active tool (Factorio-style copy), Q again toggles Select/Move;
**⌫** deletes the selected/hovered placed car; ⌘Z undo, **⇧⌘Z/Ctrl+Y redo**; Esc
cancel; Space/right-drag pans; wheel zooms. **Touch:** two-pointer **pinch
zoom/pan**; selecting shows a **⟲ ⟳ 🗑 toolbar**. Leaving with unsaved changes
opens an in-app **Save & exit / Discard / Cancel** dialog (dirty baseline =
last-persisted state, threaded through Test ▸ round-trips). Save **validates** and
toasts; a bottom hint bar lists shortcuts (hidden on touch). Typing in topbar
inputs never triggers shortcuts. Camera/pointer glue leans on
`Renderer.screenToWorld/setCamera`.
**Renderer note:** `sync()` recreates a drawn item when its texture/style/size
changes for an existing id (so repainted tiles update). **Debug-view note:** a rect
entity's `length` runs along its rotation axis (+x at rotation 0) — the bounds rect
is `{width: bounds.height, length: bounds.width}`.

**Deploy:** GitHub Pages via `.github/workflows/deploy.yml` (push to `main` →
test → `vite build --base=/reverse-trailer-parking/` → deploy). All runtime asset
URLs must be `import.meta.env.BASE_URL`-aware — never hard-code `/assets/...`.

**Debug mode** (`d` key): draws collision-OBB outlines AND writes the rig's exact
state to the URL (`?dbg=<levelId>&x=..&y=..&h=..&v=..&s=..&t=..`) so a pasted URL
reproduces the scenario (`level/debug-state.ts`).

## Rendering (as built — Milestone 1)

The world is drawn as **realistic AI-generated top-down sprites**, matching a polished casual
parking game (glossy cars, textured asphalt lot with bay lines + grass borders). Details:

- **One sprite per vehicle body** (car + trailer), scaled to its **derived footprint**
  (`bodyWidth`×`bodyLength`). Sprites are authored **nose-up** and trimmed to their true bounds so
  footprint scaling is proportional (no stretching), with **clean edges** (no baked outline) and
  pre-downscaled (LANCZOS) so runtime scaling stays crisp. **Front wheels are separate entities that
  visibly rotate by the steer angle** (rear/trailer wheels track body heading), plus the steering-wheel
  HUD gauge. The trailer is linked to the car hitch by a thin **vector drawbar rect**. Boundary walls
  are rendered as visible concrete barriers.
- **Collision ≠ sprite width**: the OBB uses a per-variant `collisionWidth` (the body, excluding
  door mirrors) so collision matches the visible car, not the sprite's outer extent.
- **Steering holds** (no self-centring); at the jackknife limit the car **binds** (stops) rather than
  sliding the trailer sideways.
- `src/game/view/world-view.ts` maps `World → Entity[]` where each `Entity` is a `sprite` or a `rect`
  (`EntityVisual` union). `src/engine/render/create-phaser-surface.ts` owns the Phaser glue: `42→32`
  pixels/metre, a **y-flip** (world +y up ↔ screen +y down) and rotation mapping `π/2 − θ` for nose-up
  sprites (`−θ` for +x-forward rects), plus the static lot background image and viewport RESIZE handling.
- **Variant geometry is tuned to match its sprite's aspect ratio** so footprints line up with the art.
  Assets (committed by name in `public/assets/`): `car-{red,blue,green,orange,purple}.png`,
  `trailer-{white,utility}.png`, `tile-{asphalt,grass,hedge,tree}.png`, `steering-wheel.png` (HUD).
  The player is the red sedan+caravan; placed cars use the other colours/variants. Bay lines and
  curbs are vector-drawn (no sprites). Regenerate via the `ai-image-generator`
  skill (GPT Image 1.5, transparent, "top-down, straight overhead, no perspective/tilt"), then trim to
  opaque bounds.
- Collision is our own OBB/SAT (`src/game/collision/collision-system.ts`): path-sampled
  bisect-to-contact + deepest-MTV push-out + tangent **sliding**, deterministic, tunnelling-proof.

## What This Repo Is

A TypeScript game.

**Game engine: Phaser 3** (decided 2026-07-14). Phaser is used **only for
rendering, input, camera, and viewport scaling**, confined to `src/engine/` as a
thin adapter. **We do NOT use Phaser's physics** (Arcade or Matter) for the
vehicle — the car+trailer motion is our own code (see "Vehicle physics" below).
Keep all Phaser imports inside `src/engine/`; `src/game/` stays engine-agnostic
so the choice remains reversible.

Keep **game-agnostic systems separated from game-specific logic** (see
Architecture Principles): "our engine layer" is a thin adapter around Phaser, not
a from-scratch renderer.

## Vehicle physics — our own kinematic model (NOT a physics engine)

The car+trailer motion is hand-written, not from a rigid-body engine. Rules:

- **Simple longitudinal dynamics**: throttle accelerates gradually up to a max
  speed; releasing the throttle brakes to a full stop (no infinite coasting, no
  instant jump to full speed). Same for reverse.
- **Direction emerges from the wheels, not a set heading**: wheels roll in the
  direction they point and cannot slide sideways. The car's turning is a
  geometric consequence of steer angle + wheelbase + travel — never a directly
  assigned heading. Do not "just rotate the car by steerAngle."
- **Trailer is articulated geometry**: connected at a hitch; its motion depends
  on the hitch angle, trailer length (hitch-to-axle), and trailer axle/wheel
  positions. Forward driving lets the trailer settle in line; reversing can
  swing it toward a **jackknife**, which is **clamped** (trailer never overlaps
  or passes through the car) with no snapping/teleport/NaN.
- **Geometry is EXPLICIT COORDINATES, scalars are DERIVED**: every vehicle
  variant is authored as the (x, y) positions of its wheels, its body
  width/length, and (cars) the (x, y) hitch position. Derive wheelbase `L`,
  hitch offset `h`, trailer length `d`, track width, and the collision footprint
  from those coordinates — never hand-enter a scalar `wheelbase`. The bicycle +
  articulation equations are reused with the derived values, so the math is
  correct for any variant.
- **Variants are data, not code**: cars/trailers differ by geometry (length,
  wheel positions, max steer angle, hitch position) in a validated catalog.
  Adding a variant = adding data.
- **One vehicle type, two roles**: a `Car` is `placed` (static) OR `drivable`
  (player-controlled) — a runtime field, not a subclass. A `World` holds many
  cars (one drivable + N placed). ANY car may tow 0 or 1 trailer (placed cars
  included).
- **Collision is our own, not an engine**: vehicle footprints are oriented boxes
  (OBB); overlap via SAT + MTV (`src/engine/math/obb.ts`). The drivable rig (car
  AND trailer) cannot penetrate placed cars or the boundary — resolve by
  bisecting the sub-step to contact + MTV push-out (tunnelling-proof, sliding is
  a bonus). Placed cars are immovable (no bounce/momentum/damage this milestone).
- **Deterministic**: same input sequence + elapsed time → same motion AND same
  collision outcome. Use a fixed timestep and injected `Clock`; keep `stepWorld`
  pure so the model is unit-testable.

## MOBILE-FIRST — NEVER forget this

This game **must work well on phones**. This is a permanent, non-negotiable
constraint on every feature, layout, and control decision — treat it as always
in scope:

- Responsive and fully usable from ~360px wide up to desktop, in **both portrait
  and landscape**; no clipped controls, no horizontal page scroll.
- Touch controls are first-class: on-screen forward/reverse buttons + a vertical
  steering slider on the **right** edge (sets steer angle proportionally).
  Support multi-touch (drive + steer at once).
- Touch must not trigger page scroll, pinch-zoom, or text selection.
- Large, thumb-reachable touch targets; smooth real-time motion on a mid-range
  phone.
- Always show a steering-angle indicator (steering-wheel/gauge UI) in addition
  to the wheels drawn on the car, on both desktop and mobile.

Desktop controls: Left/Right steer, Up = forward, Down = reverse.

## Visual style — 100% straight-down top-down (NEVER angled)

The game is a **pure orthographic overhead** 2D game, like classic top-down parking games
(see the reference image). The camera looks **straight down** — **no tilt, no perspective,
no isometric skew, no 3D/pseudo-3D**. It may pan (follow the rig) and zoom, but never
rotates to an angled view. **All world sprites are flat overhead (roof-view) art**, rotated
in-plane by heading; generate car/trailer sprites as pure top-down views, not 3/4 or angled.
(The steering-wheel HUD indicator is exempt — it's a flat UI icon.)

Tooling is **Vite** + **TypeScript** (strict) + **Vitest**. This is a plain TS
project, not a React/CDF app.

## Package Manager

`pnpm`. Always use `pnpm`, never `npm` or `yarn`.

## Common Commands

```bash
pnpm dev          # Vite dev server
pnpm build        # type-check + production build
pnpm test         # run Vitest once
pnpm test:watch   # Vitest in watch mode
pnpm test --coverage   # run with coverage
pnpm lint         # ESLint
pnpm lint:fix     # ESLint with autofix
pnpm exec tsc --noEmit # strict type-check without emitting
```

## Architecture Principles

### Engine / game separation

- `src/engine/` — game-agnostic layer: either our own generic systems, or a thin
  adapter around the chosen engine (e.g. Phaser). No game-specific types or logic.
- `src/game/` — the specific game, built only on the engine layer's public API.
- The dependency arrow only points one way: `game` → `engine`, never back.
- Third-party engine imports (Phaser, etc.) should be confined to `src/engine/`
  so the game layer stays engine-agnostic and the engine choice stays reversible.

### Dependency injection everywhere

DI is a first-class requirement in this project. Systems declare their
dependencies explicitly and receive them; they must not reach out to global
singletons or construct their collaborators inline. This keeps every system
testable in isolation and swappable (e.g. a headless renderer or a fake clock in
tests).

Use **constructor / factory injection with typed dependency objects and partial
overrides**:

```ts
interface Clock { now(): number }
interface Renderer { draw(scene: Scene): void }

type EngineDeps = {
  clock: Clock;
  renderer: Renderer;
};

const defaultDeps: EngineDeps = {
  clock: { now: () => performance.now() },
  renderer: createRenderer(), // real renderer (our own, or an engine adapter)
};

export function createGameLoop(overrides: Partial<EngineDeps> = {}) {
  const deps = { ...defaultDeps, ...overrides };
  // deps.clock / deps.renderer used here — never `performance.now()` directly
}
```

In tests, pass fakes: `createGameLoop({ clock: fakeClock })`. No module-level
mocking should be necessary — if you find yourself reaching for `vi.mock`, that
is a signal the dependency should be injected instead.

### Interface-based systems

Every non-trivial system implements an explicit TypeScript `interface` describing
its public API. Production code depends on the interface, not the concrete class,
so test doubles stay type-safe and implementations remain substitutable. Never
use `as unknown as T` to force a mock into place — that signals a missing or
wrong interface.

## Code Standards

### TypeScript type safety

- **Strict mode is on.** `pnpm exec tsc --noEmit` must be clean; lint errors are
  not negotiable.
- **Zero `any` in `src/`.** Use `unknown` + a type guard at boundaries. If a
  third-party lib forces `any`, wrap it in a typed adapter so `any` doesn't leak.
- **Make impossible states unrepresentable.**
  - *Discriminated unions over flag bags* — model game/entity state as an
    exhaustive union with a `status`/`kind` discriminant instead of a bag of
    optional booleans.
    ```ts
    type EntityState =
      | { kind: "idle" }
      | { kind: "moving"; velocity: Vec2 }
      | { kind: "dead"; diedAt: number };
    ```
  - *Branded types* — brand primitives that must not be mixed up (e.g.
    `EntityId`, `Millis`, `Tiles`). Validate once at the boundary; downstream
    code trusts the type.
    ```ts
    type EntityId = number & { readonly __brand: "EntityId" };
    ```
- **Let types flow.** Derive types instead of restating them — reach for `Pick`,
  `Omit`, `Parameters`, `ReturnType`, `Awaited`, `typeof` before writing a new
  interface.
- **Pass objects, not positional args.** Any function with two or more
  parameters of the same primitive type takes a named-property object so callers
  can't silently swap arguments (`spawn({ x, y, hp })`, not `spawn(x, y, hp)`).

### Size and single responsibility

Flag any file that does more than one thing (e.g. simulation + rendering + input
in one place). Extract cohesive systems/modules. Split only when it creates a
genuinely cleaner separation — a well-named larger module beats several poorly
named tiny ones.


### DRY

Extract repeated logic: pure helpers to `src/**/utils`, shared systems to their
own module. Don't copy-paste math (vectors, collision, easing) — centralize it.

### Naming conventions

| Artifact | Convention | Examples |
|----------|-----------|----------|
| Files & directories | `kebab-case` | `game-loop.ts`, `collision-system.ts` |
| Classes & types & interfaces | `PascalCase` | `GameLoop`, `EntityId`, `Renderer` |
| Variables & functions | `camelCase` | `deltaTime`, `spawnEntity` |
| Module-level constants | `SCREAMING_SNAKE_CASE` | `MAX_ENTITIES`, `TICK_RATE` |
| Booleans | auxiliary-verb prefix | `isAlive`, `hasCollided`, `canMove` |

### Dead code

Remove commented-out blocks (version control preserves history), stray
`console.log`/`console.debug`, unused files, and unreachable code before
approval. These are blocking findings.

## Testing

Strongly-typed tests are a hard requirement.

- **Framework:** Vitest. Test files live next to their source as
  `*.test.ts`.
- **80% line coverage is a hard gate.** Coverage measures all `src/**/*.ts`
  except test files, type declarations, and the entry point. Do **not** exclude
  production systems from coverage.
- **Inject, don't mock.** Prefer passing typed fake dependencies over `vi.mock`.
  If a hard-coded import forces `vi.mock`, add a comment justifying why and treat
  the underlying code as a testability defect to fix.
- **Type-safe test doubles.** Mocks/fakes must satisfy the real interface — no
  `as unknown as T` casts. If the interface is large, write a helper that returns
  a correctly-typed partial fake.
- **Cover happy path, error path, empty state, and edge cases** for every system
  and utility. For simulation code, prefer a fake `Clock` and deterministic input
  so tests are reproducible.

Coverage config (Vitest) should look like:

```ts
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'text-summary', 'lcov'],
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/main.ts'],
  },
}
```

## Sprites & Art Assets

Game sprites and art are generated with AI via the **`ai-image-generator`
skill** (`.claude/skills/ai-image-generator/`). When you need a new sprite,
background, icon, or any visual asset, use that skill — do not hand-roll API
calls or reach for other tools.

- **Transparent sprites** (the common case — characters, items, tiles that sit
  on top of the game): use **GPT Image 1.5** (`gpt-image-1.5`) with
  `background: "transparent"` and `output_format: "png"`. GPT Image 2 **cannot**
  do transparency, so it's the wrong choice for most sprites.
- **Text-heavy or opaque art** (title screens, UI panels with copy, banners):
  use **GPT Image 2** (`gpt-image-2`).
- Requires `OPENAI_API_KEY` in the environment.
- Prompt with the skill's 5-part framework and always end with
  "No text, no watermarks, no logos" (unless text is the point).
- Save generated sprites into the game's asset directory (e.g. `src/game/assets/`
  or `public/assets/`), not the scratchpad, and commit them by name.
- For a matched set (e.g. a character's animation frames or a themed tileset),
  use GPT Image 2's batch mode and/or keep prompts consistent so style, palette,
  and scale stay coherent across sprites.

## Git Rules

- **Never** use `git add .` or `git add -A`. Stage specific files by name. Run
  `git status` and `git diff --staged` before committing to confirm exactly
  what's included.
- Commit or push only when asked.
