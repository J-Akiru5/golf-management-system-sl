/**
 * Merging the shared scorecard document.
 *
 * Several tabulators work in one account at the same time, so the document in the bucket is a shared
 * one. Saving the whole page over it (last writer wins) made one person's save erase another's, and
 * nobody saw anybody else's cards. Instead, every card, batch and the scoring mode carries a
 * revision (`rev`, milliseconds on the server's clock) and the server merges what a page sends with
 * what is stored:
 *
 *  - a card or batch that exists on one side only is kept;
 *  - a card on both sides takes the side with the higher `rev`;
 *  - a batch's card list is the union of both sides, so two people adding to one batch both keep
 *    their cards;
 *  - a removal is a tombstone (`removedCards`, `removedBatches`) with its own `rev`; it wins over a
 *    card or batch that was last changed before the removal.
 *
 * The page's own view choices (which batch it is looking at) are not shared and are taken from the
 * incoming page only. The function is pure so it can be tested without a database.
 */

type Json = Record<string, unknown>;

export interface Tombstone {
  id: string;
  rev: number;
}

export interface MergeResult {
  payload: Json;
  /** True when the merge changed what was stored, so the caller knows whether to write. */
  changed: boolean;
}

/** Who saved each side, so a score clash can name the person whose value lost. */
export interface MergeLabels {
  storedBy?: string | null;
  incomingBy?: string | null;
}

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function revOf(value: unknown): number {
  return isRecord(value) && typeof value.rev === "number" && Number.isFinite(value.rev)
    ? value.rev
    : 0;
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function tombstones(...sources: unknown[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const source of sources) {
    for (const entry of list(source)) {
      const id = typeof entry.id === "string" ? entry.id : "";
      if (!id) continue;
      out.set(id, Math.max(out.get(id) ?? 0, revOf(entry)));
    }
  }
  return out;
}

function tombstoneList(map: Map<string, number>): Tombstone[] {
  return [...map.entries()]
    .map(([id, rev]) => ({ id, rev }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Keeps one version of each id: the one with the higher revision. Ties keep the stored one. */
function pickByRev(stored: Json[], incoming: Json[]): Json[] {
  const byId = new Map<string, Json>();
  for (const item of stored) {
    if (typeof item.id === "string") byId.set(item.id, item);
  }
  for (const item of incoming) {
    if (typeof item.id !== "string") continue;
    const current = byId.get(item.id);
    if (!current || revOf(item) > revOf(current)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function holesOf(card: Json): string[] {
  return Array.isArray(card.holes)
    ? card.holes.map((value) => (typeof value === "string" ? value : ""))
    : [];
}

/**
 * A card is merged as one value, so when two people typed different scores into the same card the
 * newer save wins the whole card. That is still one person's hole silently disappearing, so the
 * winner is marked with what the other save had. The checker then sees the disagreement on the card
 * instead of having to find it later.
 */
function clashNote(winner: Json, loser: Json, loserBy: string | null | undefined): string {
  const kept = holesOf(winner);
  const other = holesOf(loser);
  const clashes: { hole: number; kept: string; other: string }[] = [];
  for (let index = 0; index < 18; index += 1) {
    const a = kept[index] ?? "";
    const b = other[index] ?? "";
    if (a && b && a !== b) clashes.push({ hole: index + 1, kept: a, other: b });
  }
  if (clashes.length === 0) return "";
  const who = loserBy && loserBy.trim() ? loserBy.trim() : "another tabulator";
  const holes = clashes.map((clash) => clash.hole).join(", ");
  const values = clashes.map((clash) => clash.other).join(", ");
  const keptValues = clashes.map((clash) => clash.kept).join(", ");
  const where = clashes.length === 1 ? `hole ${holes}` : `holes ${holes}`;
  return `Two saves disagreed on ${where}: ${who} had ${values}; the newer score (${keptValues}) was kept. Check the paper card.`;
}

/** Two saves close together are a clash; a copy that is hours old is just an old copy. */
const CLASH_WINDOW_MS = 2 * 60_000;

function withClashNote(
  winner: Json,
  storedCards: Json[],
  incomingCards: Json[],
  labels: MergeLabels,
): Json {
  const id = typeof winner.id === "string" ? winner.id : "";
  if (!id) return winner;
  const storedCard = storedCards.find((card) => String(card.id) === id);
  const incomingCard = incomingCards.find((card) => String(card.id) === id);
  if (!storedCard || !incomingCard) return winner;
  const storedRev = revOf(storedCard);
  const incomingRev = revOf(incomingCard);
  if (storedRev === incomingRev) return winner;
  if (Math.abs(storedRev - incomingRev) > CLASH_WINDOW_MS) return winner;
  const loser = storedRev > incomingRev ? incomingCard : storedCard;
  const loserBy = storedRev > incomingRev ? labels.incomingBy : labels.storedBy;
  const note = clashNote(winner, loser, loserBy);
  if (!note) return winner;
  const existing = typeof winner.note === "string" ? winner.note : "";
  if (existing.includes(note)) return winner;
  return { ...winner, note: [existing, note].filter(Boolean).join(" ") };
}

/**
 * What counts as "the same document" for the write check. Fields that change on every save without
 * meaning anything (the save time, the page's own view choice) and the order of the lists are left
 * out, and empty removal lists count as absent.
 */
function comparable(payload: Json): string {
  const { savedAt: _savedAt, activeReviewBatchId: _active, ...rest } = payload;
  const byId = (items: unknown) =>
    list(items).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const normal: Json = {
    ...rest,
    cards: byId(rest.cards),
    reviewBatches: byId(rest.reviewBatches),
    removedCards: byId(rest.removedCards),
    removedBatches: byId(rest.removedBatches),
  };
  return JSON.stringify(normal);
}

export function mergeScorecardPayloads(
  stored: Json | null,
  incoming: Json,
  now: number,
  labels: MergeLabels = {},
): MergeResult {
  if (!stored) {
    return {
      payload: { ...incoming, savedAt: new Date(now).toISOString() },
      changed: true,
    };
  }

  const removedCards = tombstones(stored.removedCards, incoming.removedCards);
  const removedBatches = tombstones(stored.removedBatches, incoming.removedBatches);

  const storedCards = list(stored.cards);
  const incomingCards = list(incoming.cards);
  const cards = pickByRev(storedCards, incomingCards)
    // A card two people saved at once keeps the newer score and says what the other save had.
    .map((card) => withClashNote(card, storedCards, incomingCards, labels))
    // A removal beats a card that was last changed before it, and loses to a later change.
    .filter((card) => (removedCards.get(String(card.id)) ?? -1) < revOf(card))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

  // A batch is a label over cards. Two people adding to the same batch must both keep their cards, so
  // the card lists are joined; the name and the other fields come from the newer version.
  const storedBatches = list(stored.reviewBatches);
  const incomingBatches = list(incoming.reviewBatches);
  const storedBatchById = new Map(storedBatches.map((batch) => [String(batch.id), batch]));
  const batches = pickByRev(storedBatches, incomingBatches)
    .map((winner): Json => {
      const id = String(winner.id);
      const other =
        winner === storedBatchById.get(id)
          ? incomingBatches.find((batch) => String(batch.id) === id)
          : storedBatchById.get(id);
      const ids = new Set<string>();
      for (const source of [winner, other]) {
        if (source && Array.isArray(source.cardIds)) {
          for (const cardId of source.cardIds) if (typeof cardId === "string") ids.add(cardId);
        }
      }
      return { ...winner, cardIds: [...ids] };
    })
    .filter((batch) => (removedBatches.get(String(batch.id)) ?? -1) < revOf(batch))
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));

  const modeFromIncoming = revOf({ rev: incoming.modeRev }) >= revOf({ rev: stored.modeRev });
  const mode = modeFromIncoming ? incoming.mode : stored.mode;
  const modeRev = Math.max(revOf({ rev: incoming.modeRev }), revOf({ rev: stored.modeRev }));

  const merged: Json = {
    ...stored,
    ...incoming,
    cards,
    reviewBatches: batches,
    removedCards: tombstoneList(removedCards),
    removedBatches: tombstoneList(removedBatches),
    ...(mode === undefined ? {} : { mode }),
    ...(modeRev > 0 ? { modeRev } : {}),
    activeReviewBatchId: incoming.activeReviewBatchId ?? stored.activeReviewBatchId ?? "all",
  };

  const changed = comparable(merged) !== comparable(stored);
  merged.savedAt = changed ? new Date(now).toISOString() : stored.savedAt;
  return { payload: merged, changed };
}
