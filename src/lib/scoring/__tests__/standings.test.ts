import { describe, expect, it } from "vitest";
import { PROPOSED_SCORING_RULES } from "../defaults";
import { calculateHandicap } from "../handicap";
import { deriveCanonicalHoleScores } from "../reconcile";
import { buildStandings, checkFinalization } from "../standings";
import type {
  CanonicalRound,
  HandicapSnapshot,
  HoleDefinition,
  RoundCourse,
  StandingsInput,
  StandingsPlayer,
  TeeRatings,
  TieBreakPolicy,
} from "../types";
import { makeCard, TEST_HOLES, TEST_POLICY } from "./fixtures";

const FLAT_TEE: TeeRatings = {
  id: "white",
  name: "White",
  courseRating: 72,
  slope: 113,
  par: 72,
};

const COURSE: RoundCourse = {
  roundId: "round-1",
  tee: FLAT_TEE,
  holes: TEST_HOLES,
};

function snapshotFor(index: number): HandicapSnapshot {
  return snapshotForTee(index, FLAT_TEE);
}

function snapshotForTee(index: number, tee: TeeRatings): HandicapSnapshot {
  const result = calculateHandicap({
    index,
    indexSource: "NGAP export 2026-11",
    indexEffectiveDate: "2026-11-01",
    tee,
    allowance: 1,
    rounding: "whs",
    rulesVersion: "test-rules-v1",
  });
  if (!result.ok) throw new Error("Test snapshot is invalid.");
  return result.snapshot;
}

function entriesFor(strokes: (hole: HoleDefinition) => number) {
  return TEST_HOLES.map((hole) => ({
    hole: hole.number,
    strokes: strokes(hole),
    confidence: null,
    manuallyConfirmed: true,
  }));
}

function canonicalFor(
  playerId: string,
  roundId = "round-1",
  strokes: (hole: HoleDefinition) => number = (hole) => hole.par,
): CanonicalRound {
  const course = roundId === "round-1" ? COURSE : { ...COURSE, roundId };
  const cards = ["a", "b"].map((suffix) =>
    makeCard({
      id: `${playerId}-${suffix}`,
      roundId,
      playerId,
      scorerId: `${playerId}-marker-${suffix}`,
      entries: entriesFor(strokes),
      writtenTotal: null,
    }),
  );
  return deriveCanonicalHoleScores({
    roundId,
    playerId,
    course,
    cards,
    policy: TEST_POLICY,
  });
}

function canonicalWithConflict(playerId: string): CanonicalRound {
  const cards = [
    makeCard({
      id: `${playerId}-a`,
      playerId,
      scorerId: `${playerId}-marker-a`,
      entries: entriesFor((hole) => hole.par),
      writtenTotal: null,
    }),
    makeCard({
      id: `${playerId}-b`,
      playerId,
      scorerId: `${playerId}-marker-b`,
      entries: entriesFor((hole) => (hole.number === 5 ? hole.par + 1 : hole.par)),
      writtenTotal: null,
    }),
  ];
  return deriveCanonicalHoleScores({
    roundId: "round-1",
    playerId,
    course: COURSE,
    cards,
    policy: TEST_POLICY,
  });
}

function player(
  playerId: string,
  playerName: string,
  index: number | null,
  canonical: CanonicalRound,
): StandingsPlayer {
  return {
    registrationId: `reg-${playerId}`,
    playerId,
    playerName,
    flightId: "flight-a",
    canonical,
    handicap: index === null ? null : snapshotFor(index),
  };
}

function standingsInput(players: StandingsPlayer[], roundId = "round-1"): StandingsInput {
  const course = roundId === "round-1" ? COURSE : { ...COURSE, roundId };
  return { roundId, course, policy: TEST_POLICY, players };
}

const TIE_BREAK: TieBreakPolicy = {
  id: "tb-2026",
  name: "Back 9, then back 6, then back 3, then last hole",
  source: "Organizer's written rules, 20 Oct 2026",
  confirmedBy: "organizer-1",
  confirmedAt: "2026-10-20T09:00:00.000Z",
};

describe("provisional standings", () => {
  it("builds separate gross and net boards", () => {
    const p1 = player("p1", "Alpha", 0, canonicalFor("p1"));
    const p2 = player("p2", "Bravo", 18, canonicalFor("p2"));
    const p3 = player(
      "p3",
      "Charlie",
      9,
      canonicalFor("p3", "round-1", () => 5),
    );

    const result = buildStandings(standingsInput([p1, p2, p3]));

    expect(result.official).toBe(false);
    expect(result.gross.kind).toBe("gross");
    expect(result.gross.rows.map((row) => [row.playerId, row.position, row.tied])).toEqual([
      ["p1", 1, true],
      ["p2", 1, true],
      ["p3", 3, false],
    ]);

    expect(result.net.kind).toBe("net");
    expect(result.net.rows.map((row) => [row.playerId, row.position, row.netPoints])).toEqual([
      ["p2", 1, 54],
      ["p1", 2, 36],
      ["p3", 3, 27],
    ]);
    expect(result.net.rows[0]?.netStrokes).toBe(54);
    expect(result.net.rows[0]?.grossPoints).toBe(36);
  });

  it("counts only holes that meet the verification requirement", () => {
    const p1 = player("p1", "Alpha", 18, canonicalWithConflict("p1"));
    const result = buildStandings(standingsInput([p1]));

    const row = result.gross.rows[0];
    if (!row) throw new Error("Expected a row.");
    expect(row.holesCounted).toBe(17);
    expect(row.totalHoles).toBe(18);
    expect(row.grossPoints).toBe(34);
    expect(row.netPoints).toBe(51);
    expect(row.complete).toBe(false);
    expect(row.provisional).toBe(true);
  });

  it("excludes a player with no usable hole", () => {
    const cards = [
      makeCard({
        id: "card-a",
        playerId: "p1",
        scorerId: "marker-a",
        entries: entriesFor((hole) => hole.par),
        writtenTotal: null,
      }),
    ];
    const pending = deriveCanonicalHoleScores({
      roundId: "round-1",
      playerId: "p1",
      course: COURSE,
      cards,
      policy: { ...TEST_POLICY, allowProvisionalSingleCard: false },
    });

    const result = buildStandings(standingsInput([player("p1", "Alpha", 18, pending)]));

    expect(result.gross.rows).toEqual([]);
    expect(result.excluded).toEqual([
      expect.objectContaining({ playerId: "p1", reason: "no_eligible_holes" }),
    ]);
  });

  it("keeps a player on the gross board when net cannot be calculated", () => {
    const p1 = player("p1", "Alpha", null, canonicalFor("p1"));
    const result = buildStandings(standingsInput([p1]));

    expect(result.gross.rows).toHaveLength(1);
    expect(result.net.rows).toEqual([]);
    expect(result.netExcluded).toEqual([
      expect.objectContaining({ playerId: "p1", reason: "handicap_unavailable" }),
    ]);
  });

  it("uses each player's own tee snapshot in the same daily round", () => {
    const otherTee: TeeRatings = {
      id: "red",
      name: "Red",
      courseRating: 70,
      slope: 120,
      par: 72,
    };
    const p1 = player("p1", "Alpha", 0, canonicalFor("p1"));
    const p2Base = player("p2", "Bravo", 18, canonicalFor("p2"));
    const p2 = { ...p2Base, handicap: snapshotForTee(18, otherTee) };

    const result = buildStandings(standingsInput([p1, p2]));
    const row = result.net.rows.find((candidate) => candidate.playerId === "p2");

    expect(result.excluded).toEqual([]);
    expect(row?.netStatus).toBe("calculated");
    expect(row?.netPoints).toBe(53);
  });

  it("is deterministic", () => {
    const input = standingsInput([
      player("p1", "Alpha", 0, canonicalFor("p1")),
      player("p2", "Bravo", 18, canonicalFor("p2")),
    ]);
    expect(buildStandings(input)).toEqual(buildStandings(input));
  });

  it("fails closed when the round setup is invalid", () => {
    const result = buildStandings({
      ...standingsInput([player("p1", "Alpha", 0, canonicalFor("p1"))]),
      policy: { ...TEST_POLICY, requiredCards: 0 },
    });

    expect(result.gross.rows).toEqual([]);
    expect(result.net.rows).toEqual([]);
    expect(result.excluded).toEqual([
      expect.objectContaining({ playerId: "p1", reason: "scoring_failed" }),
    ]);
  });
});

describe("separate daily rounds", () => {
  it("never mixes one day's results into another day's board", () => {
    const roundOne = buildStandings(
      standingsInput([player("p1", "Alpha", 0, canonicalFor("p1", "round-1"))], "round-1"),
    );
    const roundTwo = buildStandings(
      standingsInput([player("p2", "Bravo", 0, canonicalFor("p2", "round-2"))], "round-2"),
    );

    expect(roundOne.gross.rows.map((row) => row.playerId)).toEqual(["p1"]);
    expect(roundTwo.gross.rows.map((row) => row.playerId)).toEqual(["p2"]);
  });

  it("rejects a card from another daily round", () => {
    const result = deriveCanonicalHoleScores({
      roundId: "round-2",
      playerId: "p1",
      course: { ...COURSE, roundId: "round-2" },
      cards: [
        makeCard({
          id: "card-a",
          roundId: "round-1",
          playerId: "p1",
          scorerId: "marker-a",
        }),
      ],
      policy: TEST_POLICY,
    });

    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "wrong_round_card" })]),
    );
    expect(result.counts.pending).toBe(18);
  });
});

describe("finalization gate", () => {
  const readyPlayers = () => [
    player("p1", "Alpha", 0, canonicalFor("p1")),
    player("p2", "Bravo", 18, canonicalFor("p2")),
  ];

  const finalize = (overrides: Partial<Parameters<typeof checkFinalization>[0]> = {}) =>
    checkFinalization({
      ...standingsInput(readyPlayers()),
      tieBreak: TIE_BREAK,
      approvedBy: "organizer-1",
      ...overrides,
    });

  it("passes only when cards, net results, tie-break and authority are all in place", () => {
    const readiness = finalize();
    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  it("blocks while the required card count is unconfirmed", () => {
    const readiness = finalize({ policy: { ...TEST_POLICY, requiredCards: null } });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "required_cards_unconfirmed" })]),
    );
  });

  it("blocks while a conflict is unresolved", () => {
    const players = [
      player("p1", "Alpha", 0, canonicalWithConflict("p1")),
      player("p2", "Bravo", 18, canonicalFor("p2")),
    ];
    const readiness = finalize({ players });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "conflicts_unresolved", playerId: "p1" }),
      ]),
    );
  });

  it("blocks when a player has no valid net result", () => {
    const players = [
      player("p1", "Alpha", null, canonicalFor("p1")),
      player("p2", "Bravo", 18, canonicalFor("p2")),
    ];
    const readiness = finalize({ players });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "net_unavailable", playerId: "p1" }),
      ]),
    );
  });

  it("blocks without the organizer's tie-break rule", () => {
    const readiness = finalize({ tieBreak: null });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "tie_break_unconfirmed" })]),
    );
  });

  it("does not treat the proposed default tie-break as confirmed", () => {
    const readiness = finalize({ tieBreak: PROPOSED_SCORING_RULES.tieBreak });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "tie_break_unconfirmed" })]),
    );
  });

  it("blocks without an authorized staff member", () => {
    const readiness = finalize({ approvedBy: "" });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "not_authorized" })]),
    );
  });

  it("blocks a course from another round", () => {
    const readiness = finalize({ course: { ...COURSE, roundId: "round-2" } });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "round_mismatch" })]),
    );
  });

  it("blocks an empty round", () => {
    const readiness = finalize({ players: [] });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "no_players" })]),
    );
  });
});
