/** Date labels shared by the desk screens. All input is ISO (YYYY-MM-DD). */

const day = (iso: string) => new Date(`${iso}T00:00:00`);

/** "Nov 12". */
export const fmtDay = (iso: string): string =>
  day(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

/** "Nov 12 – 15, 2026" or "Nov 12, 2026" for one day. */
export function fmtRange(dates: string[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first) return "No date set";
  const year = day(first).getFullYear();
  if (!last || first === last) return `${fmtDay(first)}, ${year}`;
  return `${fmtDay(first)} – ${fmtDay(last)}, ${year}`;
}

/** "Thursday, November 12, 2026" or a range when the event runs over several days. */
export function fmtDateLabel(dates: string[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first) return "Date not set";
  if (!last || first === last) {
    return day(first).toLocaleDateString("en-PH", { dateStyle: "full" });
  }
  return day(first).toLocaleDateString("en-PH", { dateStyle: "long" });
}

/** "2026-11-12" -> "12 Nov 2026" for tables. */
export const fmtIso = (iso: string | null): string =>
  iso
    ? day(iso).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })
    : "—";
