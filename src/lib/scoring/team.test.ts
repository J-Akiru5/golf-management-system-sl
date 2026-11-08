import { describe, expect, it } from "vitest";
import {
  aggregateTeam,
  isTeamCombinedFormat,
  isTeamFormat,
  summarizeTeamHoles,
  type TeamHoleInput,
  type TeamPlayerHole,
  teamFormatFromUnknown,
} from "./team";

const player = (
  playerId: string,
  grossStrokes: number | null,
  netStrokes: number | null,
): TeamPlayerHole => ({ playerId, grossStrokes, netStrokes });

const hole = (number: number, players: TeamPlayerHole[], par = 4): TeamHoleInput => ({
  hole: number,
  par,
  players,
});

describe("team format input", () => {
  it("knows the supported formats and rejects an unknown one", () => {
    expect(isTeamFormat("individual")).toBe(true);
    expect(isTeamFormat("four-ball")).toBe(true);
    expect(isTeamFormat("aggregate")).toBe(true);
    expect(isTeamFormat("scramble")).toBe(true);
    expect(isTeamFormat("best-ball")).toBe(false);
    expect(isTeamFormat("texas-scramble")).toBe(false);
    expect(isTeamCombinedFormat("individual")).toBe(false);
    expect(isTeamCombinedFormat("four-ball")).toBe(true);
    expect(teamFormatFromUnknown("aggregate")).toBe("aggregate");
    expect(teamFormatFromUnknown("unknown")).toBeNull();
  });
});

describe("four-ball", () => {
  it("takes the lower net score on each hole and names the player who supplied it", () => {
    const result = aggregateTeam({
      format: "four-ball",
      holesTotal: 2,
      holes: [
        hole(1, [player("antonio", 5, 5), player("ben", 5, 4)]),
        hole(2, [player("antonio", 4, 4), player("ben", 5, 5)]),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe("four-ball");
    expect(result.basis).toBe("net");
    expect(result.holes.map((item) => item.strokes)).toEqual([4, 4]);
    expect(result.holes[0]?.sourcePlayerIds).toEqual(["ben"]);
    expect(result.holes[1]?.sourcePlayerIds).toEqual(["antonio"]);
    expect(result.incompleteHoles).toEqual([]);
    expect(result.totals).toEqual({
      holes: 2,
      totalHoles: 2,
      strokes: 8,
      par: 8,
      toPar: 0,
    });
  });

  it("uses net, not gross, when the two disagree", () => {
    const result = aggregateTeam({
      format: "four-ball",
      holesTotal: 1,
      holes: [hole(1, [player("antonio", 3, 5), player("ben", 5, 4)])],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holes[0]?.strokes).toBe(4);
    expect(result.holes[0]?.sourcePlayerIds).toEqual(["ben"]);
  });

  it("can read a gross-only event when the basis is supplied", () => {
    const result = aggregateTeam({
      format: "four-ball",
      basis: "gross",
      holesTotal: 1,
      holes: [hole(1, [player("antonio", 4, 5), player("ben", 5, 4)])],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holes[0]?.strokes).toBe(4);
    expect(result.holes[0]?.sourcePlayerIds).toEqual(["antonio"]);
  });

  it("names both players when their scores tie", () => {
    const result = aggregateTeam({
      format: "four-ball",
      holesTotal: 1,
      holes: [hole(1, [player("antonio", 5, 4), player("ben", 5, 4)])],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holes[0]?.sourcePlayerIds).toEqual(["antonio", "ben"]);
  });

  it("accepts best ball as the club's other name for four-ball", () => {
    const result = aggregateTeam({
      format: "best-ball",
      holesTotal: 1,
      holes: [hole(1, [player("antonio", 5, 5), player("ben", 5, 4)])],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("four-ball");
    expect(result.holes[0]?.strokes).toBe(4);
  });
});

describe("team aggregate", () => {
  it("sums both net scores on each hole, never just the better one", () => {
    const result = aggregateTeam({
      format: "aggregate",
      holesTotal: 2,
      holes: [
        hole(1, [player("antonio", 5, 5), player("ben", 6, 6)]),
        hole(2, [player("antonio", 4, 4), player("ben", 5, 4)]),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holes.map((item) => item.strokes)).toEqual([11, 8]);
    expect(result.totals.strokes).toBe(19);
    expect(result.totals.par).toBe(8);
    expect(result.totals.toPar).toBe(11);
  });
});

describe("scramble", () => {
  it("reads one shared score and never invents a second player score", () => {
    const result = aggregateTeam({
      format: "scramble",
      basis: "gross",
      holesTotal: 2,
      holes: [hole(1, [player("team", 4, null)]), hole(2, [player("team", 5, null)], 5)],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holes.map((item) => item.strokes)).toEqual([4, 5]);
    expect(result.holes[0]?.sourcePlayerIds).toEqual(["team"]);
    expect(result.totals.strokes).toBe(9);
    expect(result.incompleteHoles).toEqual([]);
  });

  it("refuses two player scores on a scramble hole", () => {
    const result = aggregateTeam({
      format: "scramble",
      basis: "gross",
      holesTotal: 1,
      holes: [hole(1, [player("antonio", 4, 4), player("ben", 4, 4)])],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holes[0]?.strokes).toBeNull();
    expect(result.incompleteHoles).toEqual([1]);
    expect(result.totals.strokes).toBeNull();
    expect(result.warnings.map((problem) => problem.code)).toContain("wrong_player_count");
  });
});

describe("missing and partial data", () => {
  it("names a missing net score and an absent hole, and keeps the total unknown", () => {
    const result = aggregateTeam({
      format: "four-ball",
      holesTotal: 3,
      holes: [
        hole(1, [player("antonio", 5, 5), player("ben", 5, 4)]),
        hole(2, [player("antonio", 5, null), player("ben", 5, 4)]),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.holes[0]?.strokes).toBe(4);
    expect(result.holes[1]?.strokes).toBeNull();
    expect(result.holes[2]?.strokes).toBeNull();
    expect(result.incompleteHoles).toEqual([2, 3]);
    expect(result.totals.strokes).toBeNull();
    expect(result.totals.toPar).toBeNull();
    expect(result.warnings.map((problem) => problem.code)).toContain("missing_net_score");
    expect(result.warnings.map((problem) => problem.code)).toContain("missing_score");
  });

  it("does not score a hole when one of the two players is missing", () => {
    const result = aggregateTeam({
      format: "four-ball",
      holesTotal: 2,
      holes: [
        hole(1, [player("antonio", 5, 5)]),
        hole(2, [player("antonio", 4, 4), player("ben", 5, 4)]),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holes[0]?.strokes).toBeNull();
    expect(result.holes[0]?.sourcePlayerIds).toEqual([]);
    expect(result.incompleteHoles).toEqual([1]);
    expect(result.totals.strokes).toBeNull();
    expect(result.warnings.map((problem) => problem.code)).toContain("wrong_player_count");
  });

  it("never reads a missing score as zero", () => {
    const result = aggregateTeam({
      format: "aggregate",
      holesTotal: 1,
      holes: [hole(1, [player("antonio", null, null), player("ben", 5, 4)])],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holes[0]?.strokes).toBeNull();
    expect(result.totals.strokes).toBeNull();
    expect(result.totals.holes).toBe(0);
  });

  it("rejects a score of zero or a fraction", () => {
    const result = aggregateTeam({
      format: "four-ball",
      holesTotal: 2,
      holes: [
        hole(1, [player("antonio", 0, 0), player("ben", 5, 4)]),
        hole(2, [player("antonio", 4.5, 4.5), player("ben", 5, 4)]),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holes.every((item) => item.strokes === null)).toBe(true);
    expect(result.incompleteHoles).toEqual([1, 2]);
    expect(result.warnings.filter((problem) => problem.code === "invalid_score")).toHaveLength(2);
  });

  it("names a duplicate hole instead of picking one of the entries", () => {
    const result = aggregateTeam({
      format: "four-ball",
      holesTotal: 1,
      holes: [
        hole(1, [player("antonio", 5, 5), player("ben", 5, 4)]),
        hole(1, [player("antonio", 4, 4), player("ben", 4, 4)]),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holes[0]?.strokes).toBeNull();
    expect(result.incompleteHoles).toEqual([1]);
    expect(result.warnings.map((problem) => problem.code)).toContain("duplicate_hole");
  });
});

describe("unsupported and inapplicable formats", () => {
  it("returns no team total for an individual event, with a stated reason", () => {
    const result = aggregateTeam({ format: "individual", holesTotal: 1, holes: [] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]?.code).toBe("individual_has_no_team_total");
    expect(result.incompleteHoles).toEqual([]);
  });

  it("returns no team total for an unsupported format, with a stated reason", () => {
    const result = aggregateTeam({ format: "texas-scramble", holesTotal: 1, holes: [] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]?.code).toBe("unsupported_format");
    expect(result.problems[0]?.message).toContain("texas-scramble");
  });

  it("rejects an invalid hole count", () => {
    const result = aggregateTeam({ format: "four-ball", holesTotal: 0, holes: [] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]?.code).toBe("invalid_holes_total");
  });
});

describe("nine and whole-card totals", () => {
  it("summarises a nine from the same per-hole team results", () => {
    const holes = Array.from({ length: 18 }, (_, index) =>
      hole(index + 1, [player("antonio", 4, 4), player("ben", 5, 5)]),
    );
    const result = aggregateTeam({ format: "four-ball", holesTotal: 18, holes });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(summarizeTeamHoles(result.holes, 18, 1, 9)).toEqual({
      holes: 9,
      totalHoles: 9,
      strokes: 36,
      par: 36,
      toPar: 0,
    });
    expect(summarizeTeamHoles(result.holes, 18, 10, 18).strokes).toBe(36);
    expect(result.totals.strokes).toBe(72);
  });

  it("keeps a nine total unknown while one hole in that nine has no score", () => {
    const holes = Array.from({ length: 18 }, (_, index) =>
      hole(index + 1, [player("antonio", 4, 4), player("ben", 5, 5)]),
    );
    const result = aggregateTeam({
      format: "four-ball",
      holesTotal: 18,
      holes: holes.filter((item) => item.hole !== 7),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(summarizeTeamHoles(result.holes, 18, 1, 9).strokes).toBeNull();
    expect(summarizeTeamHoles(result.holes, 18, 10, 18).strokes).toBe(36);
    expect(result.totals.strokes).toBeNull();
  });
});
