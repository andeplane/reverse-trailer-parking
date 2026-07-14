/** Footprint of a drawn item in world units (metres). */
export interface Footprint {
  width: number;
  length: number;
}

/** Spec for a drawn rounded rectangle; dimensions/stroke in world units (metres), colours 0xRRGGBB. */
export interface RectSpec extends Footprint {
  fillColor: number;
  strokeColor: number;
  strokeWidth: number;
  cornerRadius: number;
}

/** The only surface phaser-renderer.ts touches; the real impl wraps a Phaser Scene. */
export interface PhaserSurface {
  /** Create a textured sprite scaled to the given footprint, keyed by id. */
  addSprite(id: string, texture: string, footprint: Footprint): void;
  /** Create a rounded-rect shape with the given fixed footprint/style, keyed by id. */
  addRect(id: string, spec: RectSpec): void;
  setTransform(id: string, x: number, y: number, rotation: number): void;
  remove(id: string): void;
  centerCamera(x: number, y: number): void;
}
