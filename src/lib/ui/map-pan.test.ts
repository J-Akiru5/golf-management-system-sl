import { describe, expect, it } from "vitest";
import { clampPan, clampZoom, MAX_ZOOM, MIN_ZOOM, panBounds, zoomAbout } from "./map-pan";

const view = { width: 1200, height: 800 };

describe("panBounds", () => {
  it("gives no room when the map only just covers the view", () => {
    expect(panBounds(view, { width: 1200, height: 800 })).toEqual({
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    });
  });

  it("allows the whole overhang on each axis, split evenly", () => {
    // 1600 wide against 1200 leaves 400 of slack, so 200 each way.
    const b = panBounds(view, { width: 1600, height: 800 });
    expect(b.minX).toBe(-200);
    expect(b.maxX).toBe(200);
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(0);
  });

  it("allows vertical travel when the map is taller than the view", () => {
    const b = panBounds(view, { width: 1200, height: 1000 });
    expect(b.minY).toBe(-100);
    expect(b.maxY).toBe(100);
    expect(b.minX).toBe(0);
    expect(b.maxX).toBe(0);
  });

  it("never allows a pan when the map is smaller than the view", () => {
    expect(panBounds(view, { width: 600, height: 400 })).toEqual({
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    });
  });

  it("widens the travel as the map is zoomed", () => {
    // 1600×800 at zoom 2 is 3200×1600 against a 1200×800 view: 1000 of slack each way across,
    // 400 up and down.
    const b = panBounds(view, { width: 1600, height: 800 }, 2);
    expect(b.minX).toBe(-1000);
    expect(b.maxX).toBe(1000);
    expect(b.minY).toBe(-400);
    expect(b.maxY).toBe(400);
  });
});

describe("clampZoom", () => {
  it("keeps a zoom inside the allowed range", () => {
    expect(clampZoom(1.6)).toBe(1.6);
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });

  it("falls back to no zoom for a value that is not a number", () => {
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MAX_ZOOM);
  });
});

describe("zoomAbout", () => {
  const centre = { x: 600, y: 400 };

  it("keeps the map point under the cursor in place", () => {
    const pan = { x: 60, y: -40 };
    const focus = { x: 900, y: 250 };
    // The screen offset of the map point under the cursor, then where it lands after zooming.
    const offset = { x: (focus.x - centre.x - pan.x) / 1, y: (focus.y - centre.y - pan.y) / 1 };
    const next = zoomAbout(pan, 1, 2, focus, centre);
    const landed = {
      x: centre.x + next.x + 2 * offset.x,
      y: centre.y + next.y + 2 * offset.y,
    };
    expect(landed.x).toBeCloseTo(focus.x, 6);
    expect(landed.y).toBeCloseTo(focus.y, 6);
  });

  it("leaves the pan alone when the zoom does not change", () => {
    expect(zoomAbout({ x: 30, y: 10 }, 1.5, 1.5, { x: 0, y: 0 }, centre)).toEqual({
      x: 30,
      y: 10,
    });
  });

  it("ignores a zoom that is not a positive number", () => {
    expect(zoomAbout({ x: 12, y: 4 }, 0, 2, { x: 100, y: 100 }, centre)).toEqual({
      x: 12,
      y: 4,
    });
  });
});

describe("clampPan", () => {
  const bounds = panBounds(view, { width: 1600, height: 1000 });

  it("leaves a pan inside the bounds alone", () => {
    expect(clampPan({ x: 40, y: -60 }, bounds)).toEqual({ x: 40, y: -60 });
  });

  it("stops a drag at the edge instead of showing a gap", () => {
    expect(clampPan({ x: -900, y: 900 }, bounds)).toEqual({ x: -200, y: 100 });
    expect(clampPan({ x: 900, y: -900 }, bounds)).toEqual({ x: 200, y: -100 });
  });

  it("holds a map that cannot move at zero", () => {
    const fixed = panBounds(view, { width: 1200, height: 800 });
    expect(clampPan({ x: 50, y: 50 }, fixed)).toEqual({ x: 0, y: 0 });
  });
});
