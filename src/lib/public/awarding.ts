import type { PublicTeamStanding } from "@/lib/data/public-team-leaderboard";
import {
  type AwardingBoard,
  type AwardingBoardRow,
  BOARD_SIZE,
  REVEAL_LANES,
  type RevealLaneId,
} from "@/lib/public/results-reveal";

/**
 * The six awarding boards, as the desk builds and confirms them.
 *
 * The desk builds a board from the published team standings, looks at it, and only then releases the
 * lane. What the public page reads is that confirmed board, stored on the event row (see
 * `results-reveal.ts`), so the display never ranks anything and never decides a tie: it prints the
 * positions, the scores and the `T` marks the desk confirmed.
 *
 * A board is at most three rows, in lane order. A tie keeps both rows on the same position number
 * and both carry `tie`, the same rule the public leaderboard already uses for a pair's rank. When a
 * fourth team ties with the third, the third row is marked `tie` as well, so the desk sees the tie
 * it is confirming and decides whether the board is right before releasing the lane.
 *
 * Pure: no database, no clock, no React.
 */

const CLASS_LETTERS: Partial<Record<RevealLaneId, string>> = {
  classA: "a",
  classB: "b",
  classC: "c",
  classD: "d",
};

/**
 * The published column a lane is awarded on. The four class champions and the net overall board use
 * net points; the gross overall board uses gross points. Both are the published Stableford points,
 * never a recomputation here.
 */
export function laneScoreBasis(laneId: RevealLaneId): "net" | "gross" {
  return laneId === "grossOverall" ? "gross" : "net";
}

/** `Class A`, `class a` and `A` are one class. The category names come from the club's own setup. */
export function categoryIsClass(category: string, letter: string): boolean {
  const normal = category
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
  return normal === `class ${letter}` || normal === letter;
}

/** The class letter a lane awards, or null for the two overall lanes. */
export function laneClassLetter(laneId: RevealLaneId): string | null {
  return CLASS_LETTERS[laneId] ?? null;
}

/** The lane label the desk and the public page print. */
export function laneTitle(laneId: RevealLaneId): string {
  return REVEAL_LANES.find((lane) => lane.id === laneId)?.label ?? laneId;
}

const scoreOf = (team: PublicTeamStanding, basis: "net" | "gross"): number | null =>
  basis === "gross" ? team.grossPoints : team.netPoints;

/** Descending score, then the pair's own name, so the board is stable between renders. */
function byScore(basis: "net" | "gross") {
  return (a: PublicTeamStanding, b: PublicTeamStanding): number => {
    const left = scoreOf(a, basis);
    const right = scoreOf(b, basis);
    if (left !== right) {
      if (left === null) return 1;
      if (right === null) return -1;
      return right - left;
    }
    return a.name.localeCompare(b.name);
  };
}

/**
 * The top three of a class. The class is the flight the desk assigned (that is what the desk screens
 * and the public cards print as the class), and a team whose category is the class name is accepted
 * too, so a field where the two were set either way still lands on the right board.
 */
function inClass(team: PublicTeamStanding, letter: string): boolean {
  if (team.flightName && categoryIsClass(team.flightName, letter)) return true;
  return team.categories.some((category) => categoryIsClass(category, letter));
}

/**
 * The proposed board for one lane: the top three teams of that class, or of the whole field for the
 * two overall lanes, ranked on the lane's basis. Ties share a position and are marked.
 *
 * This is what the desk reviews and confirms. A team with no published score is not part of a board:
 * a champion is a result, not a default.
 */
export function buildAwardingBoard(
  teams: readonly PublicTeamStanding[],
  laneId: RevealLaneId,
): AwardingBoard {
  const basis = laneScoreBasis(laneId);
  const letter = laneClassLetter(laneId);
  const eligible = teams.filter((team) => {
    if (scoreOf(team, basis) === null) return false;
    if (!letter) return true;
    return inClass(team, letter);
  });

  const sorted = [...eligible].sort(byScore(basis));
  const rows: AwardingBoardRow[] = [];
  let position = 0;
  let previousScore: number | null = null;
  for (const [index, team] of sorted.entries()) {
    const score = scoreOf(team, basis);
    if (index === 0 || score !== previousScore) position += 1;
    const sharesWithPrevious = index > 0 && score === previousScore;
    const next = sorted[index + 1];
    const sharesWithNext = next !== undefined && scoreOf(next, basis) === score;
    rows.push({
      position,
      name: team.name,
      score,
      tie: sharesWithPrevious || sharesWithNext,
    });
    previousScore = score;
    if (rows.length === BOARD_SIZE) break;
  }
  return rows;
}

/** The six boards, in lane order, for the desk's one page. */
export function buildAwardingBoards(
  teams: readonly PublicTeamStanding[],
): Record<RevealLaneId, AwardingBoard> {
  return {
    classA: buildAwardingBoard(teams, "classA"),
    classB: buildAwardingBoard(teams, "classB"),
    classC: buildAwardingBoard(teams, "classC"),
    classD: buildAwardingBoard(teams, "classD"),
    netOverall: buildAwardingBoard(teams, "netOverall"),
    grossOverall: buildAwardingBoard(teams, "grossOverall"),
  };
}
