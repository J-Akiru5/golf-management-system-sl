import { MAP_HOLES, type MapHole } from "./layout";

/**
 * The player-facing course diagram.
 *
 * It is drawn from the same illustrated routing the control room uses, cropped to the part of the
 * map the holes occupy so a phone is not mostly empty grass. The layout is still the placeholder
 * flagged in `layout.ts`: no numbering, par or position here is the club's confirmed course, and
 * the page says so next to the drawing.
 */
export interface MapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const COURSE_NAME = "Santa Barbara Golf Course";

/** The box that holds every tee, bend and green, with room for the pin labels. */
export function mapBounds(holes: readonly MapHole[], pad = 70): MapBounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const hole of holes) {
    for (const point of [hole.tee, hole.bend, hole.green]) {
      xs.push(point[0]);
      ys.push(point[1]);
    }
  }
  if (xs.length === 0) return { x: 0, y: 0, width: 1, height: 1 };

  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export const viewBoxOf = (bounds: MapBounds): string =>
  `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;

/** Tee → bend → green, the same quadratic the control room paints. */
export function holePath(hole: MapHole): string {
  return `M ${hole.tee[0]} ${hole.tee[1]} Q ${hole.bend[0]} ${hole.bend[1]} ${hole.green[0]} ${hole.green[1]}`;
}

export const PLAYER_MAP_HOLES: readonly MapHole[] = MAP_HOLES;
