/**
 * Dates in the interface. One fixed format and one fixed time zone, so a page rendered on the
 * server and a list rendered in the browser show the same words for the same moment.
 */
const WHEN_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Manila",
});

/** "20 Nov 2026, 14:32". A value that is not a date is said to be unknown, never guessed. */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return WHEN_FORMAT.format(date);
}
