import { describe, expect, it } from "vitest";
import type { RoundPlayer } from "../match";
import { matchPlayers } from "../match";
import { suggestForScan } from "./suggest";
import type { ScanReading } from "./types";

const READ_AT = "2026-11-13T08:00:00.000Z";

const ROSTER: readonly RoundPlayer[] = [
  { playerId: "gormley", name: "GORMLEY, DARIO", tee: "B", playingHandicap: 12, group: "1A" },
  { playerId: "germley", name: "GERMLEY, NELIO", tee: "B", playingHandicap: 13, group: "1A" },
  { playerId: "lim", name: "LIM, TONY", tee: "W", playingHandicap: 8, group: "2A" },
  { playerId: "lom", name: "LOM, BERTO", tee: "W", playingHandicap: 9, group: "2A" },
  { playerId: "lorena", name: "LORENA, MARISOL", tee: "W", playingHandicap: 10, group: "2A" },
];

function reading(name: string | null): ScanReading {
  return {
    engine: "test-reader",
    engineVersion: "1.0.0",
    name,
    writtenTotal: 78,
    holes: [{ hole: 1, strokes: 4, confidence: 0.9 }],
    readAt: READ_AT,
  };
}

describe("suggestForScan", () => {
  it("puts GORMLEY first for the Day 1 misread Wormley", () => {
    const suggestions = suggestForScan(reading("Wormley"), ROSTER);
    expect(suggestions[0]?.playerId).toBe("gormley");
    expect(suggestions[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("puts LIM first for the Day 1 misread Um", () => {
    const suggestions = suggestForScan(reading("Um"), ROSTER);
    expect(suggestions[0]?.playerId).toBe("lim");
  });

  it("returns nothing for an empty name", () => {
    expect(suggestForScan(reading(""), ROSTER)).toEqual([]);
    expect(suggestForScan(reading("   "), ROSTER)).toEqual([]);
    expect(suggestForScan(reading(null), ROSTER)).toEqual([]);
  });

  it("returns nothing without a reading", () => {
    expect(suggestForScan(null, ROSTER)).toEqual([]);
  });

  it("passes the matcher options through", () => {
    const suggestions = suggestForScan(reading("Lorena"), ROSTER, { limit: 1 });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.playerId).toBe("lorena");
  });

  it("only uses the name the reader returned", () => {
    const card = { name: "Wormley" };
    expect(suggestForScan(reading("Wormley"), ROSTER)).toEqual(
      matchPlayers(card, ROSTER).map((candidate) => ({
        playerId: candidate.playerId,
        score: candidate.score,
        reasons: candidate.reasons,
        hasCard: candidate.hasCard,
      })),
    );
  });

  it("never picks a player for the desk", () => {
    const suggestions = suggestForScan(reading("Lim"), ROSTER);
    expect(suggestions.length).toBeGreaterThan(1);
  });
});
