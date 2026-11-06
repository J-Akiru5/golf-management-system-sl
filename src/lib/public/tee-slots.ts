import type { PublicTeeTimeDay } from "@/lib/data/types";

/**
 * One card on the public tee-times board: a confirmed start time, the hole it starts on and the
 * players drawn into it.
 */
export interface TeeSlot {
  key: string;
  /** "HH:MM", never null: an unconfirmed time is not a slot. */
  teeTime: string;
  startHole: number | null;
  names: string[];
}

export interface TeeBoard {
  slots: TeeSlot[];
  /** Players entered for the day whose start time the desk has not confirmed. */
  awaiting: number;
  /** Everyone who chose the day, confirmed or not. */
  total: number;
}

/**
 * Groups one playing day into confirmed tee slots, earliest first.
 *
 * An unconfirmed player is counted, never listed. The board tells the reader that a time the desk
 * has not confirmed is not shown, and a single narrow column holding every unconfirmed name is both
 * a contradiction and unreadable. The players themselves are still in the directory below, so
 * nothing is hidden from them; only this board stays honest.
 */
export function teeBoardFor(day: PublicTeeTimeDay | undefined): TeeBoard {
  if (!day) return { slots: [], awaiting: 0, total: 0 };

  const byKey = new Map<string, TeeSlot>();
  let awaiting = 0;

  for (const player of day.players) {
    if (player.teeTime === null) {
      awaiting += 1;
      continue;
    }
    const key = `${player.teeTime}|${player.startHole ?? "no-hole"}`;
    const slot = byKey.get(key) ?? {
      key,
      teeTime: player.teeTime,
      startHole: player.startHole,
      names: [],
    };
    slot.names.push(player.name);
    byKey.set(key, slot);
  }

  const slots = [...byKey.values()].sort((a, b) => {
    if (a.teeTime !== b.teeTime) return a.teeTime < b.teeTime ? -1 : 1;
    const left = a.startHole ?? Number.POSITIVE_INFINITY;
    const right = b.startHole ?? Number.POSITIVE_INFINITY;
    return left - right;
  });

  return { slots, awaiting, total: day.players.length };
}
