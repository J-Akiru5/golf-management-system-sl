import { POSITION_MIN_GAP, POSITION_STEP } from "@/lib/db/constants";

/**
 * Pure ordering for the pipeline board.
 *
 * `position` is a double. A move writes the midpoint of its two new neighbours, so it never has to
 * rewrite the other rows. When two neighbours get closer than POSITION_MIN_GAP the column is
 * renumbered POSITION_STEP apart. Nothing here touches the network or the database.
 */

/** The only fields this module needs from a card. Keeps it usable from tests without a full row. */
export type PositionedCard = {
  id: string;
  stage: string;
  position: number;
};

export type MoveTarget = {
  id: string;
  toStage: string;
  /** The card that ends up immediately above the moved card, or null for the top of the column. */
  beforeId: string | null;
  /** The card that ends up immediately below the moved card, or null for the bottom. */
  afterId: string | null;
};

export type MoveResult<C extends PositionedCard> = {
  /** The optimistic card list. */
  cards: C[];
  /** The position the moved card now has. */
  position: number;
  /** Every position that must be saved. A rebalance returns the whole target column. */
  updates: Array<{ id: string; position: number }>;
};

/**
 * The midpoint of two neighbours. Before the first card the position steps down from the next one;
 * after the last it steps up from the previous one; an empty column starts at POSITION_STEP.
 */
export function computePosition(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return POSITION_STEP;
  if (prev === null && next !== null) return next - POSITION_STEP;
  if (prev !== null && next === null) return prev + POSITION_STEP;
  if (prev === null || next === null) return POSITION_STEP;
  return (prev + next) / 2;
}

/** True when two neighbours are too close to fit a midpoint between them safely. */
export function needsRebalance(prev: number | null, next: number | null): boolean {
  if (prev === null || next === null) return false;
  return next - prev < POSITION_MIN_GAP;
}

/** Sort one column by position, then by id so the order is stable when positions tie. */
export function sortColumn<C extends PositionedCard>(cards: readonly C[]): C[] {
  return [...cards].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Renumber a column POSITION_STEP apart in its current order. Returns new objects. */
export function rebalance<C extends PositionedCard>(cards: readonly C[]): C[] {
  return sortColumn(cards).map((card, index) => ({
    ...card,
    position: POSITION_STEP * (index + 1),
  }));
}

function indexOfId(cards: readonly PositionedCard[], id: string | null): number {
  if (id === null) return -1;
  return cards.findIndex((card) => card.id === id);
}

/**
 * The optimistic result of moving one card.
 *
 * `beforeId` and `afterId` are neighbours: the card immediately above and immediately below the
 * moved card in its new column. Missing ids fall back to the end of the column. Moving a card onto
 * itself, or into the place it already occupies, is a no-op and returns no updates.
 */
export function applyMove<C extends PositionedCard>(
  cards: readonly C[],
  move: MoveTarget,
): MoveResult<C> {
  const moving = cards.find((card) => card.id === move.id);
  if (moving === undefined) throw new Error(`Card ${move.id} is not on the board.`);

  if (move.beforeId === move.id || move.afterId === move.id) {
    return { cards: [...cards], position: moving.position, updates: [] };
  }

  const targetColumn = sortColumn(
    cards.filter((card) => card.stage === move.toStage && card.id !== move.id),
  );

  // Insert before `afterId`; otherwise after `beforeId`; otherwise at the end.
  const afterIndex = indexOfId(targetColumn, move.afterId);
  const beforeIndex = indexOfId(targetColumn, move.beforeId);
  const insertAt =
    afterIndex >= 0 ? afterIndex : beforeIndex >= 0 ? beforeIndex + 1 : targetColumn.length;

  const prev = targetColumn[insertAt - 1]?.position ?? null;
  const next = targetColumn[insertAt]?.position ?? null;
  const position = computePosition(prev, next);

  const tooTight =
    (prev !== null && position - prev < POSITION_MIN_GAP) ||
    (next !== null && next - position < POSITION_MIN_GAP);

  if (tooTight || needsRebalance(prev, next)) {
    // The midpoint still sorts correctly between the neighbours, so renumber from there.
    const withMoved = [...targetColumn];
    withMoved.splice(insertAt, 0, { ...moving, stage: move.toStage, position });
    const renumbered = rebalance(withMoved);
    const byId = new Map(renumbered.map((card) => [card.id, card.position]));
    return {
      cards: cards.map((card) => {
        if (card.id === move.id) {
          const placed = byId.get(card.id);
          return placed === undefined
            ? { ...card, stage: move.toStage, position }
            : { ...card, stage: move.toStage, position: placed };
        }
        if (card.stage !== move.toStage) return card;
        const placed = byId.get(card.id);
        return placed === undefined ? card : { ...card, position: placed };
      }),
      position: byId.get(move.id) ?? position,
      updates: renumbered.map((card) => ({ id: card.id, position: card.position })),
    };
  }

  return {
    cards: cards.map((card) =>
      card.id === move.id ? { ...card, stage: move.toStage, position } : card,
    ),
    position,
    updates: [{ id: move.id, position }],
  };
}
