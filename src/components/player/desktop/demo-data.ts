import { manilaToday } from "@/lib/player/dashboard";
import { SAMPLE_INDEX, SAMPLE_PLAYER, SAMPLE_PLAYING_HANDICAP } from "@/lib/player/demo-identity";
import type { PortalState } from "@/lib/player/portal";

/**
 * Sample data for the demo build, where there is no Supabase project to ask.
 *
 * It is only used behind the `?demo=desktop` and `?demo=unlinked` switches. The player is the same
 * sample player the rest of the demo uses (`demo-identity.ts`), so the name does not change with the
 * switch; only the events differ, to show a published start and a draft one. The dates are relative to the club's today, so "Playing today" really is today
 * whenever this is opened.
 */

function dayOffset(days: number): string {
  const today = manilaToday();
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const demoPortalState: PortalState = {
  linked: true,
  player: { ...SAMPLE_PLAYER },
  entries: [
    {
      tournamentId: "demo-event-today",
      eventName: "IGCC Monthly Medal",
      eventDate: manilaToday(),
      dates: [manilaToday()],
      startFormat: "shotgun",
      firstTeeTime: "06:30",
      state: "published",
      status: "ok",
      reasons: [],
      frozenIndex: SAMPLE_INDEX,
      playingHandicap: SAMPLE_PLAYING_HANDICAP,
      category: "Regular",
      tee: "White",
      flight: "Flight A",
      paymentStatus: "paid",
      published: true,
      start: { dayNumber: 1, hole: 10, wave: "A", time: "06:30" },
      starts: [{ dayNumber: 1, hole: 10, wave: "A", time: "06:30" }],
      scorecards: [],
    },
    {
      tournamentId: "demo-event-next",
      eventName: "President's Cup",
      eventDate: dayOffset(4),
      dates: [dayOffset(4), dayOffset(5)],
      startFormat: "two_tee",
      firstTeeTime: "07:00",
      state: "draft",
      status: "ok",
      reasons: [],
      frozenIndex: SAMPLE_INDEX,
      playingHandicap: SAMPLE_PLAYING_HANDICAP,
      category: "Regular",
      tee: null,
      flight: null,
      paymentStatus: "unpaid",
      published: false,
      start: null,
      starts: [],
      scorecards: [],
    },
  ],
};

/** The same account before the club has linked a record: the home page's claim state. */
export const demoUnlinkedState: PortalState = {
  linked: false,
  player: null,
  entries: [],
};
