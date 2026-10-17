/** "07:00" -> "7:00 AM". Clock times in the UI use 12-hour format. */
export function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Plus handicaps are stored negative; golfers read them as "+2.3". */
export function fmtIndex(index: number | null): string {
  if (index === null) return "NH";
  return index < 0 ? `+${Math.abs(index).toFixed(1)}` : index.toFixed(1);
}

/** Playing handicap for display. Plus handicaps show as +2, not -2. */
export function fmtHcp(n: number | null): string {
  if (n === null) return "—";
  return n < 0 ? `+${Math.abs(n)}` : String(n);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
