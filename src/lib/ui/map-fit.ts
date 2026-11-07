/**
 * Where the control room's course map sits inside its section.
 *
 * Wide screens (1280px and up) keep the map's design: it covers the section, like object-fit:
 * cover, because the panels were drawn around it. On a tablet or a small laptop the panels are
 * not there, so covering crops the left holes under the shell rail and leaves the right third
 * bare. Between those sizes the map instead scales and slides so every hole sits inside the part
 * of the section that nothing else covers.
 *
 * Pure: no DOM. The caller measures the section and the overlays and passes numbers in.
 */

export interface MapBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FitInput {
  /** The section's size in CSS px. */
  view: { w: number; h: number };
  /** The map's design space and the canopy painted around it, all in map units. */
  world: { w: number; h: number; margin: number };
  /** What the holes occupy, in map units, with room for the pin labels already added. */
  box: MapBox;
  /** Space the overlays take from the section, in CSS px. */
  safe: { left: number; right: number; top: number; bottom: number };
  /** The map is never blown up past this scale; a tall phone-width section would otherwise zoom. */
  maxScale: number;
}

export interface Fit {
  /** Scale from map units to CSS px. */
  s: number;
  /** Where map unit 0 lands, left and top. */
  ox: number;
  oy: number;
  /** How far the map sits from the centred position: pan bounds shift by this, scaled by zoom. */
  dx: number;
  dy: number;
}

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

/** The plain cover fit: the map centred, scaled to fill the section. */
export function coverFit(view: { w: number; h: number }, world: { w: number; h: number }): Fit {
  const s = Math.max(view.w / world.w, view.h / world.h);
  return { s, ox: (view.w - world.w * s) / 2, oy: (view.h - world.h * s) / 2, dx: 0, dy: 0 };
}

export function fitMap({ view, world, box, safe, maxScale }: FitInput): Fit {
  const canvasW = world.w + 2 * world.margin;
  const canvasH = world.h + 2 * world.margin;
  // The painted canvas must still fill the section at the smallest scale.
  const minScale = Math.max(view.w / canvasW, view.h / canvasH);

  const availW = Math.max(view.w - safe.left - safe.right, 1);
  const availH = Math.max(view.h - safe.top - safe.bottom, 1);
  const boxW = Math.max(box.x1 - box.x0, 1);
  const boxH = Math.max(box.y1 - box.y0, 1);

  const wanted = Math.min(availW / boxW, availH / boxH);
  const s = Math.max(Math.min(wanted, maxScale), minScale);

  const centredX = (view.w - world.w * s) / 2;
  const centredY = (view.h - world.h * s) / 2;
  // Put the middle of the holes in the middle of the free area.
  const wantX = safe.left + availW / 2 - s * ((box.x0 + box.x1) / 2);
  const wantY = safe.top + availH / 2 - s * ((box.y0 + box.y1) / 2);
  // The canopy only reaches `margin` beyond the map, so the slide may not expose a bare edge.
  const roomX = Math.max((canvasW * s - view.w) / 2, 0);
  const roomY = Math.max((canvasH * s - view.h) / 2, 0);
  const dx = clamp(wantX - centredX, -roomX, roomX);
  const dy = clamp(wantY - centredY, -roomY, roomY);
  return { s, ox: centredX + dx, oy: centredY + dy, dx, dy };
}
