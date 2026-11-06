/**
 * The arithmetic behind the staff score sheet.
 *
 * A volunteer taps a number up or down; nothing is typed. These functions decide the bounds, the
 * card's progress, what the review step shows and who marks whose card. They never decide that a
 * missing value is a par: an unfilled hole is null until a finger fills it.
 */
import type { HoleDefinition } from "@/lib/scoring";

export const MIN_STROKES = 1;
export const MAX_STROKES = 20;

/** A hole's score as the sheet holds it: a whole number, or null while it is blank. */
export type HoleScores = Record<number, number | null>;

export function clampStrokes(value: number): number {
  if (!Number.isFinite(value)) return MIN_STROKES;
  return Math.min(MAX_STROKES, Math.max(MIN_STROKES, Math.round(value)));
}

export function blankScores(holes: readonly HoleDefinition[]): HoleScores {
  return Object.fromEntries(holes.map((hole) => [hole.number, null]));
}

export function filledCount(holes: readonly HoleDefinition[], scores: HoleScores): number {
  return holes.filter((hole) => typeof scores[hole.number] === "number").length;
}

/** What a card holds so far, and what it is against par. Null total when nothing is filled. */
export interface CardProgress {
  filled: number;
  total: number;
  par: number;
  /** Strokes over or under par for the filled holes only. */
  toPar: number;
}

export function cardProgress(holes: readonly HoleDefinition[], scores: HoleScores): CardProgress {
  let filled = 0;
  let total = 0;
  let par = 0;
  for (const hole of holes) {
    const value = scores[hole.number];
    if (typeof value !== "number") continue;
    filled += 1;
    total += value;
    par += hole.par;
  }
  return { filled, total, par, toPar: total - par };
}

/** The next hole that still needs a score after `from`, wrapping once; null when all are filled. */
export function nextBlankHole(
  holes: readonly HoleDefinition[],
  scores: HoleScores,
  from: number,
): number | null {
  if (holes.length === 0) return null;
  const start = Math.max(
    0,
    holes.findIndex((hole) => hole.number === from),
  );
  for (let step = 1; step <= holes.length; step += 1) {
    const hole = holes[(start + step) % holes.length];
    if (!hole) continue;
    if (typeof scores[hole.number] !== "number") return hole.number;
  }
  return null;
}

/** The card's state for the group list. A submitted card is never editable here. */
export type StaffCardState = "none" | "started" | "ready" | "in";

export function cardState(
  holes: readonly HoleDefinition[],
  scores: HoleScores,
  submitted: boolean,
): StaffCardState {
  if (submitted) return "in";
  const filled = filledCount(holes, scores);
  if (filled === 0) return "none";
  return filled === holes.length ? "ready" : "started";
}

export function stateLabel(state: StaffCardState): string {
  switch (state) {
    case "in":
      return "In";
    case "ready":
      return "Ready";
    case "started":
      return "Started";
    default:
      return "Not started";
  }
}

export interface ReviewRow {
  playerId: string;
  playerName: string;
  filled: number;
  total: number;
  toPar: number;
  complete: boolean;
  errors: string[];
}

/** What the review step shows before a card is submitted, one row per player. */
export function reviewRows(
  holes: readonly HoleDefinition[],
  players: readonly { playerId: string; playerName: string }[],
  scoresByPlayer: Readonly<Record<string, HoleScores>>,
): ReviewRow[] {
  return players.map((player) => {
    const scores = scoresByPlayer[player.playerId] ?? {};
    const progress = cardProgress(holes, scores);
    const errors: string[] = [];
    if (progress.filled === 0) errors.push("No scores yet.");
    else if (progress.filled < holes.length) {
      const missing = holes.length - progress.filled;
      errors.push(`${missing} ${missing === 1 ? "hole" : "holes"} still blank.`);
    }
    return {
      playerId: player.playerId,
      playerName: player.playerName,
      filled: progress.filled,
      total: progress.total,
      toPar: progress.toPar,
      complete: progress.filled === holes.length,
      errors,
    };
  });
}

/**
 * Who marks whose card: each player marks the next, and the last marks the first. The scoring
 * engine's reciprocal rotation already states this rule, so the staff app calls it instead of
 * repeating it.
 */
export function markerFor(
  players: readonly { playerId: string }[],
  playerId: string,
): string | null {
  if (players.length < 2) return null;
  const index = players.findIndex((player) => player.playerId === playerId);
  if (index === -1) return null;
  return players[(index + 1) % players.length]?.playerId ?? null;
}
