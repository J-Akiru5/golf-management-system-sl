import { describe, expect, it } from "vitest";
import { demoScanResult } from "./demo";
import { normalizeScanResult } from "./normalize";

const bytes = new TextEncoder().encode("a real photo's bytes would be here");

describe("demo scan result", () => {
  it("returns four complete rows that pass the real normalizer", () => {
    const result = normalizeScanResult(demoScanResult(bytes));
    expect(result?.engine).toBe("demo-reader");
    expect(result?.players).toHaveLength(4);
    for (const player of result?.players ?? []) {
      expect(player.holes.map((hole) => hole.hole)).toEqual(
        Array.from({ length: 18 }, (_, index) => index + 1),
      );
    }
  });

  it("includes weak and blank cells so the review path has something to flag", () => {
    const result = demoScanResult(bytes);
    const weak = result.players.flatMap((player) =>
      player.holes.filter((hole) => hole.confidence === null || hole.confidence < 0.9),
    );
    const blank = result.players.flatMap((player) =>
      player.holes.filter((hole) => hole.strokes === null),
    );
    expect(weak.length).toBeGreaterThan(0);
    expect(blank.length).toBeGreaterThan(0);
  });

  it("changes the draft with the image instead of returning a fixed card", () => {
    const other = demoScanResult(new TextEncoder().encode("another photo"));
    expect(other.players[0]?.holes).not.toEqual(demoScanResult(bytes).players[0]?.holes);
  });
});
