import type { DrawGroup } from "./validate";

/**
 * Manual control over where a group starts (issue 195). Every edit works on a copy of the draw and
 * returns the new draw, or a plain reason it cannot be done. An edited group is locked, so a re-run
 * of the draw keeps it where the organizer put it.
 *
 * A group's slot is its time, start hole and wave label together. The group's number, players and
 * flight always stay with the group.
 */

export type SlotEdit =
  | { ok: true; draw: DrawGroup[]; note: string }
  | { ok: false; reason: string };

const refuse = (reason: string): SlotEdit => ({ ok: false, reason });
const copyOf = (draw: readonly DrawGroup[]): DrawGroup[] => draw.map((g) => ({ ...g }));
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Swaps the start (time and hole) of two groups. Group numbers and players stay with their groups.
 * Both groups end up locked. Refused when a group number is unknown or both numbers are the same.
 */
export function swapGroupSlots(draw: readonly DrawGroup[], a: number, b: number): SlotEdit {
  if (a === b) return refuse("Pick two different groups.");
  const next = copyOf(draw);
  const first = next.find((g) => g.number === a);
  if (!first) return refuse(`Group ${a} is not in the draw.`);
  const second = next.find((g) => g.number === b);
  if (!second) return refuse(`Group ${b} is not in the draw.`);

  const slot = { time: first.time, startHole: first.startHole, wave: first.wave };
  first.time = second.time;
  first.startHole = second.startHole;
  first.wave = second.wave;
  second.time = slot.time;
  second.startHole = slot.startHole;
  second.wave = slot.wave;
  first.locked = true;
  second.locked = true;
  return { ok: true, draw: next, note: `Group ${a} and group ${b} swapped starts.` };
}

/**
 * Moves a group to another hole at the same start time. If another group already starts on that hole
 * at that time, the two swap holes. The moved group is locked, and so is a group it swapped with.
 * Refused when the group number is unknown, or the hole is not a whole number from 1 to `holes`.
 * Moving a group to the hole it is already on is allowed and changes nothing except locking it.
 */
export function moveGroupToHole(
  draw: readonly DrawGroup[],
  groupNumber: number,
  hole: number,
  holes: number,
): SlotEdit {
  const next = copyOf(draw);
  const moved = next.find((g) => g.number === groupNumber);
  if (!moved) return refuse(`Group ${groupNumber} is not in the draw.`);
  if (!Number.isInteger(hole) || hole < 1 || hole > holes) {
    return refuse(`Hole must be a whole number from 1 to ${holes}.`);
  }

  if (moved.startHole === hole) {
    moved.locked = true;
    return {
      ok: true,
      draw: next,
      note: `Group ${groupNumber} is already on hole ${hole} and is now locked.`,
    };
  }

  // Only a group at the same start time can be in the way: another start is another wave.
  const occupant = next.find(
    (g) => g.number !== groupNumber && g.time === moved.time && g.startHole === hole,
  );
  const from = moved.startHole;
  moved.startHole = hole;
  moved.locked = true;
  if (occupant) {
    occupant.startHole = from;
    occupant.locked = true;
    return {
      ok: true,
      draw: next,
      note: `Group ${groupNumber} moved to hole ${hole}; group ${occupant.number} took hole ${from}.`,
    };
  }
  return { ok: true, draw: next, note: `Group ${groupNumber} moved to hole ${hole}.` };
}

/**
 * Reorders the queue on one hole. `orderedGroupNumbers` lists exactly the groups that start on that
 * hole, in the order they should go out. The hole's start times are kept in ascending order and
 * handed to the groups in the new order, so the first group listed gets the earliest time. Every
 * group on the hole ends up locked. Refused when the list is not exactly the groups on that hole.
 */
export function reorderHoleQueue(
  draw: readonly DrawGroup[],
  hole: number,
  orderedGroupNumbers: readonly number[],
): SlotEdit {
  const next = copyOf(draw);
  const onHole = next.filter((g) => g.startHole === hole);
  const wanted = new Set(orderedGroupNumbers);
  const exact =
    wanted.size === orderedGroupNumbers.length &&
    orderedGroupNumbers.length === onHole.length &&
    onHole.every((g) => wanted.has(g.number));
  if (!exact) return refuse(`The list must name exactly the groups on hole ${hole}.`);

  // The slots (time with its wave label) in start order, handed out in the order requested.
  const slots = onHole
    .map((g) => ({ time: g.time, wave: g.wave }))
    .sort((x, y) => compare(x.time, y.time));
  orderedGroupNumbers.forEach((number, index) => {
    const target = onHole.find((g) => g.number === number);
    const slot = slots[index];
    if (!target || !slot) return;
    target.time = slot.time;
    target.wave = slot.wave;
    target.locked = true;
  });
  return { ok: true, draw: next, note: `Hole ${hole} queue reordered.` };
}
