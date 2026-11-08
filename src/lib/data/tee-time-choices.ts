import type { DayTeePreference } from "./types";

/**
 * Whether any day's tee-time choices are still kept as supplied, waiting for the organizer to
 * confirm them. The Register page and the readiness check both read this, so the "still needs
 * confirmation" wording only shows while a day really does.
 */
export function teeTimesNeedConfirmation(
  teeTimes: readonly Pick<DayTeePreference, "needsConfirmation">[] | null | undefined,
): boolean {
  return (teeTimes ?? []).some((d) => d.needsConfirmation);
}

/** The days whose tee-time choices still need the organizer to confirm them, in order. */
export function unconfirmedTeeTimeDays<T extends Pick<DayTeePreference, "needsConfirmation">>(
  teeTimes: readonly T[] | null | undefined,
): T[] {
  return (teeTimes ?? []).filter((d) => d.needsConfirmation);
}

/**
 * The same tee-time choices with one day marked confirmed or not. Matched by ISO date, which is
 * the identity the rest of the app uses for a day. Nothing else on the day changes: the option
 * text and label stay exactly as supplied. An unknown date returns the list unchanged.
 */
export function withTeeTimeConfirmed(
  teeTimes: readonly DayTeePreference[],
  date: string,
  confirmed: boolean,
): DayTeePreference[] {
  return teeTimes.map((d) => (d.date === date ? { ...d, needsConfirmation: !confirmed } : d));
}
