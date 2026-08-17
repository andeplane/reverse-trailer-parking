/**
 * Wheel → zoom factor, shared by every camera that zooms on scroll.
 *
 * A wheel event carries *how much* was scrolled, and that has to be respected: a mouse notch
 * arrives as one event of ~100 px, while a trackpad swipe arrives as a stream of dozens of tiny
 * ones. Treating every event as a fixed zoom step makes a trackpad wildly over-sensitive (a light
 * two-finger swipe is 30+ events), so the factor is exponential in the scrolled distance instead.
 */

/** Rough pixel size of the units browsers use when they report lines/pages instead of pixels. */
const LINE_HEIGHT_PX = 40;
const PAGE_HEIGHT_PX = 800;

/** Scrolled distance that doubles (or halves) the zoom — a mouse notch is ~1.19×. */
const PIXELS_PER_DOUBLING = 400;

/** Cap on one event's contribution: trackpad momentum can deliver a huge delta in a single event
 * and would otherwise snap the view instead of zooming it. */
const MAX_PIXELS_PER_EVENT = 120;

/** The part of a `WheelEvent` this needs — so callers can test it without a DOM. */
export interface WheelDelta {
  deltaY: number;
  /** 0 = pixels (default), 1 = lines, 2 = pages. */
  deltaMode?: number;
}

/** Scrolled distance in pixels, whatever units the browser reported it in. */
function wheelPixels(event: WheelDelta): number {
  if (!Number.isFinite(event.deltaY)) return 0;
  if (event.deltaMode === 1) return event.deltaY * LINE_HEIGHT_PX;
  if (event.deltaMode === 2) return event.deltaY * PAGE_HEIGHT_PX;
  return event.deltaY;
}

/** Multiplier to apply to the current zoom for one wheel event (scroll up = zoom in = > 1). */
export function wheelZoomFactor(event: WheelDelta): number {
  const pixels = Math.max(-MAX_PIXELS_PER_EVENT, Math.min(MAX_PIXELS_PER_EVENT, wheelPixels(event)));
  return Math.pow(2, -pixels / PIXELS_PER_DOUBLING);
}
