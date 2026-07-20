/** Base render scale at zoom 1. Must match create-phaser-surface (the engine keeps its own copy
 * so the game layer never imports Phaser). */
export const PIXELS_PER_METRE = 32;

/** Zoom factor at which a widthMetres×heightMetres area fits the viewport, with a small margin. */
export function fitZoom(widthMetres: number, heightMetres: number): number {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  return Math.min(vw / (widthMetres * PIXELS_PER_METRE), vh / (heightMetres * PIXELS_PER_METRE)) * 0.92;
}
