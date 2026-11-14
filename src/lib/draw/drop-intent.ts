import type { Registration, TournamentConfig } from "@/lib/routing";
import { moveSet, swapPlayers } from "./player-moves";
import { type DrawGroup, dropCheck } from "./validate";

/**
 * What a dragged player means when released over one place on the board.
 *
 * This is the only new decision drag-and-drop adds. Every answer maps onto an action the desk
 * already has, so a drop cannot write anything the buttons could not write:
 *
 * - a player row is a swap, with `swapPlayers`'s own rules;
 * - a group with room is a move, with `dropCheck`'s own rules (locks and capacity);
 * - a full group is an offer to swap, which the desk then completes on a row;
 * - a player whose registered partner is in the same group and whose target has room for both is a
 *   move that may take the pair, using `moveSet`'s rules.
 *
 * The result is a plain description as well as a decision, so the board can say what a drop will do
 * before the organizer lets go. Nothing here reads or writes anything.
 */

/** Where a drag is hovering or was released: a group's own space, or one player's row. */
export type DropTarget = { kind: "group"; group: number } | { kind: "player"; playerId: string };

export type DropIntent =
  /** No player is being dragged. */
  | { kind: "none" }
  | {
      kind: "move";
      playerId: string;
      toGroup: number;
      label: string;
      /** A note about the move that is not a refusal, for example another flight. */
      note: string | null;
    }
  | {
      /**
       * The move is fine, and so is taking this player's registered partner along, because the
       * target has room for both. The desk chooses one on drop; nothing is written until then.
       */
      kind: "moveOrPair";
      playerId: string;
      partnerId: string;
      toGroup: number;
      label: string;
    }
  | { kind: "swap"; a: string; b: string; label: string }
  /** The group is full, so a drop there can only be a swap: the desk picks the row next. */
  | { kind: "pickSwap"; playerId: string; group: number; label: string }
  | { kind: "refused"; reason: string };

export interface DropInput {
  draw: DrawGroup[];
  config: TournamentConfig;
  regs: Map<string, Registration>;
  names: { flight: (id: string | null) => string };
  /** The player being dragged. */
  playerId: string;
  target: DropTarget;
  /** The other players of this player's registered pair or team who are on the board. */
  pairOf: (id: string) => readonly string[];
  /** The name shown to the organizer. */
  nameOf: (id: string) => string;
}

const refused = (reason: string): DropIntent => ({ kind: "refused", reason });

const holding = (draw: readonly DrawGroup[], playerId: string) =>
  draw.find((g) => g.playerIds.includes(playerId));

/**
 * The decision for one drop. `none` only happens when there is no player in hand; every other
 * answer either names the existing action to take or says why it cannot be taken.
 */
export function dropIntent(input: DropInput): DropIntent {
  const { draw, config, regs, names, playerId, target, nameOf } = input;
  const name = nameOf(playerId);
  const source = holding(draw, playerId);

  if (target.kind === "player") {
    const other = target.playerId;
    if (other === playerId) return refused("That is the same player.");
    // A swap takes one player out of a group, so a player who is not in a group cannot swap.
    if (!source) {
      return refused(
        `${name} is not in a group yet, so there is nothing to swap. Drop them on a group instead.`,
      );
    }
    // The swap action's own rules, so a drag and the Swap button can never disagree.
    const swap = swapPlayers(draw, playerId, other);
    if (!swap.ok) return refused(swap.reason);
    return {
      kind: "swap",
      a: playerId,
      b: other,
      label: `Swap ${name} with ${nameOf(other)}.`,
    };
  }

  const group = target.group;
  const destination = draw.find((g) => g.number === group);
  if (!destination) return refused(`Group ${group} is not on this board.`);
  if (source?.number === destination.number) {
    return refused(`Already in group ${destination.number}.`);
  }

  // A full group can only take a player by giving one back, which is a hand edit the Swap buttons
  // already make. So the drop offers the swap rather than refusing it.
  if (destination.playerIds.length >= config.groupSize) {
    return {
      kind: "pickSwap",
      playerId,
      group,
      label: `Group ${group} is full. Choose a player in it to swap with ${name}.`,
    };
  }

  // Locks, capacity and the flight note come from the same check the move action runs.
  const check = dropCheck(draw, config, regs, playerId, group, names);
  if (!check.ok) return refused(check.reason);
  const note = check.notes.length > 0 ? check.notes.join(" ") : null;

  // Taking the pair along is only offered when the partner is in this player's own group and the
  // target has room for both, and only when the set move the desk already has would accept it.
  const partner = source
    ? input.pairOf(playerId).find((id) => source.playerIds.includes(id))
    : null;
  if (partner && destination.playerIds.length + 2 <= config.groupSize) {
    const together = moveSet(draw, [playerId, partner], group, config.groupSize);
    if (together.ok) {
      return {
        kind: "moveOrPair",
        playerId,
        partnerId: partner,
        toGroup: group,
        label: `Move ${name} to group ${group}, or take the pair with ${nameOf(partner)}.`,
      };
    }
  }

  return { kind: "move", playerId, toGroup: group, label: `Move ${name} to group ${group}.`, note };
}

/** True when a drop of this intent would change the board, so the browser may accept it. */
export function acceptsDrop(intent: DropIntent | null): boolean {
  if (!intent) return false;
  return (
    intent.kind === "move" ||
    intent.kind === "moveOrPair" ||
    intent.kind === "swap" ||
    intent.kind === "pickSwap"
  );
}
