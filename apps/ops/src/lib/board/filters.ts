import type { BoardCard } from "./repo";

/**
 * Filters only change what is shown. The board loads every card once and filters in the browser,
 * so a filter change never refetches and never moves a card on the server.
 *
 * `ownerId`: undefined shows everyone, null shows unassigned cards, a string shows that member.
 * `month`: undefined shows every month, null shows cards with no start date, "YYYY-MM" shows that
 * month.
 */
export type BoardFilter = {
  ownerId?: string | null;
  month?: string | null;
};

export const ALL_OWNERS = "all";
export const UNASSIGNED_OWNER = "unassigned";
export const ALL_MONTHS = "all";
export const NO_MONTH = "none";

/** Read a select value back into the filter shape. Unknown values mean "everyone". */
export function ownerFilterFromValue(value: string): string | null | undefined {
  if (value === ALL_OWNERS) return undefined;
  if (value === UNASSIGNED_OWNER) return null;
  return value === "" ? undefined : value;
}

export function monthFilterFromValue(value: string): string | null | undefined {
  if (value === ALL_MONTHS) return undefined;
  if (value === NO_MONTH) return null;
  return value === "" ? undefined : value;
}

export function ownerValueForFilter(ownerId: string | null | undefined): string {
  if (ownerId === undefined) return ALL_OWNERS;
  if (ownerId === null) return UNASSIGNED_OWNER;
  return ownerId;
}

export function monthValueForFilter(month: string | null | undefined): string {
  if (month === undefined) return ALL_MONTHS;
  if (month === null) return NO_MONTH;
  return month;
}

export function filterIsActive(filter: BoardFilter): boolean {
  return filter.ownerId !== undefined || filter.month !== undefined;
}

/** "YYYY-MM" for a start date, or null. */
export function monthOf(startDate: string | null): string | null {
  if (startDate === null || startDate.length < 7) return null;
  return startDate.slice(0, 7);
}

export function matchesFilter(card: BoardCard, filter: BoardFilter): boolean {
  if (filter.ownerId === null) {
    if (card.owner_id !== null) return false;
  } else if (typeof filter.ownerId === "string" && card.owner_id !== filter.ownerId) {
    return false;
  }

  if (filter.month === null) {
    if (card.start_date !== null) return false;
  } else if (typeof filter.month === "string") {
    if (monthOf(card.start_date) !== filter.month) return false;
  }

  return true;
}

export function filterCards(cards: readonly BoardCard[], filter: BoardFilter): BoardCard[] {
  return cards.filter((card) => matchesFilter(card, filter));
}

/** The months present in the data, oldest first, for the month select. */
export function monthsIn(cards: readonly BoardCard[]): string[] {
  const months = new Set<string>();
  for (const card of cards) {
    const month = monthOf(card.start_date);
    if (month !== null) months.add(month);
  }
  return [...months].sort();
}

export function hasUndatedCards(cards: readonly BoardCard[]): boolean {
  return cards.some((card) => card.start_date === null);
}

/** Quoted totals per currency, so two currencies are never added together. */
export function quotedTotals(
  cards: readonly BoardCard[],
): Array<{ currency: string; total: number }> {
  const totals = new Map<string, number>();
  for (const card of cards) {
    if (card.quoted_amount === null) continue;
    totals.set(card.currency, (totals.get(card.currency) ?? 0) + card.quoted_amount);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([currency, total]) => ({ currency, total }));
}
