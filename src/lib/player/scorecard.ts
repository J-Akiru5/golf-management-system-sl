import type { Translate } from "@/lib/i18n/t";
import { stablefordPoints } from "@/lib/scoring/stableford";
import type { TeamFormat, TeamHoleInput, TeamPlayerHole } from "@/lib/scoring/team";
import type { PortalScorecard, PortalScorecardHole } from "./portal";

export interface ScorecardTotals {
  holes: number;
  /** Null when the range is incomplete or has a pick-up: the holes are not a stroke total. */
  grossStrokes: number | null;
  netStrokes: number | null;
  /** Null when the range is incomplete: a partial nine is not a points total. */
  grossPoints: number | null;
  netPoints: number | null;
}

/** One entry per hole on the card; a hole with no published score is null, never zero. */
export function scorecardRows(card: PortalScorecard): Array<PortalScorecardHole | null> {
  const byHole = new Map(card.holes.map((hole) => [hole.hole, hole]));
  return Array.from({ length: card.holesTotal }, (_, index) => byHole.get(index + 1) ?? null);
}

export function holesBetween(
  card: PortalScorecard,
  from: number,
  to: number,
): PortalScorecardHole[] {
  return card.holes.filter((hole) => hole.hole >= from && hole.hole <= to);
}

function sumIfComplete(values: readonly (number | null)[]): number | null {
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/** Subtotals for a nine or for the whole card. Missing values are not filled in with zero. */
export function totalsFor(card: PortalScorecard, from = 1, to = card.holesTotal): ScorecardTotals {
  const holes = holesBetween(card, from, to);
  const expected = Math.max(0, to - from + 1);
  const rangeComplete = holes.length === expected;
  // A pick-up has no stroke total but still counts as a hole and scores 0 points.
  const strokesKnown = rangeComplete && !holes.some((hole) => hole.pickedUp);
  return {
    holes: holes.length,
    grossStrokes: strokesKnown
      ? holes.reduce((total, hole) => total + (hole.grossStrokes ?? 0), 0)
      : null,
    netStrokes: strokesKnown ? sumIfComplete(holes.map((hole) => hole.netStrokes)) : null,
    grossPoints: rangeComplete ? holes.reduce((total, hole) => total + hole.grossPoints, 0) : null,
    netPoints: rangeComplete ? sumIfComplete(holes.map((hole) => hole.netPoints)) : null,
  };
}

/** "+1" for a stroke received, "-1" for a stroke given back, "-" for none. */
export function handicapStrokeLabel(strokes: number | null): string {
  if (strokes === null || strokes === 0) return "-";
  return strokes > 0 ? `+${strokes}` : String(strokes);
}

/** Relation to par for a nine or for the whole card. Counts the holes that have a score. */
export function relationToPar(
  card: PortalScorecard,
  from = 1,
  to = card.holesTotal,
): number | null {
  // Only a complete range is compared, and a hole the player picked up has no stroke count, so it
  // is left out of the comparison rather than counted as par. That matches the scoring rule: a
  // pick-up scores 0 and stays out of the stroke totals.
  const all = holesBetween(card, from, to);
  const expected = Math.max(0, to - from + 1);
  if (all.length === 0 || all.length !== expected) return null;
  const holes = all.filter((hole) => !hole.pickedUp);
  if (holes.length === 0) return null;
  return holes.reduce((total, hole) => total + (hole.grossStrokes - hole.par), 0);
}

/** "E" for level par, "+4" over, "-2" under, "-" when there is nothing to show. */
export function formatToPar(value: number | null): string {
  if (value === null) return "-";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : String(value);
}

/** The format name for the player view. Golf terms stay in English, as elsewhere. */
export function teamFormatLabel(t: Translate, format: TeamFormat): string {
  if (format === "four-ball") return t("player.scorecard.formatFourBall");
  if (format === "aggregate") return t("player.scorecard.formatAggregate");
  if (format === "scramble") return t("player.scorecard.formatScramble");
  return t("player.scorecard.formatIndividual");
}

export interface TeamView {
  /** True when the format is supported and its partner or shared card is present. */
  showTeam: boolean;
  /** True when the format needs a card that the published payload did not supply. */
  showPartnerNotPublished: boolean;
}

/** What the card should say about partner and team data, without rendering it. */
export function teamViewFor(
  format: TeamFormat,
  partner: PortalScorecard | null,
  shared: PortalScorecard | null,
): TeamView {
  if (format === "individual") {
    return { showTeam: false, showPartnerNotPublished: false };
  }
  const source = format === "scramble" ? shared : partner;
  return { showTeam: source !== null, showPartnerNotPublished: source === null };
}

/**
 * The rows a team format combines. Four-ball and aggregate need the caller's card and the partner
 * card. Scramble needs one shared team card. A missing row is left out, so the team engine names
 * the hole instead of reading a zero.
 */
export function teamHolesForFormat(
  format: TeamFormat,
  card: PortalScorecard,
  partner: PortalScorecard | null,
  shared: PortalScorecard | null,
): TeamHoleInput[] {
  if (format === "individual") return [];

  const playerRows = scorecardRows(card);
  const partnerRows = partner ? scorecardRows(partner) : [];
  const sharedRows = shared ? scorecardRows(shared) : [];

  return playerRows.map((playerHole, index) => {
    const hole = index + 1;
    const par = playerHole?.par ?? null;

    if (format === "scramble") {
      const sharedHole = sharedRows[index] ?? null;
      const players: TeamPlayerHole[] = sharedHole
        ? [
            {
              playerId: "team",
              grossStrokes: sharedHole.grossStrokes,
              netStrokes: sharedHole.netStrokes,
            },
          ]
        : [];
      return { hole, par, players };
    }

    const players: TeamPlayerHole[] = [];
    if (playerHole) {
      players.push({
        playerId: "you",
        grossStrokes: playerHole.grossStrokes,
        netStrokes: playerHole.netStrokes,
      });
    }
    const partnerHole = partnerRows[index] ?? null;
    if (partnerHole) {
      players.push({
        playerId: "partner",
        grossStrokes: partnerHole.grossStrokes,
        netStrokes: partnerHole.netStrokes,
      });
    }
    return { hole, par, players };
  });
}

/**
 * The unsaved preview card. A valid gross edit recalculates that hole's net and points, then the
 * card totals. An invalid edit is ignored, so a blank input never becomes a score of zero.
 */
export function withGrossEdits(
  card: PortalScorecard,
  edits: Readonly<Record<number, number>>,
): PortalScorecard {
  let changed = false;
  const holes = card.holes.map((hole) => {
    // An X is not a stroke score. The preview must not turn a pick-up into one.
    if (hole.pickedUp) return hole;
    const next = edits[hole.hole];
    if (next === undefined || !Number.isInteger(next) || next < 1 || next === hole.grossStrokes) {
      return hole;
    }

    changed = true;
    const netStrokes = hole.handicapStrokes === null ? null : next - hole.handicapStrokes;
    return {
      ...hole,
      grossStrokes: next,
      netStrokes,
      grossPoints: stablefordPoints(hole.par, next),
      netPoints: netStrokes === null ? null : stablefordPoints(hole.par, netStrokes),
      pickedUp: false,
    };
  });

  if (!changed) return card;

  return {
    ...card,
    holes,
    grossStrokes: holes.reduce((total, hole) => total + hole.grossStrokes, 0),
    grossPoints: holes.reduce((total, hole) => total + hole.grossPoints, 0),
    netStrokes: sumIfComplete(holes.map((hole) => hole.netStrokes)),
    netPoints: sumIfComplete(holes.map((hole) => hole.netPoints)),
  };
}
