import type { DrawGroup } from "./validate";

/**
 * Hand edits of who is in which group: swap two players, move a set of players into one group, and
 * exchange two sets of players between their groups. Every edit works on a copy of the draw and
 * returns the new draw, or a plain reason it cannot be done, the same way `group-slots.ts` does.
 *
 * A group whose players changed is locked, so a re-run of the draw keeps the desk's decision. These
 * are hand edits, so a lock does not refuse one: the desk locked a group to keep a re-run from
 * moving it, and the desk is still the one editing the board. The group size is always a parameter,
 * never a constant here, because it is a tournament setting.
 */

export type PlayerMove =
  | { ok: true; draw: DrawGroup[]; note: string }
  | { ok: false; reason: string };

const refuse = (reason: string): PlayerMove => ({ ok: false, reason });
const copyOf = (draw: readonly DrawGroup[]): DrawGroup[] =>
  draw.map((g) => ({ ...g, playerIds: [...g.playerIds] }));
const groupHolding = (draw: readonly DrawGroup[], playerId: string) =>
  draw.find((g) => g.playerIds.includes(playerId));

/** "3" or "3 and 5" or "3, 5 and 7", for the note read back to the organizer. */
const listOf = (numbers: readonly number[]): string => {
  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  if (unique.length <= 1) return String(unique[0] ?? "");
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
};

const swapped = (n: number): string => `${n} player${n === 1 ? "" : "s"}`;

/**
 * Puts `incoming` into `target` and takes each of them out of the group holding them, keeping the
 * order of the rows already in the target. Returns the groups whose players changed.
 */
function settle(draw: DrawGroup[], target: DrawGroup, incoming: readonly string[]): Set<DrawGroup> {
  const touched = new Set<DrawGroup>();
  for (const id of incoming) {
    const from = groupHolding(draw, id);
    if (!from || from === target) continue;
    from.playerIds = from.playerIds.filter((other) => other !== id);
    target.playerIds.push(id);
    touched.add(from);
  }
  if (touched.size > 0) touched.add(target);
  for (const group of touched) group.locked = true;
  return touched;
}

/**
 * Exchanges two players, keeping each one's place in the row order of the group they join. Both
 * groups end up locked. Refused when the ids are the same, when either player is not on the board,
 * or when both are already in one group (a swap would change nothing).
 */
export function swapPlayers(draw: readonly DrawGroup[], a: string, b: string): PlayerMove {
  if (a === b) return refuse("Pick two different players.");
  const next = copyOf(draw);
  const groupA = groupHolding(next, a);
  const groupB = groupHolding(next, b);
  if (!groupA || !groupB) return refuse("One of those players is not on the board.");
  if (groupA.number === groupB.number) {
    return refuse(`Both players are in group ${groupA.number}, so there is nothing to swap.`);
  }
  const atA = groupA.playerIds.indexOf(a);
  const atB = groupB.playerIds.indexOf(b);
  groupA.playerIds[atA] = b;
  groupB.playerIds[atB] = a;
  groupA.locked = true;
  groupB.locked = true;
  return {
    ok: true,
    draw: next,
    note: `Swapped one player between group ${groupA.number} and group ${groupB.number}.`,
  };
}

/**
 * Moves several players into one group. Refused when a group number or a player is unknown, when no
 * player is named, or when the group would then hold more than `groupSize`. A player already in the
 * target group is left where they are and is not counted twice. Every group the set left is locked
 * as well as the target.
 */
export function moveSet(
  draw: readonly DrawGroup[],
  playerIds: readonly string[],
  toGroup: number,
  groupSize: number,
): PlayerMove {
  if (playerIds.length === 0) return refuse("Pick at least one player.");
  const next = copyOf(draw);
  const target = next.find((g) => g.number === toGroup);
  if (!target) return refuse(`Group ${toGroup} is not in the draw.`);

  const incoming: string[] = [];
  for (const id of new Set(playerIds)) {
    const from = groupHolding(next, id);
    if (!from) return refuse("One of those players is not on the board.");
    if (from !== target) incoming.push(id);
  }
  if (incoming.length === 0) {
    return { ok: true, draw: next, note: `Group ${toGroup} already holds them.` };
  }

  const total = target.playerIds.length + incoming.length;
  if (total > groupSize) {
    return refuse(`Group ${toGroup} would hold ${total} players and the limit is ${groupSize}.`);
  }

  settle(next, target, incoming);
  return {
    ok: true,
    draw: next,
    note: `Moved ${swapped(incoming.length)} to group ${toGroup}.`,
  };
}

/**
 * Exchanges two sets of players, one for one in the order given: the first player of each set trade
 * groups, then the second, and so on. That keeps every group the same size, so a full group can take
 * part. Refused when the sets are different sizes, empty, hold a duplicate, overlap, or when a pair
 * sits in one group already (there is nothing to exchange). Every group involved is locked.
 */
export function swapSets(
  draw: readonly DrawGroup[],
  setA: readonly string[],
  setB: readonly string[],
): PlayerMove {
  if (setA.length === 0 || setB.length === 0) {
    return refuse("Pick at least one player on each side.");
  }
  if (setA.length !== setB.length) {
    return refuse(
      `Both sides must hold the same number of players (${setA.length} and ${setB.length}).`,
    );
  }
  const left = [...new Set(setA)];
  const right = [...new Set(setB)];
  if (left.length !== setA.length || right.length !== setB.length) {
    return refuse("A player is listed twice.");
  }
  if (left.some((id) => right.includes(id))) {
    return refuse("A player cannot be on both sides.");
  }
  const next = copyOf(draw);
  const ready: { a: DrawGroup; b: DrawGroup }[] = [];
  for (let i = 0; i < left.length; i += 1) {
    const idA = left[i];
    const idB = right[i];
    if (idA === undefined || idB === undefined) continue;
    const groupA = groupHolding(next, idA);
    const groupB = groupHolding(next, idB);
    if (!groupA || !groupB) return refuse("One of those players is not on the board.");
    if (groupA.number === groupB.number) {
      return refuse(`A swap needs two different groups; group ${groupA.number} holds both.`);
    }
    ready.push({ a: groupA, b: groupB });
  }

  const touched: number[] = [];
  for (let i = 0; i < ready.length; i += 1) {
    const pair = ready[i];
    const idA = left[i];
    const idB = right[i];
    if (!pair || idA === undefined || idB === undefined) continue;
    const atA = pair.a.playerIds.indexOf(idA);
    const atB = pair.b.playerIds.indexOf(idB);
    pair.a.playerIds[atA] = idB;
    pair.b.playerIds[atB] = idA;
    pair.a.locked = true;
    pair.b.locked = true;
    touched.push(pair.a.number, pair.b.number);
  }
  return {
    ok: true,
    draw: next,
    note: `Swapped ${swapped(left.length)} between groups ${listOf(touched)}.`,
  };
}
