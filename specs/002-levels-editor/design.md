# Design / ADR: Levels, Exit/Win, and Level Editor (Milestone 2)

Status: **Accepted** (reviewed 2026-07-15) · Date: 2026-07-15

### Review resolutions (applied to the plan below)
1. **Exit must be a gap in the boundary.** An enclosing wall makes "cross to the
   outside" unreachable. `levelToWorld` builds enclosing walls from `size` but
   **punches an opening for the exit** on the edge it lies on (`exit` requires an
   edge for M2 — "reverse out of the lot"). Locked in P1 even though win *detection*
   ships in P2.
2. **Camera API goes on `Renderer`, not `PhaserSurface`.** `src/game/` only sees
   `Renderer`. Add `setCamera(center, zoom)` + `screenToWorld(px,py)` to `Renderer`;
   `phaser-renderer` implements them via the surface. `follow` becomes
   `setCamera(target, currentZoom)`.
3. **`screenToWorld` delegates the hard part to Phaser** (`camera.getWorldPoint`,
   which handles canvas offset / DPR / scroll); only the pure world-pixels↔metres
   y-negate is unit-tested.
4. **`World` gains required `props`/`exit`/`bounds`** (with a small default helper),
   not optional fields. `obstacleFootprints` appends collidable props before
   boundary. `worldToEntities` renders props with z-bands (grass below vehicles,
   trees above). Non-collidable props are excluded from collision.
5. **One unit convention:** `Level.size` / `World.bounds` = **full** width/height;
   props `{width,length}` = full; OBB `halfW/halfL` = half. `levelToWorld` bounds
   are unit-tested against the known lot to catch the /2 off-by-two.

Builds on Milestone 1 (the driving sandbox: geometry-driven kinematics, OBB/SAT
collision, realistic top-down rendering). This milestone turns the sandbox into a
**game with levels**: a menu to pick a level, an **exit** to reach (win when the
whole rig crosses it), and an in-browser **level editor** to author and save levels.

---

## 1. Goals & scope

1. **Levels as data** — a level fully describes a playfield: size, the drivable rig,
   placed cars, static props (curbs, trees, grass), and an exit. Levels live in
   `public/levels.json`; adding a level = adding data.
2. **Level menu** — a screen listing available levels; pick one to play.
3. **Exit + win** — each level defines an exit line; the player wins when the car
   **and** its trailer have **fully crossed** it.
4. **Level editor** — zoom/pan, set the playfield size, place/rotate/delete cars and
   props, draw the exit, and save (localStorage + JSON export/import).

Non-goals this milestone: scoring/leaderboards, animations/particles, audio,
multiple themes, server persistence, undo-tree (a single-step undo is optional).

---

## 2. Key decisions

### D1 — Screen state machine lives in `src/game/`, not Phaser Scenes
We keep Phaser confined to `src/engine/render/` (Milestone-1 rule). Screens
(`menu`, `play`, `editor`) are a **game-level** concept managed by an
`AppShell`/`ScreenManager` that swaps DOM overlays and drives the one Phaser
surface. Rationale: menus/editor UI are DOM (accessible, responsive, testable under
jsdom); the engine stays a thin renderer. Phaser Scenes would pull game logic into
the engine and break the dependency arrow.

- `menu` → pure DOM (list of level cards) over an idle/blurred backdrop.
- `play` → the existing sandbox loop, fed a `World` built from a `Level`, plus win
  detection + a win overlay.
- `editor` → a sandbox-like render loop with **no vehicle simulation**; instead
  camera pan/zoom + a DOM tool palette that mutates a `Level` and re-renders.

### D2 — Level is explicit data; `levelToWorld()` derives the runtime `World`
`Level` (authoring/serialisation shape) is validated and converted to a `World`
(runtime). This mirrors the Milestone-1 "geometry is data, scalars derived" pattern.
`world-setup.ts`'s hard-coded lot becomes **level 1 data**.

```ts
interface Vec2 { x: number; y: number }              // metres, playfield-centred origin

type PropKind = "curb" | "tree" | "grass" | "block";
interface LevelProp {
  kind: PropKind;
  position: Vec2;         // centre, metres
  rotation: number;       // radians
  size: { width: number; length: number }; // metres (footprint / sprite extent)
  // collidable is derived from kind (curb/block/tree trunk = solid; grass = decor)
}

interface LevelCar {
  variantId: string;
  position: Vec2;         // rear-axle reference, metres
  heading: number;        // radians
  trailerVariantId?: string;
}

interface ExitLine { a: Vec2; b: Vec2; outward: Vec2 } // outward = unit normal toward "outside"

interface Level {
  id: string;
  name: string;
  size: { width: number; height: number };  // playfield, centred at origin
  drivable: LevelCar;                        // exactly one
  placedCars: LevelCar[];
  props: LevelProp[];
  exit: ExitLine;
  parSeconds?: number;
}
```

`levelToWorld(level, catalog): World`:
- builds `cars` (drivable + placed) via the existing spawn path,
- builds boundary walls from `size` (4 enclosing OBBs),
- turns collidable props into obstacle OBBs, decor props into render-only entities,
- carries `exit` + `size` onto the `World`.

### D3 — `World` gains `props`, `exit`, and `bounds`
Extend the runtime `World`:
```ts
interface World {
  cars: CarState[];
  boundary: Obb[];
  props: WorldProp[];        // { kind, obb, collidable, texture? }
  exit: ExitLine | null;
  bounds: { width: number; height: number };
  catalog: VariantCatalog;
}
```
`obstacleFootprints()` also includes collidable props. `world-view` renders props
in a ground layer (grass/curbs) below vehicles; trees render **above** vehicles
(canopy) — a per-kind z-band. Backwards compatible: existing callers pass
`props: []`, `exit: null`.

### D4 — Win = every rig corner strictly past the exit's outward half-plane
The exit is a line segment `a–b` with a unit `outward` normal. For the drivable
car OBB and its trailer OBB, take all 8 corners; **win** when
`min_corner dot(corner − a, outward) > 0` (the whole rig is on the outside) — i.e.
the rig has *fully* crossed. Latitude to cross anywhere along the (infinite) line is
acceptable for M2; we can add "between the posts" later. Win is edge-triggered
(fires once), pauses the sim, and shows a win overlay (Next / Retry / Menu).

Determinism preserved: win is a pure function of world state.

### D5 — Editor: free placement (metres) + optional grid snap; camera in the surface
Vehicles/props are placed at free `(x, y)` metres with rotation; a **togggle grid
snap** (e.g. 0.5 m) aids alignment. Rationale over pure tile-based: vehicles are
oriented rectangles at arbitrary angles — a tile grid fights that. Terrain (grass)
is just large `grass` props for now (a full tile-map can come later without
breaking the schema).

The engine surface gains camera control used by the editor (and available to play):
```ts
interface PhaserSurface {
  // ...existing...
  setCamera(centerX: number, centerY: number, zoom: number): void; // world metres + zoom factor
  screenToWorld(px: number, py: number): { x: number; y: number };  // for editor picking
}
```
Editor interactions (DOM overlay + canvas pointer events):
- **Tool palette**: select drivable/placed car (variant), trailer on/off, curb,
  tree, grass, exit, erase.
- **Place**: click places the selected item at the pointer (grid-snapped); drag to
  set rotation (or a rotate handle / `[` `]` keys).
- **Exit**: two clicks set `a`,`b`; `outward` defaults to the side away from
  playfield centre (flip button).
- **Size**: numeric width/height inputs.
- **Zoom/pan**: wheel = zoom, drag-space / middle-drag = pan, buttons for touch.
- **Save**: validate → write to `localStorage["levels.custom"]` and offer a JSON
  download; **Load** imports JSON. (Browsers can't write the repo file; custom
  levels merge with the bundled `levels.json` at load.)

### D6 — Testability
- `level-types`, `level-validate`, `levelToWorld`, `win` (exit crossing),
  `level-serialize` (round-trip) → pure, exhaustively unit-tested (node).
- Menu + editor DOM/tool logic → jsdom, with a fake surface for camera/picking.
- Real Phaser camera glue (`setCamera`, `screenToWorld`) stays a thin, mostly
  untested adapter (Milestone-1 Decision 8), kept behind the interface.
- 80% line coverage gate preserved.

---

## 3. Proposed file layout (additions)

```
public/levels.json                       # bundled levels (level 1 = the current lot)
src/game/level/
  level-types.ts                         # Level, LevelProp, ExitLine, WorldProp
  level-validate.ts                      # validate a Level (throws RangeError)
  level-to-world.ts                      # levelToWorld(level, catalog)
  level-serialize.ts                     # parse/stringify + round-trip
  level-store.ts                         # load bundled + localStorage custom levels
  win.ts                                 # hasRigCrossedExit(world) → boolean
src/game/screens/
  app-shell.ts                           # screen state machine (menu/play/editor)
  menu-screen.ts                         # DOM level list
  play-screen.ts                         # wraps sandbox + win overlay
  editor-screen.ts                       # camera + tool palette + placement
src/game/hud/win-overlay.ts              # win/next/retry/menu DOM
src/engine/render/                       # PhaserSurface gains setCamera/screenToWorld
```

`world-setup.ts` is replaced by level 1 in `levels.json` (+ a tiny fallback builder).

---

## 4. Phasing (commit after each)

- **P1 — Levels & menu (task 10)**: `Level` schema + validate + `levelToWorld` +
  `World.props/exit/bounds` + render props + `levels.json` (level 1 = current lot) +
  `AppShell` with menu→play. Ship: pick a level from a menu and drive it.
- **P2 — Exit & win (task 11)**: exit rendering + `win.ts` + win overlay
  (next/retry/menu) + a 2nd level that's actually winnable by reversing out.
- **P3 — Editor (task 12)**: camera pan/zoom + surface `setCamera/screenToWorld` +
  tool palette + place/rotate/delete + draw exit + size + save/load
  (localStorage + JSON). Ship: author a level, save it, play it from the menu.

Risks / watch-items: (a) `World` shape change ripples through `world-view`,
`collision`, `sandbox`, tests — do it first, keep back-compat defaults; (b) editor
camera math (screen↔world with the y-flip + zoom) is the trickiest glue — unit-test
the pure inverse, keep Phaser thin; (c) touch support for the editor is nice-to-have
(desktop-first for editing, but keep buttons for zoom).

---

## 5. Open questions (resolve during review)

1. Origin convention for levels — centre-origin (matches M1 math) vs top-left
   (editor-intuitive). *Proposed: centre-origin; the editor shows a bounds
   rectangle so it reads fine.*
2. Grass/terrain — big `grass` props now vs a real tile-map. *Proposed: props now.*
3. Win latitude — infinite line half-plane vs "between the gate posts".
   *Proposed: half-plane for M2.*
4. Custom-level persistence — localStorage + JSON export only (no repo write).
   *Proposed: yes.*
