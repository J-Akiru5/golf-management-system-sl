/**
 * The desk's card queue: who plays in this round, which of them already has a card, and which card
 * the desk should type next.
 *
 * Pure. The screen passes the round it already loaded, the draw and day data it already has, and
 * the cards it already read, so nothing here fetches or guesses. A player with no active card is
 * "missing"; a card that is in but not approved is "entered"; only an approved card is "verified".
 * The order follows the paper pile: group, then the hole it starts on, then the name.
 */
import { matchesText } from "@/lib/names";
import type { Scorecard } from "./types";

export type CardQueueState = "none" | "entered" | "verified";
export type CardQueueSession = "AM" | "PM";

/** Where the day's field puts a player: their session, group and starting hole, when known. */
export interface CardQueuePlacement {
  session?: CardQueueSession | null;
  groupNumber?: number | null;
  startHole?: number | null;
  teeTime?: string | null;
}

export interface CardQueuePlayer {
  playerId: string;
  playerName: string;
  /** The class name the desk reads, when the round or the event has one. */
  className?: string | null;
  /** The class to filter on, so two classes with the same name never merge. */
  classKey?: string | null;
}

export interface CardQueueEntry {
  playerId: string;
  playerName: string;
  className: string | null;
  classKey: string | null;
  session: CardQueueSession | null;
  groupNumber: number | null;
  startHole: number | null;
  /** "HH:MM" for the group, or the confirmed tee time on the entry. */
  teeTime: string | null;
  state: CardQueueState;
}

export interface CardQueueFilters {
  /** "all" keeps every session. A session drops a player whose session is not known. */
  session: "all" | CardQueueSession;
  /** The class key to keep, or null for every class. */
  classKey: string | null;
  /** "all" keeps every card state. */
  state: "all" | CardQueueState;
  /** What the desk typed. Word order, capitals, punctuation and accents do not matter. */
  query: string;
}

export interface CardQueueCounts {
  /** Players in the scope the filters describe. */
  total: number;
  /** Cards in, approved or not. */
  entered: number;
  /** Approved cards. */
  verified: number;
  /** Players with no active card. */
  missing: number;
}

type CardStateRow = Pick<Scorecard, "playerId" | "status" | "revision">;

/** The statuses that still count. A rejected, revoked or superseded card is not a card in. */
const ACTIVE: ReadonlySet<Scorecard["status"]> = new Set(["submitted", "in_review", "approved"]);

const LAST = Number.MAX_SAFE_INTEGER;

/**
 * What the desk has for one player. The newest active revision decides it, so a submitted card
 * under a newer approved one still reads as verified.
 */
export function cardQueueState(cards: readonly CardStateRow[], playerId: string): CardQueueState {
  let newest: CardStateRow | null = null;
  for (const card of cards) {
    if (card.playerId !== playerId || !ACTIVE.has(card.status)) continue;
    if (newest === null || card.revision > newest.revision) newest = card;
  }
  if (newest === null) return "none";
  return newest.status === "approved" ? "verified" : "entered";
}

/** Group order, then the hole it starts on, then the name: the order of the paper pile. */
function compareQueue(left: CardQueueEntry, right: CardQueueEntry): number {
  const group = (left.groupNumber ?? LAST) - (right.groupNumber ?? LAST);
  if (group !== 0) return group;
  const hole = (left.startHole ?? LAST) - (right.startHole ?? LAST);
  if (hole !== 0) return hole;
  // Names are stored "SURNAME, GIVEN", so plain comparison sorts by surname first. It is also
  // deterministic: no runtime locale decides the order of the desk's list.
  if (left.playerName !== right.playerName) return left.playerName < right.playerName ? -1 : 1;
  return left.playerId < right.playerId ? -1 : left.playerId > right.playerId ? 1 : 0;
}

export function buildCardQueue(
  players: readonly CardQueuePlayer[],
  cards: readonly CardStateRow[],
  placements: ReadonlyMap<string, CardQueuePlacement> = new Map(),
): CardQueueEntry[] {
  const entries: CardQueueEntry[] = players.map((player) => {
    const placement = placements.get(player.playerId);
    return {
      playerId: player.playerId,
      playerName: player.playerName,
      className: player.className ?? null,
      classKey: player.classKey ?? null,
      session: placement?.session ?? null,
      groupNumber: placement?.groupNumber ?? null,
      startHole: placement?.startHole ?? null,
      teeTime: placement?.teeTime ?? null,
      state: cardQueueState(cards, player.playerId),
    };
  });
  return entries.sort(compareQueue);
}

/** The queue the desk is looking at: the day's scope, then the session, class, state and search. */
export function filterCardQueue(
  entries: readonly CardQueueEntry[],
  filters: CardQueueFilters,
): CardQueueEntry[] {
  return entries.filter((entry) => {
    if (filters.session !== "all" && entry.session !== filters.session) return false;
    if (filters.classKey !== null && entry.classKey !== filters.classKey) return false;
    if (filters.state !== "all" && entry.state !== filters.state) return false;
    return matchesText([entry.playerName, entry.className], filters.query);
  });
}

export function cardQueueCounts(entries: readonly CardQueueEntry[]): CardQueueCounts {
  let verified = 0;
  let entered = 0;
  for (const entry of entries) {
    if (entry.state === "verified") {
      verified += 1;
      entered += 1;
    } else if (entry.state === "entered") {
      entered += 1;
    }
  }
  return { total: entries.length, entered, verified, missing: entries.length - entered };
}

/**
 * The next card to type after the one just saved: the next player in queue order who still has no
 * card, wrapping to the start of the list. Null when every card in the list is already in, so the
 * desk is never sent to a card the save would refuse as a duplicate.
 */
export function nextCardInQueue(
  entries: readonly CardQueueEntry[],
  currentPlayerId: string,
): CardQueueEntry | null {
  const index = entries.findIndex((entry) => entry.playerId === currentPlayerId);
  if (index < 0) return entries.find((entry) => entry.state === "none") ?? null;
  for (let step = 1; step <= entries.length; step += 1) {
    const entry = entries[(index + step) % entries.length];
    if (entry && entry.state === "none") return entry;
  }
  return null;
}
