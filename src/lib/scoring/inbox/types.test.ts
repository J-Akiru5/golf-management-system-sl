import { describe, expect, it } from "vitest";
import type { ScanRecord, ScanSuggestion } from "./types";

describe("scan record shape", () => {
  it("uses null, not undefined, for every value that is not set", () => {
    const scan: ScanRecord = {
      id: "scan-1",
      roundId: "round-1",
      state: "uploaded",
      image: null,
      reading: null,
      suggestions: [],
      playerId: null,
      markerId: null,
      confirmedBy: null,
      confirmedAt: null,
      scorecardId: null,
      setAside: null,
    };

    for (const value of [
      scan.image,
      scan.reading,
      scan.playerId,
      scan.markerId,
      scan.confirmedBy,
      scan.confirmedAt,
      scan.scorecardId,
      scan.setAside,
    ]) {
      expect(value).toBeNull();
    }
  });

  it("carries the matcher fields on a suggestion", () => {
    const suggestion: ScanSuggestion = {
      playerId: "player-1",
      score: 0.8,
      reasons: [{ code: "surname-exact", text: "surname matches" }],
      hasCard: false,
    };
    expect(suggestion.reasons[0]?.code).toBe("surname-exact");
    expect(suggestion.hasCard).toBe(false);
  });
});
