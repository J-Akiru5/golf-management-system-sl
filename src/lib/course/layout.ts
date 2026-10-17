import greenView from "./hole-1-green.json";
import overview from "./hole-1-overview.json";

/**
 * Course layout used by the control room map and the hole view.
 *
 * PLACEHOLDER. These are not Iloilo Golf & Country Club's real holes. The 18-hole map is an
 * illustrated routing laid out to fit the control room, and hole 1's pictures and yardages come
 * from a rendered illustration. Per the design system, real hole positions come from the club's
 * hole layout (or a drone image's pixel coordinates), stored per course. When the club supplies
 * them, replace this file's data, not the components that read it.
 */
export const COURSE_IS_PLACEHOLDER = true;

/** The map's design space. Pins and fairways are placed in these units and scaled to cover. */
export const MAP_W = 1440;
export const MAP_H = 900;

export interface MapHole {
  hole: number;
  tee: [number, number];
  green: [number, number];
  /** Bend of the fairway: a control point for a quadratic curve. */
  bend: [number, number];
  /** Where the pin label sits. */
  pin: [number, number];
}

// Routing drawn in a 200..1000 × 180..610 box, then fitted into the part of the map that the
// control room's panels leave visible (left of the right column, above the bottom row, below
// the page title).
const RAW: [number, [number, number], [number, number], [number, number]][] = [
  [1, [200, 600], [250, 470], [205, 530]],
  [2, [270, 450], [200, 330], [255, 380]],
  [3, [215, 300], [330, 200], [250, 230]],
  [4, [360, 190], [470, 260], [425, 200]],
  [5, [480, 280], [390, 380], [455, 345]],
  [6, [380, 410], [470, 500], [400, 470]],
  [7, [490, 520], [590, 590], [545, 535]],
  [8, [610, 560], [560, 430], [600, 485]],
  [9, [560, 400], [620, 300], [575, 340]],
  [10, [680, 280], [760, 190], [735, 250]],
  [11, [790, 180], [900, 230], [850, 180]],
  [12, [920, 250], [1000, 340], [975, 275]],
  [13, [990, 370], [880, 330], [945, 375]],
  [14, [860, 350], [780, 420], [835, 405]],
  [15, [770, 450], [870, 500], [800, 495]],
  [16, [890, 520], [990, 560], [945, 520]],
  [17, [970, 600], [860, 610], [915, 625]],
  [18, [830, 600], [700, 520], [760, 590]],
];
const fx = (x: number) => 175 + (x - 200) * (790 / 800);
const fy = (y: number) => 285 + (y - 180) * (315 / 430);
const fit = ([x, y]: [number, number]): [number, number] => [Math.round(fx(x)), Math.round(fy(y))];

export const MAP_HOLES: MapHole[] = RAW.map(([hole, tee, green, bend]) => {
  const t = fit(tee);
  const g = fit(green);
  const b = fit(bend);
  // Point on the curve at t = 0.5.
  const pin: [number, number] = [
    Math.round(0.25 * t[0] + 0.5 * b[0] + 0.25 * g[0]),
    Math.round(0.25 * t[1] + 0.5 * b[1] + 0.25 * g[1]),
  ];
  return { hole, tee: t, green: g, bend: b, pin };
});

/** Anchors exported with a rendered hole picture: normalized 0..1 from the top-left. */
export interface Anchor {
  x: number;
  y: number;
  onScreen?: boolean;
  yardsFromTee?: number;
  yardsToPin?: number;
}
export interface HoleView {
  id: "overview" | "green";
  label: string;
  image: string;
  /** Pixel size the anchors were measured on; the picture keeps this aspect ratio. */
  width: number;
  height: number;
  par: number;
  totalYards: number;
  tee: Anchor;
  pin: Anchor;
  markers: Record<string, Anchor>;
  landingZone: Anchor;
  centerline: Anchor[];
}

const asView = (
  id: HoleView["id"],
  label: string,
  image: string,
  a: typeof overview | typeof greenView,
): HoleView => ({
  id,
  label,
  image,
  width: a.width,
  height: a.height,
  par: a.par,
  totalYards: a.totalYards,
  tee: a.tee,
  pin: a.pin,
  markers: a.markers,
  landingZone: a.landingZone,
  centerline: a.centerline,
});

/** Holes that have course art. Only hole 1, and it is an illustration. */
export const HOLE_ART: Record<number, HoleView[]> = {
  1: [
    asView("overview", "Hole overview", "/course/hole-1/overview.webp", overview),
    asView("green", "From the green", "/course/hole-1/green.webp", greenView),
  ],
};
