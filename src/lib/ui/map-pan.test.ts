import { describe, expect, it } from "vitest";
import { clampPan, panBounds } from "./map-pan";

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
