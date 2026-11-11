/**
 * The words around bulk confirmation. Pure, so the two claims the operator depends on are testable
 * without a store or a DOM:
 *
 * - the button names the real scope, which is every entry in the current filter, not the rows on
 *   this page (the button used to say "shown");
 * - the line above the list says, before the tap, that the write cannot be undone.
 */
export interface BulkConfirmCopyInput {
  /** Entries the button will confirm right now. */
  count: number;
  /** True when the search box narrows the list, so the scope is a filter rather than the event. */
  filtered: boolean;
  /** Pages in the current filter. More than one means the batch spans pages. */
  pageCount: number;
}

export interface BulkConfirmCopy {
  /** The button label. It must name what is confirmed and how many. */
  label: string;
  /** Shown above the list, before the tap. */
  note: string;
}

export function bulkConfirmCopy({
  count,
  filtered,
  pageCount,
}: BulkConfirmCopyInput): BulkConfirmCopy {
  const scope = filtered ? "this filter" : "this event";
  const pages = pageCount > 1 ? `, across all ${pageCount} pages` : "";
  return {
    label: `Confirm ${count} ${count === 1 ? "entry" : "entries"} in ${scope}`,
    note: `Bulk confirm acts on every parked entry in ${scope}${pages}, not only the rows on this page. It marks them ready in the club database and cannot be undone, so a mistake needs a manual correction.`,
  };
}
