/** How many checks one page holds. Long boards raise hundreds, so the list is paged. */
export const CHECK_PAGE_SIZE = 25;

export interface PageWindow<T> {
  /** The items on this page. */
  items: T[];
  /** The page that was actually used, after clamping into range. */
  page: number;
  pageCount: number;
  /** 1-based position of the first item on the page; 0 when there are no items. */
  from: number;
  to: number;
  total: number;
}

/** Slices a list into a page, clamping a page number that no longer exists after an edit. */
export function pageWindow<T>(items: T[], page: number, size = CHECK_PAGE_SIZE): PageWindow<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safe = Math.min(Math.max(0, Math.trunc(page)), pageCount - 1);
  const start = safe * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: safe,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
  };
}
