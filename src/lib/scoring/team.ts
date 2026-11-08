/**
 * Team scoring for the player card.
 *
 * The format and the score basis are inputs, never constants: a tournament has no team format
 * column yet, and the club has not confirmed whether a composite event counts gross or net. This
 * module therefore makes no assumption about either.
 *
 * A score is never invented. A hole whose inputs are incomplete is named in `incompleteHoles`, the
 * hole's team score is null, and the team total stays null until every hole can be combined. A
 * missing player or a missing net score is never read as zero.
 */

export type TeamFormat = "individual" | "four-ball" | "aggregate" | "scramble";

/** The formats that produce a team score. Individual is a valid event format with no team total. */
export type TeamCombinedFormat = Exclude<TeamFormat, "individual">;

export type TeamBasis = "gross" | "net";

export const TEAM_FORMATS: readonly TeamFormat[] = [
  "individual",
  "four-ball",
  "aggregate",
  "scramble",
];

export const TEAM_COMBINED_FORMATS: readonly TeamCombinedFormat[] = [
  "four-ball",
  "aggregate",
  "scramble",
];

export type TeamProblemCode =
  | "individual_has_no_team_total"
  | "unsupported_format"
  | "unsupported_basis"
  | "invalid_holes_total"
  | "invalid_hole"
  | "duplicate_hole"
  | "wrong_player_count"
  | "missing_score"
  | "missing_net_score"
  | "invalid_score";

export interface TeamProblem {
  code: TeamProblemCode;
  hole: number | null;
  message: string;
}

/** One player's score on one hole. For a scramble this is the single shared team score. */
export interface TeamPlayerHole {
  /** A stable id from the published payload. For a scramble this is the team id. */
  playerId: string;
  grossStrokes: number | null;
  netStrokes: number | null;
}

export interface TeamHoleInput {
  hole: number;
  /** Par is data, never a constant. Null when the caller does not have it. */
  par: number | null;
  /** Two players for four-ball and aggregate; one shared score for scramble. */
  players: readonly TeamPlayerHole[];
}

export interface TeamAggregationInput {
  /** A stored format string is accepted so an unknown value is reported, not thrown. */
  format: string;
  /** The number of holes in the round, so an absent hole is named rather than skipped. */
  holesTotal: number;
  holes: readonly TeamHoleInput[];
  /** Which score the team uses. Defaults to net, the usual basis for these formats. */
  basis?: TeamBasis;
}

export interface TeamHoleResult {
  hole: number;
  par: number | null;
  /** The combined score, or null when the inputs cannot produce one. */
  strokes: number | null;
  /** The players whose scores produced the team score. A tie names both players. */
  sourcePlayerIds: string[];
}

export interface TeamTotals {
  /** Holes that have a team score. */
  holes: number;
  totalHoles: number;
  /** Sum of the team scores, only when every hole in the range has one. */
  strokes: number | null;
  /** Sum of the pars of the scored holes. Null when any scored hole has no par. */
  par: number | null;
  /** Team strokes minus par, only when the range is complete and every hole has a par. */
  toPar: number | null;
}

export type TeamAggregation =
  | {
      ok: true;
      format: TeamCombinedFormat;
      basis: TeamBasis;
      holes: TeamHoleResult[];
      totals: TeamTotals;
      /** Holes that have no team score, in hole order. Empty when every hole is complete. */
      incompleteHoles: number[];
      warnings: TeamProblem[];
    }
  | {
      ok: false;
      /** The input format, even when it is not one this module supports. */
      format: string;
      problems: TeamProblem[];
      incompleteHoles: number[];
    };

export function isTeamFormat(value: unknown): value is TeamFormat {
  return typeof value === "string" && (TEAM_FORMATS as readonly string[]).includes(value);
}

export function isTeamCombinedFormat(value: unknown): value is TeamCombinedFormat {
  return typeof value === "string" && (TEAM_COMBINED_FORMATS as readonly string[]).includes(value);
}

/** Returns the stored format when it is one this module knows, otherwise null. */
export function teamFormatFromUnknown(value: unknown): TeamFormat | null {
  return isTeamFormat(value) ? value : null;
}

/** "Best ball" is the club's other name for four-ball; both name the same rule. */
const FORMAT_ALIASES: Readonly<Record<string, TeamCombinedFormat>> = {
  "best-ball": "four-ball",
};

const expectedPlayerCount = (format: TeamCombinedFormat): number => (format === "scramble" ? 1 : 2);

const isUsableScore = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value >= 1;

/**
 * Sums the team scores within a range. A nine or a whole card can be summarised from the same
 * per-hole results, so the view does not need a second aggregation rule.
 */
export function summarizeTeamHoles(
  holes: readonly TeamHoleResult[],
  totalHoles: number,
  from = 1,
  to = totalHoles,
): TeamTotals {
  const expected = Math.max(0, to - from + 1);
  const inRange = holes.filter((hole) => hole.hole >= from && hole.hole <= to);
  const scored = inRange.filter(
    (hole): hole is TeamHoleResult & { strokes: number } => hole.strokes !== null,
  );
  const complete = expected > 0 && inRange.length === expected && scored.length === expected;
  const strokes = complete ? scored.reduce((sum, hole) => sum + hole.strokes, 0) : null;
  const pars = scored.map((hole) => hole.par);
  const par =
    scored.length > 0 && pars.every((value): value is number => value !== null)
      ? pars.reduce((sum, value) => sum + value, 0)
      : null;
  const toPar = complete && strokes !== null && par !== null ? strokes - par : null;

  return { holes: scored.length, totalHoles: expected, strokes, par, toPar };
}

const completeHoles = (numbers: Iterable<number>): number[] =>
  [...new Set(numbers)].sort((a, b) => a - b);

/**
 * Combines the players' scores for one hole at a time.
 *
 * Four-ball takes the lower score of the two players. Aggregate sums both scores. Scramble reads
 * exactly one shared score and never multiplies it into a second player score. When the required
 * score is missing, the hole gets no team score and is named in `incompleteHoles`.
 */
export function aggregateTeam(input: TeamAggregationInput): TeamAggregation {
  if (input.format === "individual") {
    return {
      ok: false,
      format: input.format,
      problems: [
        {
          code: "individual_has_no_team_total",
          hole: null,
          message: "An individual event has no team total.",
        },
      ],
      incompleteHoles: [],
    };
  }

  const normalized = FORMAT_ALIASES[input.format] ?? input.format;
  if (!isTeamCombinedFormat(normalized)) {
    return {
      ok: false,
      format: input.format,
      problems: [
        {
          code: "unsupported_format",
          hole: null,
          message: `The team format "${input.format}" is not supported.`,
        },
      ],
      incompleteHoles: [],
    };
  }

  if (!Number.isInteger(input.holesTotal) || input.holesTotal < 1) {
    return {
      ok: false,
      format: input.format,
      problems: [
        {
          code: "invalid_holes_total",
          hole: null,
          message: "The round needs a positive whole number of holes.",
        },
      ],
      incompleteHoles: [],
    };
  }

  const basis = input.basis ?? "net";
  if (basis !== "gross" && basis !== "net") {
    return {
      ok: false,
      format: input.format,
      problems: [
        {
          code: "unsupported_basis",
          hole: null,
          message: `The team basis "${String(basis)}" is not supported.`,
        },
      ],
      incompleteHoles: [],
    };
  }

  const format = normalized;
  const byHole = new Map<number, TeamHoleInput>();
  const problems: TeamProblem[] = [];
  const incomplete = new Set<number>();
  const duplicated = new Set<number>();

  for (const hole of input.holes) {
    if (!Number.isInteger(hole.hole) || hole.hole < 1 || hole.hole > input.holesTotal) {
      problems.push({
        code: "invalid_hole",
        hole: hole.hole,
        message: `Hole ${hole.hole} is outside a ${input.holesTotal}-hole round.`,
      });
      continue;
    }
    if (byHole.has(hole.hole)) {
      problems.push({
        code: "duplicate_hole",
        hole: hole.hole,
        message: `Hole ${hole.hole} has more than one score entry.`,
      });
      duplicated.add(hole.hole);
      incomplete.add(hole.hole);
      continue;
    }
    byHole.set(hole.hole, hole);
  }

  const results: TeamHoleResult[] = [];
  const expected = expectedPlayerCount(format);

  for (let number = 1; number <= input.holesTotal; number += 1) {
    const hole = byHole.get(number);
    if (!hole || duplicated.has(number)) {
      if (!hole) {
        incomplete.add(number);
        problems.push({
          code: "missing_score",
          hole: number,
          message: `Hole ${number} has no score to combine.`,
        });
      }
      results.push({ hole: number, par: hole?.par ?? null, strokes: null, sourcePlayerIds: [] });
      continue;
    }

    if (hole.players.length !== expected) {
      incomplete.add(number);
      problems.push({
        code: "wrong_player_count",
        hole: number,
        message:
          format === "scramble"
            ? `Hole ${number} needs one shared team score; ${hole.players.length} were supplied.`
            : `Hole ${number} needs two player scores; ${hole.players.length} were supplied.`,
      });
      results.push({ hole: number, par: hole.par, strokes: null, sourcePlayerIds: [] });
      continue;
    }

    const scored: Array<{ playerId: string; strokes: number }> = [];
    let usable = true;

    for (const player of hole.players) {
      const value = basis === "net" ? player.netStrokes : player.grossStrokes;
      if (value === null) {
        usable = false;
        incomplete.add(number);
        problems.push({
          code: basis === "net" ? "missing_net_score" : "missing_score",
          hole: number,
          message:
            basis === "net"
              ? `Hole ${number} has no net score for ${player.playerId}; no team score is calculated.`
              : `Hole ${number} has no gross score for ${player.playerId}; no team score is calculated.`,
        });
        continue;
      }
      if (!isUsableScore(value)) {
        usable = false;
        incomplete.add(number);
        problems.push({
          code: "invalid_score",
          hole: number,
          message: `Hole ${number} has an invalid score for ${player.playerId}.`,
        });
        continue;
      }
      scored.push({ playerId: player.playerId, strokes: value });
    }

    if (!usable || scored.length !== expected) {
      results.push({ hole: number, par: hole.par, strokes: null, sourcePlayerIds: [] });
      continue;
    }

    if (format === "scramble") {
      const shared = scored[0];
      if (!shared) {
        results.push({ hole: number, par: hole.par, strokes: null, sourcePlayerIds: [] });
        continue;
      }
      results.push({
        hole: number,
        par: hole.par,
        strokes: shared.strokes,
        sourcePlayerIds: [shared.playerId],
      });
      continue;
    }

    if (format === "aggregate") {
      results.push({
        hole: number,
        par: hole.par,
        strokes: scored.reduce((sum, player) => sum + player.strokes, 0),
        sourcePlayerIds: scored.map((player) => player.playerId),
      });
      continue;
    }

    const lowest = Math.min(...scored.map((player) => player.strokes));
    results.push({
      hole: number,
      par: hole.par,
      strokes: lowest,
      sourcePlayerIds: scored
        .filter((player) => player.strokes === lowest)
        .map((player) => player.playerId),
    });
  }

  const incompleteHoles = completeHoles(incomplete);

  return {
    ok: true,
    format,
    basis,
    holes: results,
    totals: summarizeTeamHoles(results, input.holesTotal),
    incompleteHoles,
    warnings: problems,
  };
}
