/**
 * The order the public tee-time cards appear in on a playing day.
 *
 * A shotgun start gives every group the same clock time, so the starting hole is the only thing
 * that tells two cards apart. A player reads the board down the holes: the morning first, the
 * afternoon after it, and on a shotgun the cards run 1, 2, 3 rather than in the order the players
 * happen to be listed.
 *
 * Pure, no I/O: the board builds its groups and this decides their order.
 */

export type TeeCardSession = "AM" | "PM";

/** The card fields the order reads. The players stay in whatever order the card shows them. */
export interface TeeCardOrderFields {
  /** "HH:MM" (or "HH:MM:SS") when the start is confirmed, otherwise null. */
  teeTime: string | null;
  session: TeeCardSession | null;
  startHole: number | null;
  /** The players on this start, used only for the tie-break by first name. */
  players: readonly { name: string }[];
}

/** AM comes first, PM after it, and a card with no session after both. */
const SESSION_RANK: Record<TeeCardSession, number> = { AM: 0, PM: 1 };
const NO_SESSION_RANK = 2;

/** Minutes after midnight for a readable clock time, or null when it is not one. */
function minutesOf(time: string | null): number | null {
  if (!time) return null;
  // A stored time can arrive as HH:MM:SS, so the seconds are optional.
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function sessionRank(session: TeeCardSession | null): number {
  return session === null ? NO_SESSION_RANK : SESSION_RANK[session];
}

/** The name the tie-break reads: the first player the card shows. */
function firstPlayerName(card: TeeCardOrderFields): string {
  return card.players[0]?.name ?? "";
}

/**
 * Compare two cards in the order the board shows them: session, then time, then starting hole,
 * then the first player's name. A card with no hole follows the cards that have one, and a card
 * with no readable time follows the timed cards.
 */
export function compareTeeCards(a: TeeCardOrderFields, b: TeeCardOrderFields): number {
  const session = sessionRank(a.session) - sessionRank(b.session);
  if (session !== 0) return session;

  const at = minutesOf(a.teeTime);
  const bt = minutesOf(b.teeTime);
  if (at !== bt) {
    if (at === null) return 1;
    if (bt === null) return -1;
    return at - bt;
  }

  const ah = a.startHole;
  const bh = b.startHole;
  if (ah !== bh) {
    if (ah === null) return 1;
    if (bh === null) return -1;
    return ah - bh;
  }

  return firstPlayerName(a).localeCompare(firstPlayerName(b));
}

/**
 * The same cards in board order, as a new array. The input is left alone, and two cards that tie on
 * every field keep their existing order, which the stable sort preserves.
 */
export function orderTeeCards<T extends TeeCardOrderFields>(cards: readonly T[]): T[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => compareTeeCards(a.card, b.card) || a.index - b.index)
    .map((entry) => entry.card);
}
