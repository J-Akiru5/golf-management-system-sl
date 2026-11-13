import type { ManualOverride } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";

/**
 * The undo stack behind "Undo last change" on the pairings board.
 *
 * A snapshot is the board as it was **before** one edit: the groups and the overrides that edit was
 * about to change. "Undo last change" puts the newest snapshot back as a new board edit, so the
 * database records it like any other change and players see it through the normal publish path.
 *
 * Pure: no storage, no React, no clock. The store keeps one stack in memory, so it belongs to the
 * tab and is gone when the page reloads.
 */

/** How many snapshots the stack keeps. Older ones are dropped, oldest first. */
export const BOARD_HISTORY_CAP = 20;

/** Which board a snapshot belongs to. Undo never crosses to another event or another playing day. */
export interface BoardOwner {
  tournamentId: string;
  dayNumber: number | null;
}

/** One board, kept so an edit can be taken back. */
export interface BoardSnapshot extends BoardOwner {
  draw: DrawGroup[];
  overrides: ManualOverride[];
}

/** Oldest first, so the newest snapshot is the last entry. */
export type BoardHistory = readonly BoardSnapshot[];

/** True when both owners name the same board. */
export function sameBoard(a: BoardOwner, b: BoardOwner): boolean {
  return a.tournamentId === b.tournamentId && a.dayNumber === b.dayNumber;
}

/**
 * Adds a snapshot and drops the oldest ones past the cap. The input is not changed, so a caller can
 * hold the old stack until the new one is confirmed.
 */
export function pushSnapshot(history: BoardHistory, snapshot: BoardSnapshot): BoardSnapshot[] {
  const next = [...history, snapshot];
  return next.length > BOARD_HISTORY_CAP ? next.slice(next.length - BOARD_HISTORY_CAP) : next;
}

/**
 * Takes the newest snapshot for one board and returns the rest.
 *
 * A stack can hold edits from another playing day or another event, because the desk keeps working
 * after a day switch. Undo only ever takes back the board on screen, so those entries stay for
 * when that board comes back.
 */
export function takeSnapshot(
  history: BoardHistory,
  owner: BoardOwner,
): { snapshot: BoardSnapshot | null; history: BoardSnapshot[] } {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const snapshot = history[i];
    if (!snapshot || !sameBoard(snapshot, owner)) continue;
    return {
      snapshot,
      history: [...history.slice(0, i), ...history.slice(i + 1)],
    };
  }
  return { snapshot: null, history: [...history] };
}

/** Whether this board has anything to take back. */
export function undoAvailable(history: BoardHistory, owner: BoardOwner): boolean {
  return history.some((snapshot) => sameBoard(snapshot, owner));
}
