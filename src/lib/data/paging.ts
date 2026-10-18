/**
 * Paging for the long lists.
 *
 * Decision 13 settled the two open questions: a page is **50 rows**, and paging happens **in the
 * browser**. Nothing changes in the queries — the repositories still fetch whole tables — because at
 * the club's field size that is faster than a round trip per page, and the print path needs the full
 * list anyway. If a list ever outgrows that, the same shape can move to `.range()` without the
 * screens changing.
 *
 * The maths is kept pure so it can be tested without a DOM.
 */

export const DEFAULT_PAGE_SIZE = 50;

export interface Page<T> {
  /** The rows to render. */
  items: T[];
  /** 1-based. */
  page: number;
  pageCount: number;
  /** 1-based index of the first row on this page, or 0 when there are no rows. */
  from: number;
  /** 1-based index of the last row on this page, or 0 when there are no rows. */
  to: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** Clamps the page into range, so a filter that shrinks the list can never leave you past the end. */
export function paginate<T>(items: T[], page: number, pageSize = DEFAULT_PAGE_SIZE): Page<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);

  return {
    items: slice,
    page: current,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + slice.length,
    total,
    hasPrev: current > 1,
    hasNext: current < pageCount,
  };
}

/** "1–50 of 126" — the label the desk and the print sheets both use. */
export function pageLabel<T>(p: Page<T>): string {
  if (p.total === 0) return "No rows";
  return `${p.from}–${p.to} of ${p.total}`;
}

/** Whether a pager is worth showing at all. A single page of rows should say nothing. */
export function isPaged<T>(p: Page<T>, pageSize = DEFAULT_PAGE_SIZE): boolean {
  return p.total > pageSize;
}
