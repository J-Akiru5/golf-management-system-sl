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
 * The page state for the current filter.
 *
 * A changed filter is a different list, and the only page you can be on in a list you have not
 * looked at is page 1. Returning the *state* rather than just a number matters: masking the page
 * number alone leaves the old one in storage, so coming back to a filter you have already used
 * would drop you on the page you last left it on. That is a real bug, not a hypothetical one, and
 * the browser check on `/players` is what caught it.
 */
export function pageStateFor(state: PagedListState, filterKey: string): PagedListState {
  return state.key === filterKey ? state : { page: 1, key: filterKey };
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
  /** Changes whenever the search, filter or tab changes, which resets paging. */
  filterKey: string,
  pageSize = DEFAULT_PAGE_SIZE,
): PagedList<T> {
  const [stored, setStored] = useState<PagedListState>(() => ({ page: 1, key: filterKey }));
  const state = pageStateFor(stored, filterKey);

  // Adopt the reset during render. React throws this pass away and re-runs with page 1 before
  // anything paints, so the desk never glimpses rows from the page it just left, and the reset is
  // recorded rather than merely hidden.
  if (state !== stored) setStored(state);

  return {
    page: paginate(items, state.page, pageSize),
    setPage: (next: number) => setStored({ page: next, key: filterKey }),
  };
}
