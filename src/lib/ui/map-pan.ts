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

export function panBounds(
  view: { width: number; height: number },
  world: { width: number; height: number },
): PanBounds {
  const x = Math.max((world.width - view.width) / 2, 0);
  const y = Math.max((world.height - view.height) / 2, 0);
  // `0 - x` rather than `-x`, so a map that cannot move reports 0 and not -0.
  return { minX: 0 - x, maxX: x, minY: 0 - y, maxY: y };
}

export function clampPan(pan: Pan, bounds: PanBounds): Pan {
  return {
    x: Math.min(Math.max(pan.x, bounds.minX), bounds.maxX),
    y: Math.min(Math.max(pan.y, bounds.minY), bounds.maxY),
  };
}
