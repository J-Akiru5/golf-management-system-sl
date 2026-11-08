import type { DrawGroup } from "./validate";

/**
 * Manual control over where a group starts (issue 195). Every edit works on a copy of the draw and
 * returns the new draw, or a plain reason it cannot be done. An edited group is locked, so a re-run
 * of the draw keeps it where the organizer put it.
 */

export type SlotEdit =
  | { ok: true; draw: DrawGroup[]; note: string }
  | { ok: false; reason: string };

/**
 * Swaps the start (time and hole) of two groups. Group numbers and players stay with their groups.
 * Both groups end up locked. Refused when a group number is unknown or both numbers are the same.
 */
export function swapGroupSlots(_draw: readonly DrawGroup[], _a: number, _b: number): SlotEdit {
  throw new Error("swapGroupSlots is not implemented yet");
}

/**
 * Moves a group to another hole at the same start time. If another group already starts on that hole
 * at that time, the two swap holes. The moved group is locked, and so is a group it swapped with.
 * Refused when the group number is unknown, or the hole is not a whole number from 1 to `holes`.
 * Moving a group to the hole it is already on is allowed and changes nothing except locking it.
 */
export function moveGroupToHole(
  _draw: readonly DrawGroup[],
  _groupNumber: number,
  _hole: number,
  _holes: number,
): SlotEdit {
  throw new Error("moveGroupToHole is not implemented yet");
}

/**
 * Reorders the queue on one hole. `orderedGroupNumbers` lists exactly the groups that start on that
 * hole, in the order they should go out. The hole's start times are kept in ascending order and
 * handed to the groups in the new order, so the first group listed gets the earliest time. Every
 * group on the hole ends up locked. Refused when the list is not exactly the groups on that hole.
 */
export function reorderHoleQueue(
  _draw: readonly DrawGroup[],
  _hole: number,
  _orderedGroupNumbers: readonly number[],
): SlotEdit {
  throw new Error("reorderHoleQueue is not implemented yet");
}
