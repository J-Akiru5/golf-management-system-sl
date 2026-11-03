import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicEvent } from "@/lib/public/highlights";
import type { Database } from "@/lib/supabase/types";

/**
 * The events a signed-out visitor may see, from `public_events()`.
 *
 * That function is narrow on purpose: events the club has announced, and only the fields the landing
 * page shows. It includes events whose entries have closed, with `entriesOpen` saying whether the
 * entry form still applies, so the page can show the tournament during the week it is played. The
 * filter and the field list both live in the database so a mistake here cannot widen what a visitor
 * sees.
 *
 * Returns `null` when both reads fail, which includes the case where neither migration has been
 * applied yet. The page reads `null` as "nothing to show". It must never fall back to the sample
 * events: inventing a tournament on the club's public site is worse than an empty strip.
 */

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
    // The older payload has no flag and only ever returned open events, so absent means open.
    entriesOpen: flag(row.entriesOpen, true),
  };
}

export async function loadPublicEvents(
  client: SupabaseClient<Database>,
): Promise<PublicEvent[] | null> {
  const next = await client.rpc("public_events");
  if (!next.error && Array.isArray(next.data)) {
    return next.data.map(toPublicEvent).filter((e): e is PublicEvent => e !== null);
  }

  // Rollout fallback: the older function returns open events only, which is what the page showed
  // before this migration. A failure here is a failure of both reads.
  const legacy = await client.rpc("public_open_events");
  if (legacy.error || !Array.isArray(legacy.data)) return null;
  return legacy.data.map(toPublicEvent).filter((e): e is PublicEvent => e !== null);
}
