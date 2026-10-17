import { describe, expect, it } from "vitest";
import { cropRect } from "./draw";

const frame = { x: 100, y: 100, w: 400, h: 400 };

describe("cropRect", () => {
  it("covers the frame exactly when centred and not zoomed (landscape photo)", () => {
    const r = cropRect(800, 400, frame, { zoom: 1, x: 0, y: 0 });
    expect(r.h).toBeCloseTo(400);
    expect(r.w).toBeCloseTo(800);
    expect(r.x).toBeCloseTo(100 - 200); // 200px spare each side
    expect(r.y).toBeCloseTo(100);
  });

  it("never lets the photo leave a gap, however far it is panned", () => {
    for (const x of [-5, -1, 0, 1, 5]) {
      for (const zoom of [1, 1.5, 3]) {
        const r = cropRect(600, 900, frame, { zoom, x, y: x });
        expect(r.x).toBeLessThanOrEqual(frame.x + 1e-9);
        expect(r.x + r.w).toBeGreaterThanOrEqual(frame.x + frame.w - 1e-9);
        expect(r.y).toBeLessThanOrEqual(frame.y + 1e-9);
        expect(r.y + r.h).toBeGreaterThanOrEqual(frame.y + frame.h - 1e-9);
      }
    }
  });

  it("treats zoom below 1 as 1", () => {
    expect(cropRect(500, 500, frame, { zoom: 0.2, x: 0, y: 0 })).toEqual(
      cropRect(500, 500, frame, { zoom: 1, x: 0, y: 0 }),
    );
  });

  it("moves the photo itself: x = -1 slides it fully left, x = 1 fully right", () => {
    const left = cropRect(800, 400, frame, { zoom: 1, x: -1, y: 0 });
    expect(left.x + left.w).toBeCloseTo(frame.x + frame.w); // right edge flush with the frame
    const right = cropRect(800, 400, frame, { zoom: 1, x: 1, y: 0 });
    expect(right.x).toBeCloseTo(frame.x); // left edge flush with the frame
  });
});
