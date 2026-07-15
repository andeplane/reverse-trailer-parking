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
  fillAlpha: number;
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
  /** Absolute camera: centre on world metres (x,y) at the given zoom factor (1 = default). */
  setCamera(x: number, y: number, zoom: number): void;
  /** Converts a client (page) pixel position to a world point in metres. */
  clientToWorld(clientX: number, clientY: number): { x: number; y: number };
}
