import type { Radians } from "../math/angles";
import type { Metres } from "../math/units";
import type { Vec2 } from "../math/vec2";

/** Style of a drawn rounded-rectangle entity. Colours are 0xRRGGBB. */
export interface RectStyle {
  fillColor: number;
  strokeColor: number;
  strokeWidth: Metres;
  cornerRadius: Metres;
  /** Fill opacity 0..1 (default 1). Use 0 for a hollow outline (e.g. debug OBBs). */
  fillAlpha?: number;
}

/** How an entity is drawn: a textured sprite (roof-view art) or a plain rounded rectangle. */
export type EntityVisual = { kind: "sprite"; texture: string } | { kind: "rect"; style: RectStyle };

/**
 * A renderable oriented item in world space. `size` is the on-screen footprint in world units
 * (metres): `width` is the left-right (side) extent, `length` the nose-tail extent. The engine
 * layer knows only sprites/rectangles — no game-specific types.
 */
export interface Entity {
  id: string;
  position: Vec2;
  rotation: Radians;
  size: { width: Metres; length: Metres };
  visual: EntityVisual;
}

export interface Renderer {
  /** Create/update/remove drawn items to match the given entity list. */
  sync(entities: Entity[]): void;
  /** Centres the camera on a world point. */
  follow(target: Vec2): void;
  dispose(): void;
}
