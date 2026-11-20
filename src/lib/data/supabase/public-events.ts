import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicEvent } from "@/lib/public/highlights";
import type { Database } from "@/lib/supabase/types";

/**
 * The events a signed-out visitor may see, from `public_events()` and, when it exists,
 * `public_showcase_events()`.
 *
 * Those functions are narrow on purpose: events the club has announced, and only the fields the
 * landing page shows. They include events whose entries have closed, with `entriesOpen` saying
 * whether the entry form still applies, so the page can show the tournament during the week it is
 * played. The filter and the field list both live in the database so a mistake here cannot widen what
 * a visitor sees.
 *
 * Returns `null` when every read fails, which includes the case where no migration has been applied
 * yet. The page reads `null` as "nothing to show". It must never fall back to the sample events:
 * inventing a tournament on the club's public site is worse than an empty strip.
 */

/** A parsed event plus the showcase payload's `finished` flag. */
export type PublicEventWithFinished = PublicEvent & { finished: boolean };

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const textList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const count = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};

/**
 * Turns one row of the payload into an event, or nothing if it is not usable. Exported so the field
 * names are covered by a test rather than by hoping the database and the page agree.
 *
 * `finished` comes from the showcase payload when it is there. The older payloads do not carry it,
 * so it is derived from the last date and the `today` the caller read once. Without a date, or
 * without a day to compare it to, the event is not called finished.
 */
export function toPublicEvent(raw: unknown, today?: string): PublicEventWithFinished | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const tournamentId = text(row.tournamentId);
  const name = text(row.name);
  // Without both of these there is nothing to show and nowhere to send anyone.
  if (!tournamentId || !name) return null;
  const dates = textList(row.dates);
  const lastDate = dates.at(-1);
  const derived = lastDate !== undefined && today !== undefined ? lastDate < today : false;
  return {
    tournamentId,
    name,
    dates,
    startFormat: text(row.startFormat),
    firstTeeTime: text(row.firstTeeTime),
    cutOffDate: text(row.cutOffDate),
    entered: count(row.entered),
    // The older payload has no flag and only ever returned open events, so absent means open.
    entriesOpen: flag(row.entriesOpen, true),
    // Only an explicit true from the organizer's feature setting counts. The older payloads do not
    // carry the flag at all, so they stay unflagged rather than guessing an event.
    featured: row.featured === true,
    finished: flag(row.finished, derived),
  };
}

function parseRows(rows: unknown, today?: string): PublicEventWithFinished[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => toPublicEvent(row, today))
    .filter((event): event is PublicEventWithFinished => event !== null);
}

export async function loadPublicEvents(
  client: SupabaseClient<Database>,
  today?: string,
): Promise<PublicEventWithFinished[] | null> {
  const next = await client.rpc("public_events");
  if (!next.error && Array.isArray(next.data)) {
    return parseRows(next.data, today);
  }

  // Rollout fallback: the older function returns open events only, which is what the page showed
  // before this migration. A failure here is a failure of both reads.
  const legacy = await client.rpc("public_open_events");
  if (legacy.error || !Array.isArray(legacy.data)) return null;
  return parseRows(legacy.data, today);
}

/**
 * The landing page's read: finished events stay listed for about a year, so the carousel can mark
 * the club's most recent event Completed instead of dropping it a week after it ended.
 *
 * `public_showcase_events()` is tried first. A project that has not applied that migration answers
 * with a missing function, and the read falls back to the existing chain, so the two can ship in
 * either order.
 */
export async function loadShowcaseEvents(
  client: SupabaseClient<Database>,
  today: string,
): Promise<PublicEventWithFinished[] | null> {
  const showcase = await client.rpc("public_showcase_events");
  if (!showcase.error && Array.isArray(showcase.data)) {
    return parseRows(showcase.data, today);
  }
  return loadPublicEvents(client, today);
}
