import type { Tee } from "@/lib/routing";
import type { Hole } from "./types";

/**
 * Where the course numbers on a printed sheet come from, as far as the desk can tell:
 *
 * - `missing`: no tees are saved, so no playing handicap can be worked out at all;
 * - `placeholder`: tees exist but nobody has confirmed them, with all 18 holes, against the club
 *   scorecard (the demo, or a first save of the starter numbers). Sheets carry a watermark, because
 *   the playing handicaps on them rest on numbers nobody has checked;
 * - `official`: an owner or organizer confirmed the tees and every hole value.
 *
 * The status is derived, never typed in: a confirmed flag on its own is not enough if a hole is
 * still blank, because a card with blank par and stroke index must not look official.
 */
export type CourseDataStatus = "official" | "placeholder" | "missing";

export const HOLES_ON_A_CARD = 18;

/** 18 empty rows, so a card can be typed in from nothing without inventing a par. */
export function blankHoles(courseId: string): Hole[] {
  return Array.from({ length: HOLES_ON_A_CARD }, (_, i) => ({
    id: `${courseId}-${i + 1}`,
    courseId,
    number: i + 1,
    par: null,
    strokeIndex: null,
  }));
}

/** The par of the holes that have one. A blank card reads 0 until a par is entered. */
export function cardPar(holes: readonly Hole[]): number {
  return holes.reduce((sum, hole) => sum + (hole.par ?? 0), 0);
}

/** A par outside 3 to 6 is not a hole; the database check refuses it too. */
export function parProblem(holes: readonly Hole[]): string | null {
  for (const hole of holes) {
    if (hole.par !== null && (hole.par < 3 || hole.par > 6)) {
      return `Hole ${hole.number} has par ${hole.par}; a hole is par 3 to 6.`;
    }
  }
  return null;
}

/**
 * Tees whose stored par differs from the card's total. The Course Handicap formula subtracts the
 * tee's par, so a tee that disagrees with the card produces a different handicap from the same card.
 */
export function teeParMismatches(tees: readonly Tee[], par: number): Tee[] {
  return tees.filter((tee) => tee.par !== par);
}

/** Whether every hole of an 18-hole card has both a par and a stroke index. */
export function holesComplete(holes: readonly Hole[]): boolean {
  const numbers = new Set(holes.map((h) => h.number));
  return (
    holes.length === HOLES_ON_A_CARD &&
    numbers.size === HOLES_ON_A_CARD &&
    holes.every((h) => h.par !== null && h.strokeIndex !== null)
  );
}

/**
 * Whether the numbers a confirmation vouches for have changed. Editing a rating or a hole after
 * the organizer confirmed it against the scorecard withdraws the confirmation: the card on screen
 * is no longer the card that was checked.
 */
export function courseNumbersChanged(
  before: { tees: readonly Tee[]; holes: readonly Hole[] },
  after: { tees: readonly Tee[]; holes: readonly Hole[] },
): boolean {
  const teeKey = (t: Tee) => `${t.name}|${t.courseRating}|${t.slope}|${t.par}`;
  const holeKey = (h: Hole) => `${h.number}|${h.par}|${h.strokeIndex}`;
  const sorted = <T>(xs: readonly T[], key: (x: T) => string) => xs.map(key).sort().join(";");
  return (
    sorted(before.tees, teeKey) !== sorted(after.tees, teeKey) ||
    sorted(before.holes, holeKey) !== sorted(after.holes, holeKey)
  );
}

/** Stroke index must be 1 to 18, each used once, or the dots on a card are meaningless. */
export function strokeIndexProblem(holes: readonly Hole[]): string | null {
  const used = new Map<number, number>();
  for (const h of holes) {
    if (h.strokeIndex === null) continue;
    if (h.strokeIndex < 1 || h.strokeIndex > HOLES_ON_A_CARD) {
      return `Stroke index ${h.strokeIndex} on hole ${h.number} is outside 1 to ${HOLES_ON_A_CARD}.`;
    }
    const other = used.get(h.strokeIndex);
    if (other !== undefined) {
      return `Stroke index ${h.strokeIndex} is used on holes ${other} and ${h.number}.`;
    }
    used.set(h.strokeIndex, h.number);
  }
  return null;
}

export function courseDataStatus(input: {
  confirmed: boolean;
  tees: readonly Tee[];
  holes: readonly Hole[];
}): CourseDataStatus {
  const { confirmed, tees, holes } = input;
  if (tees.length === 0) return "missing";
  if (confirmed && holesComplete(holes)) return "official";
  return "placeholder";
}
