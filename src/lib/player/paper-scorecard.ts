import type { PortalScorecard, PortalScorecardHole } from "./portal";
import { scorecardRows } from "./scorecard";

/**
 * The numbers behind the paper-style scorecard. Everything here is pure: the component only lays
 * the values out. A hole the player picked up has no stroke count, so it adds no strokes but still
 * carries its points. A hole with no published score is null, never a zero.
 */

export type PaperNineLabel = "OUT" | "IN";

export interface PaperNineTotals {
  /** Sum of the nine's pars. */
  par: number;
  /** Holes with a stroke count. A pickup has none, so it is not counted here. */
  played: number;
  /** Sum of gross strokes. A pickup adds nothing. */
  strokes: number;
  /** Null when no hole on the nine has net points, as on a round without a handicap. */
  netPoints: number | null;
  grossPoints: number;
}

export interface PaperNine {
  /** OUT for holes 1 to 9, IN for holes 10 to 18. */
  label: PaperNineLabel;
  /** Hole number the nine starts on: 1 for OUT, 10 for IN. */
  from: number;
  /** One entry per hole in hole order. A hole with no score is null. */
  holes: Array<PortalScorecardHole | null>;
  totals: PaperNineTotals;
}

export interface PaperFooter {
  /** Sum of gross strokes over the card, pickups left out. */
  strokes: number;
  /** "78", or "74 (+2 pickups)" when the card has pickups. */
  strokesText: string;
  /** "18/18" for a full card, "5/9" for a nine-hole card. */
  playedLabel: string;
  /** Null when the card has no handicap snapshot. */
  netPoints: number | null;
  grossPoints: number;
}

/** Subtotals for one nine, or for any hole range the caller asks for. */
export function paperNineTotals(card: PortalScorecard, from: number, to: number): PaperNineTotals {
  const holes = card.holes.filter((hole) => hole.hole >= from && hole.hole <= to);
  const withStrokes = holes.filter((hole) => !hole.pickedUp);

  return {
    par: holes.reduce((total, hole) => total + hole.par, 0),
    played: withStrokes.length,
    strokes: withStrokes.reduce((total, hole) => total + hole.grossStrokes, 0),
    netPoints: holes.some((hole) => hole.netPoints !== null)
      ? holes.reduce((total, hole) => total + (hole.netPoints ?? 0), 0)
      : null,
    grossPoints: holes.reduce((total, hole) => total + hole.grossPoints, 0),
  };
}

/** One nine for a nine-hole card, both nines for an 18-hole card. */
export function paperNines(card: PortalScorecard): PaperNine[] {
  const rows = scorecardRows(card);
  const frontTo = Math.min(9, card.holesTotal);
  const nines: PaperNine[] = [
    {
      label: "OUT",
      from: 1,
      holes: rows.slice(0, frontTo),
      totals: paperNineTotals(card, 1, frontTo),
    },
  ];

  if (card.holesTotal > 9) {
    nines.push({
      label: "IN",
      from: 10,
      holes: rows.slice(9),
      totals: paperNineTotals(card, 10, card.holesTotal),
    });
  }

  return nines;
}

/** Par for the whole card, used by the TOT column after the second nine. */
export function paperParTotal(card: PortalScorecard): number {
  return card.holes.reduce((total, hole) => total + hole.par, 0);
}

/** What the Score row shows: "X" for a pickup, the stroke count, or "-" for a missing hole. */
export function paperScoreText(hole: PortalScorecardHole | null): string {
  if (!hole) return "-";
  if (hole.pickedUp) return "X";
  return String(hole.grossStrokes);
}

/** A points cell. An unknown net score shows "-" rather than a zero. */
export function paperPointsText(points: number | null): string {
  return points === null ? "-" : String(points);
}

/**
 * The figures under the tables: strokes, holes with a score, net and gross Stableford.
 * Pickups are named in the stroke figure, because the stroke total leaves them out.
 */
export function paperFooter(card: PortalScorecard): PaperFooter {
  const totals = paperNineTotals(card, 1, card.holesTotal);
  const pickups = card.pickups ?? card.holes.filter((hole) => hole.pickedUp).length;

  return {
    strokes: totals.strokes,
    strokesText:
      pickups > 0
        ? `${totals.strokes} (+${pickups} ${pickups === 1 ? "pickup" : "pickups"})`
        : String(totals.strokes),
    playedLabel: `${card.holesCounted}/${card.holesTotal}`,
    netPoints: totals.netPoints,
    grossPoints: totals.grossPoints,
  };
}
