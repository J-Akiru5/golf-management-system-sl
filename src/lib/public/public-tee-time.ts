/**
 * The one tee time a public page shows for a session on a playing day.
 *
 * The draw keeps each flight's real wave time: the second flight goes off a few minutes after the
 * session start, so the stored rows say 06:12 or 12:42. That is useful on the desk and on the
 * printed sheets, and it is not what a player should read on the public page. The public pages show
 * the session itself: one time, the same for Flight A and Flight B.
 *
 * The rule the club settled on:
 *   Day 1 and Day 2, morning   06:30
 *   Day 3 and Day 4, morning   06:00
 *   Day 1 and Day 2, afternoon 12:30
 *   Day 3, afternoon           12:00
 *   Day 4, afternoon           11:30 (Sunday's earlier second session)
 *
 * This is presentation only. The stored draw, the published snapshot, the desk screens and every
 * migration keep the real times.
 */

export interface PublicTeeTimeInput {
  /** The playing day. The club's rule names days 1 to 4. */
  dayNumber: number;
  /** True for the afternoon session, decided by the caller from the stored time. */
  afternoon: boolean;
}

/** The event's advertised first tee, kept for callers that need the fallback without a day. */
export const PUBLIC_FIRST_TEE_TIME = "06:00";

/**
 * The session time to print, or null when the club's rule does not name this day.
 *
 * Null is the safe fallback, not 06:30: a day outside the rule has no canonical time, so the caller
 * keeps the stored time rather than claiming an afternoon session starts in the morning. The four
 * real playing days always return a string, so this can never blank a page.
 */
export function publicTeeTime({ dayNumber, afternoon }: PublicTeeTimeInput): string | null {
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 4) return null;
  if (afternoon) {
    if (dayNumber === 4) return "11:30";
    return dayNumber === 3 ? "12:00" : "12:30";
  }
  return dayNumber >= 3 ? "06:00" : "06:30";
}
