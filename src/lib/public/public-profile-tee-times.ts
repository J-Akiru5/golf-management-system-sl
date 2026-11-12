/**
 * A player's public profile rows with the session time in place of the flight's wave time.
 *
 * The raw rows still come from `profileTeeTimes`, and the afternoon is read from the stored time
 * with the same `sessionForTime` the pairings view uses, so a Sunday 11:42 start is the afternoon
 * and 06:12 is the morning. A day the club's rule does not name keeps its stored time.
 */

import type { PublicProfileTeeTime } from "@/lib/data/public-profile";
import { profileTeeTimes } from "@/lib/data/public-profile";
import { sessionForTime } from "@/lib/data/sessions";
import type { PublicProgramme } from "@/lib/data/types";
import { publicTeeTime } from "./public-tee-time";

export function publicProfileTeeTimes(
  programme: Pick<PublicProgramme, "days">,
  playerName: string,
): PublicProfileTeeTime[] {
  const dayCount = programme.days.length;
  return profileTeeTimes(programme, playerName).map((row) => {
    const dayIndex = programme.days.findIndex((day) => day.dayNumber === row.dayNumber);
    const session = sessionForTime(row.teeTime, dayIndex, dayCount);
    const canonical = session
      ? publicTeeTime({ dayNumber: row.dayNumber, afternoon: session.key === "PM" })
      : null;
    return canonical === null ? row : { ...row, teeTime: canonical };
  });
}
