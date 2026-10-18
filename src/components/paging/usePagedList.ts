"use client";

import { useState } from "react";
import { DEFAULT_PAGE_SIZE, type Page, paginate } from "@/lib/data/paging";

/**
 * Paging for a list that is searched and filtered.
 *
 * The rules the desk needs, in one place:
 *
 * - **Filter first, then page.** Callers pass the already-filtered list; this only slices it.
 * - **Reset to page 1 when the search or filter changes**, held as part of the same state as the
 *   page number so it happens during the same render rather than in an effect that would briefly
 *   show the wrong rows.
 * - **A stable order.** Editing a row must not make it jump to another page, so ties are broken on
 *   the id. Callers pass a comparator; equal rows keep a fixed order.
 */
export interface PagedList<T> {
  page: Page<T>;
  setPage: (page: number) => void;
}

interface PagedListState {
  page: number;
  key: string;
}

/**
 * The page to show, given the last state and the current filter.
 *
 * A changed filter reads as page 1 immediately, in the same render as the new rows, rather than
 * through an effect that would briefly show page 3 of a two-page list.
 */
export function resolvePage(state: PagedListState, filterKey: string): number {
  return state.key === filterKey ? state.page : 1;
}

/** Sorts by the comparator, breaking ties on the record id so the order never wobbles. */
export function sortStable<T extends { id: string }>(
  items: T[],
  compare: (a: T, b: T) => number,
): T[] {
  return [...items].sort((a, b) => compare(a, b) || a.id.localeCompare(b.id));
}

export function usePagedList<T>(
  items: T[],
  /** Changes whenever the search or filter changes, which resets paging. */
  filterKey: string,
  pageSize = DEFAULT_PAGE_SIZE,
): PagedList<T> {
  const [state, setState] = useState<PagedListState>({ page: 1, key: filterKey });
  // Derived rather than stored: a changed filter reads as page 1 immediately, with no extra render.
  const page = resolvePage(state, filterKey);

  return {
    page: paginate(items, page, pageSize),
    setPage: (next: number) => setState({ page: next, key: filterKey }),
  };
}
