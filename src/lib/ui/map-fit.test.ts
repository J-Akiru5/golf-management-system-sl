import { describe, expect, it } from "vitest";
import { coverFit, fitMap } from "./map-fit";

const world = { w: 1440, h: 900, margin: 220 };
// Roughly the placeholder course: x 105..1035, y 245..640 with label room.
const box = { x0: 105, y0: 245, x1: 1035, y1: 640 };

/** Every hole box corner must land inside the free area, and the canopy must fill the section. */
function check(view: { w: number; h: number }, safe: Parameters<typeof fitMap>[0]["safe"]) {
  const fit = fitMap({ view, world, box, safe, maxScale: 1.25 });
  const left = fit.ox + box.x0 * fit.s;
  const right = fit.ox + box.x1 * fit.s;
  const top = fit.oy + box.y0 * fit.s;
  const bottom = fit.oy + box.y1 * fit.s;
  const canopyLeft = fit.ox - world.margin * fit.s;
  const canopyRight = fit.ox + (world.w + world.margin) * fit.s;
  const canopyTop = fit.oy - world.margin * fit.s;
  const canopyBottom = fit.oy + (world.h + world.margin) * fit.s;
  return { fit, left, right, top, bottom, canopyLeft, canopyRight, canopyTop, canopyBottom };
}

describe("fitMap", () => {
  it("keeps every hole clear of the rail, the edge and the title on a 1048x805 laptop", () => {
    const safe = { left: 112, right: 24, top: 285, bottom: 56 };
    const r = check({ w: 1048, h: 805 }, safe);
    expect(r.left).toBeGreaterThanOrEqual(safe.left - 1);
    expect(r.right).toBeLessThanOrEqual(1048 - safe.right + 1);
    expect(r.top).toBeGreaterThanOrEqual(safe.top - 1);
    expect(r.bottom).toBeLessThanOrEqual(805 - safe.bottom + 1);
  });

  it("uses a larger scale than covering would have, so the course is not cropped", () => {
    const safe = { left: 112, right: 24, top: 285, bottom: 56 };
    const r = check({ w: 1048, h: 805 }, safe);
    expect(r.fit.s).toBeLessThanOrEqual(1.25);
    expect(r.left).toBeGreaterThan(0);
    expect(r.right).toBeLessThan(1048);
  });

  it("never exposes a bare canopy edge, at tablet, laptop and tall sizes", () => {
    for (const [w, h, left] of [
      [768, 1024, 24],
      [1048, 805, 112],
      [1180, 820, 264],
      [900, 1400, 24],
    ] as const) {
      const r = check({ w, h }, { left, right: 24, top: 285, bottom: 56 });
      expect(r.canopyLeft).toBeLessThanOrEqual(0.5);
      expect(r.canopyTop).toBeLessThanOrEqual(0.5);
      expect(r.canopyRight).toBeGreaterThanOrEqual(w - 0.5);
      expect(r.canopyBottom).toBeGreaterThanOrEqual(h - 0.5);
    }
  });

  it("never scales past the cap, even in a very tall narrow section", () => {
    const r = check({ w: 700, h: 2000 }, { left: 24, right: 24, top: 285, bottom: 56 });
    expect(r.fit.s).toBeGreaterThanOrEqual(2000 / (world.h + 2 * world.margin) - 1e-9);
  });
});

describe("coverFit", () => {
  it("centres the map and fills the section", () => {
    const fit = coverFit({ w: 1440, h: 900 }, world);
    expect(fit).toEqual({ s: 1, ox: 0, oy: 0, dx: 0, dy: 0 });
  });
});
