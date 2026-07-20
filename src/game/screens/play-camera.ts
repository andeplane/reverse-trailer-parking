import type { Vec2 } from "../../engine/math/vec2";

export interface CameraFrame {
  center: Vec2;
  zoom: number;
}

/**
 * The play screen's free-look camera: a user-controlled zoom and pan offset layered on top of the
 * rig-follow camera. The camera always centres on `rig + offset`, so a panned view rides along
 * with the rig while driving instead of being left behind. Pure state — the screen feeds it
 * world-space gesture deltas and reads a frame per tick.
 */
export interface PlayCamera {
  /** Camera for this frame: the rig position plus the user's pan offset, at the user's zoom. */
  frameFor(rig: Vec2): CameraFrame;
  /** Shifts the view by a world-space delta (for a drag, pass grabbed-point minus current point). */
  panBy(delta: Vec2): void;
  /** Multiplies the zoom, keeping the world-space `anchor` point fixed on screen. */
  zoomAt(args: { anchor: Vec2; factor: number; rig: Vec2 }): void;
  /** Clears the pan offset (view returns to the rig), keeping the chosen zoom. */
  resetPan(): void;
  /** Back to the default follow view: no offset, zoom 1. */
  reset(): void;
  /** True when the view differs from the default follow view (recenter affordance needed). */
  isAdjusted(): boolean;
}

export function createPlayCamera(args: {
  minZoom: number;
  maxZoom: number;
  /** Furthest the view centre may pan from the rig, in metres (keeps the map findable). */
  maxPanRadius: number;
}): PlayCamera {
  const { minZoom, maxZoom, maxPanRadius } = args;
  let zoom = 1;
  let offset: Vec2 = { x: 0, y: 0 };

  function clampOffset(): void {
    const r = Math.hypot(offset.x, offset.y);
    if (r > maxPanRadius) {
      const s = maxPanRadius / r;
      offset = { x: offset.x * s, y: offset.y * s };
    }
  }

  return {
    frameFor(rig: Vec2): CameraFrame {
      return { center: { x: rig.x + offset.x, y: rig.y + offset.y }, zoom };
    },

    panBy(delta: Vec2): void {
      offset = { x: offset.x + delta.x, y: offset.y + delta.y };
      clampOffset();
    },

    zoomAt({ anchor, factor, rig }: { anchor: Vec2; factor: number; rig: Vec2 }): void {
      const centre = { x: rig.x + offset.x, y: rig.y + offset.y };
      const oldZoom = zoom;
      zoom = Math.min(maxZoom, Math.max(minZoom, zoom * factor));
      // Keep the anchor's screen position fixed: the centre moves toward/away from the anchor by
      // the zoom ratio (screen offsets scale by zoom, so world offsets scale by oldZoom/zoom).
      const s = oldZoom / zoom;
      offset = {
        x: anchor.x + (centre.x - anchor.x) * s - rig.x,
        y: anchor.y + (centre.y - anchor.y) * s - rig.y,
      };
      clampOffset();
    },

    resetPan(): void {
      offset = { x: 0, y: 0 };
    },

    reset(): void {
      offset = { x: 0, y: 0 };
      zoom = 1;
    },

    isAdjusted(): boolean {
      return zoom !== 1 || offset.x !== 0 || offset.y !== 0;
    },
  };
}
