import { isDay } from "./dates";
import type { MilestoneSource, ReleaseSource, TournamentSource } from "./types";

/**
 * Reading the tournament list the public site already publishes.
 *
 * `public_event_archive()` is the function behind `/events`: every event the club has announced,
 * with its playing days, no contact details and no player data. It runs as its definer and is
 * granted to a signed-in session, so the workspace reads it with the person's own session and needs
 * no service role. A draft event that has not been announced is not in that list, and this module
 * does not widen it.
 *
 * The parsing lives here, apart from the Supabase client, so it is covered by tests without a
 * database.
 */

const FUNCTIONS = ["public_event_archive", "public_showcase_events"] as const;

/** The production site, used when `NEXT_PUBLIC_SITE_URL` is not set on this project. */
export const DEFAULT_PUBLIC_SITE = "https://golf.syntaxure.dev";

/** The public site's origin, with no trailing slash. */
export function publicSiteBase(
  env: { NEXT_PUBLIC_SITE_URL?: string | undefined } = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
): string {
  const value = (env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  const base = value === "" ? DEFAULT_PUBLIC_SITE : value;
  return base.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dayList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => isDay(entry));
}

/**
 * One event per row that can be shown. A row without an id, a name or a playing day is dropped: a
 * timeline row with no day has nowhere to go.
 */
export function parseArchiveEvents(payload: unknown): TournamentSource[] {
  if (!Array.isArray(payload)) return [];

  const events: TournamentSource[] = [];
  for (const row of payload) {
    if (!isRecord(row)) continue;

    const id = text(row.tournamentId);
    const name = text(row.name);
    const dates = dayList(row.dates).sort();
    if (id === "" || name === "" || dates.length === 0) continue;

    events.push({ id, name, dates, finished: row.finished === true });
  }

  return events;
}

/** The function names to try, in order. A project without the newer one answers with an error. */
export const ARCHIVE_FUNCTIONS = FUNCTIONS;

/** The demo event list. Fixed days, and the page says it is demo data. */
export function demoTournaments(): TournamentSource[] {
  return [
    {
      id: "demo-tournament-bamboo",
      name: "24th Bamboo Tee",
      dates: ["2026-12-12", "2026-12-13"],
      finished: false,
    },
    {
      id: "demo-tournament-partner",
      name: "Partner invitational",
      dates: ["2026-11-20", "2026-11-21"],
      finished: true,
    },
    {
      id: "demo-tournament-summer",
      name: "2026 summer series",
      dates: ["2026-06-14"],
      finished: true,
    },
  ];
}

/** The demo GitHub rows, only reachable while `demoMode()` is true. */
export function demoGithub(): { milestones: MilestoneSource[]; releases: ReleaseSource[] } {
  return {
    milestones: [
      {
        number: 1,
        title: "v1.0.0",
        dueOn: "2026-12-15",
        state: "open",
        url: "https://github.com/J-Akiru5/golf-management-system-sl/milestone/1",
      },
    ],
    releases: [
      {
        tag: "v0.63.0",
        name: "0.63.0",
        publishedOn: "2026-11-21",
        url: "https://github.com/J-Akiru5/golf-management-system-sl/releases/tag/v0.63.0",
        prerelease: false,
      },
    ],
  };
}
