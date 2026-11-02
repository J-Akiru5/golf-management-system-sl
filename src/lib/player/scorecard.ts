import type { PortalScorecard, PortalScorecardHole } from "./portal";

export interface ScorecardTotals {
  holes: number;
  grossStrokes: number;
  netStrokes: number | null;
  grossPoints: number;
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
  return {
    holes: holes.length,
    grossStrokes: holes.reduce((total, hole) => total + hole.grossStrokes, 0),
    netStrokes: holes.length === 0 ? null : sumIfComplete(holes.map((hole) => hole.netStrokes)),
    grossPoints: holes.reduce((total, hole) => total + hole.grossPoints, 0),
    netPoints: holes.length === 0 ? null : sumIfComplete(holes.map((hole) => hole.netPoints)),
  };
}

/** "+1" for a stroke received, "-1" for a stroke given back, "-" for none. */
export function handicapStrokeLabel(strokes: number | null): string {
  if (strokes === null || strokes === 0) return "-";
  return strokes > 0 ? `+${strokes}` : String(strokes);
}
