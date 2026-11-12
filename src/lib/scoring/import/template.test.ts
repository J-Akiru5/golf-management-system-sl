import { describe, expect, it } from "vitest";
import { parseScorecardImport } from "./parse";
import { resolveScorecardImport } from "./resolve";
import { buildScorecardImportTemplate } from "./template";

const holes = Array.from({ length: 18 }, (_, index) => ({
  number: index + 1,
  par: 4,
  strokeIndex: index + 1,
}));

describe("buildScorecardImportTemplate", () => {
  it("pre-fills the round, group, player and marker", () => {
    const template = buildScorecardImportTemplate({
      tournamentId: "2c9a7b60-3f4d-4e8a-9b1c-6d5e4f3a2b10",
      roundId: "8f14e45f-ea4b-4c3a-9f0e-2b6d1c7a5e10",
      dayNumber: 1,
      players: [
        { playerId: "p1", playerName: "ADORIO, RONNEL" },
        { playerId: "p2", playerName: "SULPICO, RANDY" },
      ],
      groups: [{ number: 3, playerIds: ["p1", "p2"] }],
      holes,
      markers: [
        { playerId: "p1", scorerId: "p2" },
        { playerId: "p2", scorerId: "p1" },
      ],
    });

    expect(template.cards).toHaveLength(2);
    expect(template.cards[0]?.groupNumber).toBe(3);
    expect(template.cards[0]?.markerName).toBe("SULPICO, RANDY");
    expect(template.cards[0]?.markerPlayerId).toBe("p2");
    expect(Object.keys(template.cards[0]?.holes ?? {})).toHaveLength(18);
    expect(Object.values(template.cards[0]?.holes ?? {})).toEqual(
      Array.from({ length: 18 }, () => null),
    );
    expect(template.cards[0]?.writtenTotal).toBeNull();
  });

  it("sorts the cards by group and player", () => {
    const template = buildScorecardImportTemplate({
      tournamentId: "2c9a7b60-3f4d-4e8a-9b1c-6d5e4f3a2b10",
      roundId: "8f14e45f-ea4b-4c3a-9f0e-2b6d1c7a5e10",
      dayNumber: 1,
      players: [
        { playerId: "p3", playerName: "ZULU, ZED" },
        { playerId: "p1", playerName: "ALPHA, ANNE" },
        { playerId: "p2", playerName: "BRAVO, BEN" },
      ],
      groups: [
        { number: 2, playerIds: ["p3"] },
        { number: 1, playerIds: ["p1", "p2"] },
      ],
      holes,
      markers: [],
    });
    expect(template.cards.map((card) => card.playerName)).toEqual([
      "ALPHA, ANNE",
      "BRAVO, BEN",
      "ZULU, ZED",
    ]);
  });

  it("leaves the name and time blank for the transcriber", () => {
    const template = buildScorecardImportTemplate({
      tournamentId: "2c9a7b60-3f4d-4e8a-9b1c-6d5e4f3a2b10",
      roundId: "8f14e45f-ea4b-4c3a-9f0e-2b6d1c7a5e10",
      dayNumber: 2,
      players: [{ playerId: "p1", playerName: "ALPHA, ANNE" }],
      groups: null,
      holes,
      markers: [],
    });
    expect(template.extractedBy).toBe("");
    expect(template.extractedAt).toBe("");
    expect(template.dayNumber).toBe(2);
    expect(template.cards[0]?.groupNumber).toBeNull();
  });

  it("round-trips from template to a ready import plan", () => {
    const template = buildScorecardImportTemplate({
      tournamentId: "bamboo-tee-2026",
      roundId: "demo-round-1",
      dayNumber: 1,
      players: [
        { playerId: "demo-p1", playerName: "ADORIO, RONNEL" },
        { playerId: "demo-p2", playerName: "SULPICO, RANDY" },
      ],
      groups: [{ number: 1, playerIds: ["demo-p1", "demo-p2"] }],
      holes,
      markers: [
        { playerId: "demo-p1", scorerId: "demo-p2" },
        { playerId: "demo-p2", scorerId: "demo-p1" },
      ],
    });
    template.extractedBy = "Karl";
    template.extractedAt = "2026-11-12T18:40:00+08:00";
    for (const card of template.cards) {
      card.holes = Object.fromEntries(Object.keys(card.holes).map((hole) => [hole, 5]));
      card.writtenTotal = 90;
    }

    const parsed = parseScorecardImport(template);
    expect(parsed.problems).toEqual([]);
    if (!parsed.file) throw new Error("expected a parsed file");
    const plan = resolveScorecardImport({
      file: parsed.file,
      roundId: "demo-round-1",
      tournamentId: "bamboo-tee-2026",
      dayNumber: 1,
      players: [
        { playerId: "demo-p1", playerName: "ADORIO, RONNEL" },
        { playerId: "demo-p2", playerName: "SULPICO, RANDY" },
      ],
      groups: [{ number: 1, playerIds: ["demo-p1", "demo-p2"] }],
      cards: [],
    });
    expect(plan.problems).toEqual([]);
    expect(plan.ready).toHaveLength(2);
    expect(plan.blocked).toEqual([]);
  });

  it("is not importable until every hole is filled", () => {
    const template = buildScorecardImportTemplate({
      tournamentId: "2c9a7b60-3f4d-4e8a-9b1c-6d5e4f3a2b10",
      roundId: "8f14e45f-ea4b-4c3a-9f0e-2b6d1c7a5e10",
      dayNumber: 1,
      players: [{ playerId: "p1", playerName: "ALPHA, ANNE" }],
      groups: [{ number: 1, playerIds: ["p1"] }],
      holes,
      markers: [{ playerId: "p1", scorerId: "p2" }],
    });
    const parsed = parseScorecardImport(template);
    expect(parsed.file).toBeNull();
    expect(parsed.problems.some((problem) => problem.path === "extractedBy")).toBe(true);
    expect(
      parsed.problems.some(
        (problem) => problem.path === "cards[0].holes" && problem.message.includes("empty"),
      ),
    ).toBe(true);
  });
});
