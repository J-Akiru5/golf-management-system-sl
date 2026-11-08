import { sessionForTime } from "@/lib/data/sessions";

/**
 * Names the session (AM or PM) a start time belongs to on one playing day. The last playing day's
 * afternoon starts earlier than the others (11:30 on Sunday), so the day's place in the event matters.
 * With no day chosen the first playing day's times are used.
 */
export function sessionFinderFor(
  days: readonly { dayNumber: number; isPlayingDay?: boolean }[],
  dayNumber: number | null,
): (time: string) => string | null {
  const playing = [
    ...new Set(days.filter((d) => d.isPlayingDay !== false).map((d) => d.dayNumber)),
  ].sort((a, b) => a - b);
  const dayCount = Math.max(1, playing.length);
  const dayIndex = Math.max(0, dayNumber === null ? 0 : playing.indexOf(dayNumber));
  return (time) => sessionForTime(time, dayIndex, dayCount)?.key ?? null;
}
