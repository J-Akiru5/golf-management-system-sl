import { describe, expect, it } from "vitest";
import { MAP_HOLES } from "./layout";
import { holePath, mapBounds, PLAYER_MAP_HOLES, viewBoxOf } from "./player-map";

describe("mapBounds", () => {
  it("holds every tee, bend and green with room for the labels", () => {
    const bounds = mapBounds(MAP_HOLES);
    for (const hole of MAP_HOLES) {
      for (const point of [hole.tee, hole.bend, hole.green]) {
        expect(point[0]).toBeGreaterThanOrEqual(bounds.x);
        expect(point[0]).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(point[1]).toBeGreaterThanOrEqual(bounds.y);
        expect(point[1]).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
    }
  });

  it("never produces an empty view box", () => {
    expect(mapBounds([])).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    const view = viewBoxOf(mapBounds([]));
    expect(view.split(" ")).toHaveLength(4);
  });

  it("draws a curve from the tee to the green", () => {
    const first = PLAYER_MAP_HOLES[0];
    expect(first).toBeDefined();
    if (!first) return;
    const path = holePath(first);
    expect(path.startsWith(`M ${first.tee[0]} ${first.tee[1]}`)).toBe(true);
    expect(path).toContain(" Q ");
    expect(path.endsWith(`${first.green[0]} ${first.green[1]}`)).toBe(true);
  });
});
