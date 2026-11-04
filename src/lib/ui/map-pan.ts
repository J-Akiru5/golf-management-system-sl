/**
 * How far the control room's course map may slide when dragged.
 *
 * The map is drawn at its own size and scaled to cover the viewport, so at rest it already sticks
 * out on one axis. Panning is clamped to that overhang: the map can be dragged until its edge meets
 * the viewport edge, never past it, so a bare corner can never appear behind the glass panels.
 */
export interface Pan {
  x: number;
  y: number;
}

export interface PanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 2.5;

/** A zoom the map will honour: a finite number inside the two limits. */
export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return MIN_ZOOM;
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

export function panBounds(
  view: { width: number; height: number },
  world: { width: number; height: number },
  zoom = 1,
): PanBounds {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const x = Math.max((world.width * scale - view.width) / 2, 0);
  const y = Math.max((world.height * scale - view.height) / 2, 0);
  // `0 - x` rather than `-x`, so a map that cannot move reports 0 and not -0.
  return { minX: 0 - x, maxX: x, minY: 0 - y, maxY: y };
}

/**
 * The pan that keeps the point under the cursor still when the zoom changes.
 *
 * The map scales about the view's centre, so a point at screen offset `focus - centre` moves with
 * the zoom. Solving for the pan that leaves `focus` over the same map point gives this. Both
 * points are in client coordinates.
 */
export function zoomAbout(pan: Pan, from: number, to: number, focus: Pan, centre: Pan): Pan {
  if (!(from > 0) || !(to > 0) || from === to) return pan;
  const ratio = to / from;
  return {
    x: focus.x - centre.x - ratio * (focus.x - centre.x - pan.x),
    y: focus.y - centre.y - ratio * (focus.y - centre.y - pan.y),
  };
}

export function clampPan(pan: Pan, bounds: PanBounds): Pan {
  return {
    x: Math.min(Math.max(pan.x, bounds.minX), bounds.maxX),
    y: Math.min(Math.max(pan.y, bounds.minY), bounds.maxY),
  };
}
