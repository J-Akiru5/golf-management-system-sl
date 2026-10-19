import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicEvent } from "@/lib/public/highlights";
import type { Database } from "@/lib/supabase/types";

/**
 * The events a signed-out visitor may see, from `public_open_events()`.
 *
 * That function is narrow on purpose: open events only, and only the fields the landing page shows.
 * The filter and the field list both live in the database so a mistake here cannot widen what a
 * visitor sees.
 *
 * Returns `null` when the call fails, which includes the case where the migration adding the function
 * has not been applied yet. The page reads `null` as "nothing to show". It must never fall back to
 * the sample events: inventing a tournament on the club's public site is worse than an empty strip.
 */

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

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
 */
export function toPublicEvent(raw: unknown): PublicEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const tournamentId = text(row.tournamentId);
  const name = text(row.name);
  // Without both of these there is nothing to show and nowhere to send anyone.
  if (!tournamentId || !name) return null;
  return {
    tournamentId,
    name,
    dates: textList(row.dates),
    startFormat: text(row.startFormat),
    firstTeeTime: text(row.firstTeeTime),
    cutOffDate: text(row.cutOffDate),
    entered: count(row.entered),
  };
}

export async function loadPublicOpenEvents(
  client: SupabaseClient<Database>,
): Promise<PublicEvent[] | null> {
  const { data, error } = await client.rpc("public_open_events");
  if (error) return null;
  if (!Array.isArray(data)) return null;
  return data.map(toPublicEvent).filter((e): e is PublicEvent => e !== null);
}
