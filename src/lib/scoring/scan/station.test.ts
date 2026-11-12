import { describe, expect, it } from "vitest";
import {
  SCAN_STATION_STEPS,
  SCAN_STATION_STROKE_MAX,
  SCAN_STATION_STROKE_MIN,
  scanStationCellState,
  scanStationExportReadiness,
} from "./station";

const holes = Array.from({ length: 18 }, (_, index) => ({ number: index + 1 }));

function everyHole(value: string): Record<number, string> {
  return Object.fromEntries(holes.map((hole) => [hole.number, value]));
}

describe("scanStationCellState", () => {
  it("accepts a number from 1 to 20", () => {
    expect(scanStationCellState("1")).toBe("filled");
    expect(scanStationCellState("4")).toBe("filled");
    expect(scanStationCellState(SCAN_STATION_STROKE_MIN)).toBe("filled");
    expect(scanStationCellState(SCAN_STATION_STROKE_MAX)).toBe("filled");
  });

  it("counts X as a recorded hole", () => {
    expect(scanStationCellState("X")).toBe("filled");
    expect(scanStationCellState("x")).toBe("filled");
  });

  it("treats a blank as blank, not zero", () => {
    expect(scanStationCellState("")).toBe("blank");
    expect(scanStationCellState("   ")).toBe("blank");
    expect(scanStationCellState(null)).toBe("blank");
    expect(scanStationCellState(undefined)).toBe("blank");
  });

  it("rejects zero, above 20, decimals and text", () => {
    expect(scanStationCellState("0")).toBe("invalid");
    expect(scanStationCellState("21")).toBe("invalid");
    expect(scanStationCellState("4.5")).toBe("invalid");
    expect(scanStationCellState("four")).toBe("invalid");
  });
});

describe("scanStationExportReadiness", () => {
  it("is ready when every hole has a number", () => {
    const result = scanStationExportReadiness({ holes, strokes: everyHole("4") });
    expect(result.ready).toBe(true);
    expect(result.filled).toBe(18);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.label).toBe("Ready to export");
  });

  it("is ready when X fills the last hole", () => {
    const strokes = { ...everyHole("4"), 18: "X" };
    const result = scanStationExportReadiness({ holes, strokes });
    expect(result.ready).toBe(true);
    expect(result.filled).toBe(18);
  });

  it("is ready when every hole is X", () => {
    const result = scanStationExportReadiness({ holes, strokes: everyHole("X") });
    expect(result.ready).toBe(true);
    expect(result.filled).toBe(18);
  });

  it("does not turn a blank into a score", () => {
    const strokes = { ...everyHole("4"), 18: "" };
    const result = scanStationExportReadiness({ holes, strokes });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual([18]);
    expect(result.blockers).toContain("Hole 18 has no score.");
    expect(result.label).toBe("Fill 1 hole");
  });

  it("names invalid cells and keeps them out of the filled count", () => {
    const strokes = { ...everyHole("4"), 7: "0", 8: "21" };
    const result = scanStationExportReadiness({ holes, strokes });
    expect(result.ready).toBe(false);
    expect(result.invalid).toEqual([7, 8]);
    expect(result.filled).toBe(16);
    expect(result.label).toBe("Fix 2 holes");
  });

  it("does not let warnings block export", () => {
    const result = scanStationExportReadiness({
      holes,
      strokes: everyHole("5"),
      warnings: ["Hole 3 was read weakly.", "The written total does not match."],
    });
    expect(result.ready).toBe(true);
    expect(result.warnings).toHaveLength(2);
  });

  it("is not ready when the round has no holes", () => {
    const result = scanStationExportReadiness({ holes: [], strokes: {} });
    expect(result.ready).toBe(false);
    expect(result.label).toBe("No holes in this round");
  });
});

describe("SCAN_STATION_STEPS", () => {
  it("keeps the four ordered steps", () => {
    expect(SCAN_STATION_STEPS.map((step) => step.key)).toEqual([
      "capture",
      "read",
      "verify",
      "export",
    ]);
  });
});
