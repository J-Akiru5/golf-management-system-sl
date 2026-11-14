/**
 * One pass of a clubhouse-board column.
 *
 * A pass is: the column empty for a beat, then the list rises from the bottom edge, and it ends when
 * the whole list has gone past the top — including its last name, which leaves the screen rather
 * than sitting there. The column is empty again, waits for the other columns to finish their own
 * passes, and the board then changes to the next list.
 *
 * `y` is the track's vertical offset. `y = viewportHeight` parks the list just below the column, so
 * the column is empty; as `y` falls the list rises through it; `y = -listHeight` has taken the last
 * row out of the top. Pure, so the order can be checked without a browser.
 */

/** How long a column stays empty before its list starts to rise. */
export const SCROLL_EMPTY_HOLD_MS = 800;

export interface ScrollPass {
  y: number;
  /** True once the last row has left the top and the column is empty again. */
  done: boolean;
}

export function scrollPass(
  elapsedMs: number,
  listHeight: number,
  viewportHeight: number,
  speed: number,
): ScrollPass {
  // A list that fits the column is shown whole: there is nothing to scroll.
  if (listHeight <= 0 || listHeight <= viewportHeight) return { y: 0, done: true };

  const start = viewportHeight;
  const end = -listHeight;
  const distance = start - end;
  const travel = (Math.max(0, elapsedMs - SCROLL_EMPTY_HOLD_MS) * Math.max(1, speed)) / 1000;

  if (travel >= distance) return { y: end, done: true };

  return { y: start - travel, done: false };
}
