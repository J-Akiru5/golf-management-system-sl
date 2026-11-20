import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicEvent } from "@/lib/public/highlights";
import type { Database } from "@/lib/supabase/types";
import { loadShowcaseEvents, toPublicEvent } from "./public-events";

/**
 * The public event archive, behind `/events` and `/events/<id>`.
 *
 * `public_event_archive()` is the read this module prefers: every event the public site may show,
 * in state open or closed, with no time limit and newest first, plus `finished`, `featured` and
 * `hasRules`. A project that has not applied 20261122000000 answers with a missing function, and the
 * read falls back to `public_showcase_events()` and then `public_events()`, so the pages ship in
 * either order. The fallback carries no rules flag, so `hasRules` is false there and the /rules
 * redirect uses the features it can see.
 *
 * Nothing here invents an event. A row without an id or a name is dropped, and every read failing
 * answers `null`, which the pages show as a calm empty state.
 */

/** Where an event stands today, in the words the cards use. */
export type ArchivePhase = "upcoming" | "live" | "completed";

export interface ArchivedEvent extends PublicEvent {
  /** The last playing day is behind us. */
  finished: boolean;
  /** The organizer stored rules of play for this event. */
  hasRules: boolean;
  phase: ArchivePhase;
}

export const ARCHIVE_PHASE_LABELS: Record<ArchivePhase, string> = {
  upcoming: "Upcoming",
  live: "Live",
  completed: "Completed",
};

/**
 * The phase from the dates and the finished flag. Dates decide when they are there, because an
 * event in its own week is live even though its entries closed; without dates the database's
 * finished flag is the only fact, and an event it calls unfinished is upcoming rather than guessed.
 */
export function archivePhase(
  event: Pick<PublicEvent, "dates"> & { finished: boolean },
  today: string,
): ArchivePhase {
  const first = event.dates[0];
  const last = event.dates.at(-1);
  if (!first || !last) return event.finished ? "completed" : "upcoming";
  if (today < first) return "upcoming";
  if (today > last) return "completed";
  return "live";
}

/** One archive row as the pages show it, or nothing when it cannot be shown. */
export function toArchivedEvent(raw: unknown, today: string): ArchivedEvent | null {
  const event = toPublicEvent(raw, today);
  if (!event) return null;
  const hasRules =
    typeof raw === "object" && raw !== null && (raw as Record<string, unknown>).hasRules === true;
  return { ...event, hasRules, phase: archivePhase(event, today) };
}

function parseArchiveRows(rows: unknown, today: string): ArchivedEvent[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => toArchivedEvent(row, today))
    .filter((event): event is ArchivedEvent => event !== null);
}

/**
 * Newest first, by last playing day and then by name. The database already sorts this way; the
 * sort here keeps the fallback payloads (which are oldest first) on the same order and makes the
 * order a tested fact rather than an assumption about the payload.
 */
export function sortArchiveNewestFirst(events: readonly ArchivedEvent[]): ArchivedEvent[] {
  const lastDate = (event: ArchivedEvent) => event.dates.at(-1) ?? "";
  return [...events].sort((a, b) => {
    const byDate = lastDate(b).localeCompare(lastDate(a));
    if (byDate !== 0) return byDate;
    return b.name.localeCompare(a.name);
  });
}

export async function loadEventArchive(
  client: SupabaseClient<Database>,
  today: string,
): Promise<ArchivedEvent[] | null> {
  const archive = await client.rpc("public_event_archive");
  if (!archive.error && Array.isArray(archive.data)) {
    return sortArchiveNewestFirst(parseArchiveRows(archive.data, today));
  }

  const fallback = await loadShowcaseEvents(client, today);
  if (fallback === null) return null;
  return sortArchiveNewestFirst(
    fallback.map((event) => ({
      ...event,
      hasRules: false,
      phase: archivePhase(event, today),
    })),
  );
}
