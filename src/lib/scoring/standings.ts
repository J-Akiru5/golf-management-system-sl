import { scoreRound } from "./stableford";
import type {
  CanonicalHole,
  FinalizationBlocker,
  FinalizationInput,
  FinalizationReadiness,
  NetExclusion,
  PlayerRoundTotals,
  StandingsBoard,
  StandingsExclusion,
  StandingsInput,
  StandingsResult,
  StandingsRow,
  TieBreakPolicy,
} from "./types";
import {
  isIsoDate,
  isNonEmptyString,
  validateCourseSetup,
  validateVerificationPolicy,
} from "./validation";

type CountedHole = CanonicalHole & { strokes: number };

function countedHole(hole: CanonicalHole): hole is CountedHole {
  return (hole.status === "verified" || hole.status === "provisional") && hole.strokes !== null;
}

/**
 * Builds the provisional gross and net boards for one daily round.
 *
 * Only holes whose evidence meets the configured verification requirement are counted. A hole
 * that is pending or in conflict is excluded, not filled in. The result is never official, and
 * no winner is declared here: the tie-break procedure is a separate, organizer-supplied rule.
 */
export function buildStandings(input: StandingsInput): StandingsResult {
  const excluded: StandingsExclusion[] = [];
  const netExcluded: NetExclusion[] = [];
  const players: PlayerRoundTotals[] = [];

  const setupProblems = [
    ...(input.course.roundId !== input.roundId
      ? ["The course belongs to a different daily round."]
      : []),
    ...validateCourseSetup(input.course).map((problem) => problem.message),
    ...validateVerificationPolicy(input.policy).map((problem) => problem.message),
  ];

  // Fail closed: no board is better than a board calculated from a broken round.
  if (setupProblems.length > 0) {
    return {
      roundId: input.roundId,
      official: false,
      players: [],
      gross: { kind: "gross", rows: [] },
      net: { kind: "net", rows: [] },
      excluded: input.players.map((player) => ({
        registrationId: player.registrationId,
        playerId: player.playerId,
        playerName: player.playerName,
        reason: "scoring_failed",
        detail: setupProblems.join(" "),
      })),
      netExcluded: [],
    };
  }

  for (const player of input.players) {
    if (
      player.canonical.roundId !== input.roundId ||
      player.canonical.playerId !== player.playerId
    ) {
      excluded.push({
        registrationId: player.registrationId,
        playerId: player.playerId,
        playerName: player.playerName,
        reason: "wrong_round",
        detail: "The canonical round does not match this player and daily round.",
      });
      continue;
    }

    const holes = player.canonical.holes.filter(countedHole);
    if (holes.length === 0) {
      excluded.push({
        registrationId: player.registrationId,
        playerId: player.playerId,
        playerName: player.playerName,
        reason: "no_eligible_holes",
        detail: "No hole meets the verification requirement yet.",
      });
      continue;
    }

    const scored = scoreRound({
      course: input.course,
      scores: holes.map((hole) => ({ hole: hole.hole, grossStrokes: hole.strokes })),
      handicap: player.handicap,
      requireComplete: false,
    });

    if (!scored.ok) {
      excluded.push({
        registrationId: player.registrationId,
        playerId: player.playerId,
        playerName: player.playerName,
        reason: "scoring_failed",
        detail: scored.problems.map((problem) => problem.message).join(" "),
      });
      continue;
    }

    const totals: PlayerRoundTotals = {
      registrationId: player.registrationId,
      playerId: player.playerId,
      playerName: player.playerName,
      flightId: player.flightId,
      holesCounted: scored.result.holesCompleted,
      totalHoles: scored.result.totalHoles,
      grossStrokes: scored.result.grossStrokes,
      grossPoints: scored.result.grossPoints,
      netStrokes: scored.result.netStrokes,
      netPoints: scored.result.netPoints,
      netStatus: scored.result.netStatus,
      complete: player.canonical.complete,
      provisional: !player.canonical.complete || player.canonical.counts.provisional > 0,
    };

    players.push(totals);
    if (totals.netStatus === "unavailable") {
      netExcluded.push({
        playerId: player.playerId,
        playerName: player.playerName,
        reason: "handicap_unavailable",
      });
    }
  }

  return {
    roundId: input.roundId,
    official: false,
    players,
    gross: rankBoard("gross", players, (row) => row.grossPoints),
    net: rankBoard(
      "net",
      players.filter((row) => row.netPoints !== null),
      (row) => row.netPoints ?? 0,
    ),
    excluded,
    netExcluded,
  };
}

function rankBoard(
  kind: "gross" | "net",
  players: readonly PlayerRoundTotals[],
  pointsOf: (row: PlayerRoundTotals) => number,
): StandingsBoard {
  const sorted = [...players].sort(
    (a, b) =>
      pointsOf(b) - pointsOf(a) ||
      a.playerName.localeCompare(b.playerName) ||
      a.playerId.localeCompare(b.playerId),
  );

  let previousPoints: number | null = null;
  let position = 0;

  const rows: StandingsRow[] = sorted.map((row, index) => {
    const points = pointsOf(row);
    if (previousPoints === null || points !== previousPoints) {
      position = index + 1;
      previousPoints = points;
    }
    return { ...row, position, tied: false };
  });

  const perPosition = new Map<number, number>();
  for (const row of rows) {
    perPosition.set(row.position, (perPosition.get(row.position) ?? 0) + 1);
  }

  return {
    kind,
    rows: rows.map((row) => ({
      ...row,
      tied: (perPosition.get(row.position) ?? 0) > 1,
    })),
  };
}

/**
 * Checks whether the round may be finalized. It recomputes the boards from the same evidence,
 * so a caller cannot pass a finalization request whose totals disagree with its scores.
 *
 * The gate checks that the tie-break configuration exists, but it does not apply a tie-break
 * procedure. That procedure has to be implemented from the organizer's written rule.
 */
export function checkFinalization(input: FinalizationInput): FinalizationReadiness {
  const blockers: FinalizationBlocker[] = [];
  const standings = buildStandings(input);

  if (input.players.length === 0) {
    blockers.push({
      code: "no_players",
      playerId: null,
      hole: null,
      message: "The round has no players to finalize.",
    });
  }

  if (input.course.roundId !== input.roundId) {
    blockers.push({
      code: "round_mismatch",
      playerId: null,
      hole: null,
      message: "The course belongs to a different daily round.",
    });
  }

  const courseProblems = validateCourseSetup(input.course);
  if (courseProblems.length > 0) {
    blockers.push({
      code: "course_invalid",
      playerId: null,
      hole: null,
      message: courseProblems.map((problem) => problem.message).join(" "),
    });
  }

  const policyProblems = validateVerificationPolicy(input.policy);
  if (policyProblems.length > 0) {
    blockers.push({
      code: "policy_invalid",
      playerId: null,
      hole: null,
      message: policyProblems.map((problem) => problem.message).join(" "),
    });
  }

  if (input.policy.requiredCards === null) {
    blockers.push({
      code: "required_cards_unconfirmed",
      playerId: null,
      hole: null,
      message: "The required number of scorecards has not been confirmed for this event.",
    });
  }

  for (const player of input.players) {
    if (
      player.canonical.roundId !== input.roundId ||
      player.canonical.playerId !== player.playerId
    ) {
      blockers.push({
        code: "round_mismatch",
        playerId: player.playerId,
        hole: null,
        message: `${player.playerName}'s canonical card belongs to another daily round.`,
      });
      continue;
    }

    const conflicts = player.canonical.holes.filter((hole) => hole.status === "conflict");
    if (conflicts.length > 0) {
      blockers.push({
        code: "conflicts_unresolved",
        playerId: player.playerId,
        hole: null,
        message: `${player.playerName} has unresolved cards on hole${conflicts.length === 1 ? "" : "s"} ${conflicts
          .map((hole) => hole.hole)
          .join(", ")}.`,
      });
    } else if (!player.canonical.complete) {
      const outstanding = player.canonical.holes.filter((hole) => hole.status !== "verified");
      blockers.push({
        code: "round_incomplete",
        playerId: player.playerId,
        hole: null,
        message: `${player.playerName} has ${outstanding.length} hole${outstanding.length === 1 ? "" : "s"} that are not verified.`,
      });
    }

    const totals = standings.players.find((row) => row.playerId === player.playerId);
    if (!totals || totals.netStatus === "unavailable") {
      blockers.push({
        code: "net_unavailable",
        playerId: player.playerId,
        hole: null,
        message: `${player.playerName} has no valid net result, so official net standings cannot be produced.`,
      });
    }
  }

  if (!tieBreakIsComplete(input.tieBreak)) {
    blockers.push({
      code: "tie_break_unconfirmed",
      playerId: null,
      hole: null,
      message: "The organizer's written tie-break rule has not been supplied and confirmed.",
    });
  }

  if (!isNonEmptyString(input.approvedBy)) {
    blockers.push({
      code: "not_authorized",
      playerId: null,
      hole: null,
      message: "Finalization needs an authorized staff member.",
    });
  }

  return { ready: blockers.length === 0, blockers };
}

function tieBreakIsComplete(policy: TieBreakPolicy | null): boolean {
  if (!policy) return false;
  return (
    isNonEmptyString(policy.id) &&
    isNonEmptyString(policy.name) &&
    isNonEmptyString(policy.source) &&
    isNonEmptyString(policy.confirmedBy) &&
    isIsoDate(policy.confirmedAt.slice(0, 10))
  );
}
