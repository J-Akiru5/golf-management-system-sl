/**
 * The public feedback write and the desk inbox read/write.
 *
 * The public side goes through `submit_feedback`, a SECURITY DEFINER function, so a visitor never
 * touches a club table. The desk side reads the table directly; RLS decides which club's rows are
 * visible and which role may change a status.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ConcernDetails, concernSummary } from "@/lib/data/concerns";
import {
  FEEDBACK_RESOLUTION_NOTE_MAX,
  type FeedbackNote,
  type FeedbackStatus,
  type FeedbackSubmission,
  normalizeFeedbackResolutionNote,
  parseFeedbackNote,
  sortFeedbackNewestFirst,
} from "@/lib/data/feedback";
import type { Database, Json } from "@/lib/supabase/types";

export type FeedbackSubmitCode =
  | "accepted"
  | "invalid_category"
  | "message_required"
  | "message_too_short"
  | "message_too_long"
  | "contact_name_too_long"
  | "contact_email_invalid"
  | "contact_email_required"
  | "consent_required"
  | "invalid_page"
  | "invalid_locale"
  | "invalid_event"
  | "no_concern"
  | "unknown_concern"
  | "hole_required"
  | "hole_out_of_range"
  | "tee_required"
  | "tee_unknown"
  | "other_required"
  | "too_long"
  | "bad_source"
  | "bad_transcript"
  | "rate_limited"
  | "not_configured"
  | "not_ready"
  | "error";

export interface FeedbackSubmitResult {
  ok: boolean;
  code: FeedbackSubmitCode;
  message: string;
}

export interface FeedbackInboxOptions {
  /** The newest N rows. Capped at 500 so one open page cannot pull an unbounded inbox. */
  limit?: number;
}

const SUBMIT_CODES: readonly FeedbackSubmitCode[] = [
  "accepted",
  "invalid_category",
  "message_required",
  "message_too_short",
  "message_too_long",
  "contact_name_too_long",
  "contact_email_invalid",
  "contact_email_required",
  "consent_required",
  "invalid_page",
  "invalid_locale",
  "invalid_event",
  "no_concern",
  "unknown_concern",
  "hole_required",
  "hole_out_of_range",
  "tee_required",
  "tee_unknown",
  "other_required",
  "too_long",
  "bad_source",
  "bad_transcript",
  "rate_limited",
  "not_configured",
  "not_ready",
  "error",
];

const NOT_READY_MESSAGE = "Feedback is not switched on yet. Please try again later.";
const GENERIC_FAILURE = "The note could not be sent. Check your connection and try again.";

/**
 * The columns the desk needs. The pseudonymous `rate_key` stays in the database; it is not part of
 * the payload a staff browser receives.
 */
const FEEDBACK_INBOX_COLUMNS =
  "id, club_id, tournament_id, category, message, details, contact_name, contact_email, contact_consent, page_path, locale, status, resolution_note, resolution_note_updated_at, resolution_note_updated_by, created_at, updated_at, status_changed_at, status_changed_by";

/**
 * The same list without the concern details, for a project that has not applied
 * 20261122000000 yet. The inbox then lists the notes and drops the concern panel rather than
 * failing to load at all.
 */
const FEEDBACK_INBOX_COLUMNS_BEFORE_CONCERNS =
  "id, club_id, tournament_id, category, message, contact_name, contact_email, contact_consent, page_path, locale, status, resolution_note, resolution_note_updated_at, resolution_note_updated_by, created_at, updated_at, status_changed_at, status_changed_by";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function submitCode(value: unknown): FeedbackSubmitCode {
  return typeof value === "string" && (SUBMIT_CODES as readonly string[]).includes(value)
    ? (value as FeedbackSubmitCode)
    : "error";
}

/** Reads the small JSON result of public.submit_feedback. The row is never part of it. */
export function parseFeedbackSubmitResult(value: Json | unknown): FeedbackSubmitResult {
  const raw = asRecord(value);
  const code = submitCode(raw.code);
  return {
    ok: raw.ok === true,
    code,
    message:
      typeof raw.message === "string" && raw.message.trim() !== ""
        ? raw.message
        : code === "accepted"
          ? "Thank you. The organizer will read your note."
          : GENERIC_FAILURE,
  };
}

/** A database that has not applied the migration answers with PGRST202 or a missing relation. */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  // A missing column is not a missing table: the follow-up migration has its own message.
  if (error.code === "42703") return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|schema cache/i.test(error.message ?? "")
  );
}

/** The MVP table exists but the follow-up columns have not reached the project yet. */
function isMissingFollowupColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" && /(tournament_id|resolution_note)/i.test(error.message ?? "");
}

/** The follow-ups are applied but the concern details are not: read the notes without them. */
function isMissingDetailsColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" && /details/i.test(error.message ?? "");
}

/**
 * A concern written out as plain text, for a project that cannot store the structured details yet.
 * Every ticked box and answer is kept, one per line, and the player's own message follows. Capped to
 * the column's 2000 characters.
 */
export function legacyConcernMessage(details: ConcernDetails, message?: string | null): string {
  const lines = [`Player concern: ${concernSummary(details)}`];
  if (details.playerName) lines.push(`Player name: ${details.playerName}`);
  if (details.handicap) lines.push(`Handicap: ${details.handicap}`);
  if (details.schedule) lines.push(`Schedule: ${details.schedule}`);
  lines.push(`Sent from: ${details.source === "chat" ? "the Teeo chat" : "the feedback form"}`);
  const text = message?.trim();
  if (text && text !== concernSummary(details)) lines.push("", text);
  return lines.join("\n").slice(0, 2000);
}

export async function submitFeedback(
  client: SupabaseClient<Database>,
  submission: FeedbackSubmission & {
    honeypot?: string;
    tournamentId?: string | null;
    details?: ConcernDetails | null;
  },
): Promise<FeedbackSubmitResult> {
  const { data, error } = await client.rpc("submit_feedback", {
    p_category: submission.category,
    p_message: submission.message,
    p_contact_name: submission.contactName,
    p_contact_email: submission.contactEmail,
    p_contact_consent: submission.contactConsent,
    p_page_path: submission.pagePath,
    p_locale: submission.locale,
    p_honeypot: submission.honeypot ?? "",
    // Null is a general note. The database checks the club and public visibility; the browser never
    // decides that an event is valid.
    p_tournament: submission.tournamentId ?? null,
    // The concern's ticked boxes and follow-up answers. Null for every other category; the
    // database re-checks the whole shape before it stores anything.
    p_details: submission.details ?? null,
  });

  if (error) {
    if (isMissingFunction(error) && submission.details) {
      // The live project has not run migration 20261122000000 yet, so `submit_feedback` has no
      // `p_details` and no `concern` category. Rather than turning a player away, the concern is
      // filed through the function the project already has, as a `content` note whose text carries
      // every ticked box and answer. The organizer reads the same facts; only the structure waits
      // for the migration.
      const legacy = await client.rpc("submit_feedback", {
        p_category: "content",
        p_message: legacyConcernMessage(submission.details, submission.message),
        p_contact_name: submission.contactName,
        p_contact_email: submission.contactEmail,
        p_contact_consent: submission.contactConsent,
        p_page_path: submission.pagePath,
        p_locale: submission.locale,
        p_honeypot: submission.honeypot ?? "",
        p_tournament: submission.tournamentId ?? null,
      } as never);
      if (!legacy.error) return parseFeedbackSubmitResult((legacy.data ?? {}) as Json);
      if (isMissingFunction(legacy.error)) {
        return { ok: false, code: "not_ready", message: NOT_READY_MESSAGE };
      }
      return { ok: false, code: "error", message: GENERIC_FAILURE };
    }
    if (isMissingFunction(error)) {
      return { ok: false, code: "not_ready", message: NOT_READY_MESSAGE };
    }
    // The public page does not echo a database message: it can name internals and is not useful to
    // a visitor. The form has its own translated fallback.
    return { ok: false, code: "error", message: GENERIC_FAILURE };
  }

  return parseFeedbackSubmitResult((data ?? {}) as Json);
}

/** The newest notes for one club. The caller has already passed the staff gate. */
export async function loadFeedbackInbox(
  client: SupabaseClient<Database>,
  clubId: string,
  options: FeedbackInboxOptions = {},
): Promise<FeedbackNote[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 300), 1), 500);
  const read = (columns: string) =>
    client
      .from("public_feedback")
      .select(columns)
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(limit);

  let { data, error } = await read(FEEDBACK_INBOX_COLUMNS);
  // A project without the concerns migration still gets its inbox: the notes are readable, only
  // the concern panel is missing from this payload.
  if (error && isMissingDetailsColumn(error)) {
    ({ data, error } = await read(FEEDBACK_INBOX_COLUMNS_BEFORE_CONCERNS));
  }

  if (error) {
    if (isMissingTable(error)) {
      throw new Error(
        "The feedback inbox is not available yet. The feedback migration has not been applied.",
      );
    }
    if (isMissingFollowupColumn(error)) {
      throw new Error(
        "The feedback inbox is not ready yet. The feedback follow-up migration has not been applied.",
      );
    }
    throw new Error(`Could not load feedback: ${error.message}`);
  }

  const notes = sortFeedbackNewestFirst(
    (data ?? [])
      .map((row) => parseFeedbackNote(row))
      .filter((note): note is FeedbackNote => note !== null),
  );

  // The note carries a tournament id, not a name. Load the names with a staff-authorized read so
  // the inbox can label a note without exposing the event anywhere public.
  const eventIds = notes.flatMap((note) => (note.tournamentId ? [note.tournamentId] : []));
  if (eventIds.length === 0) return notes;
  const names = await loadFeedbackEventNames(client, clubId, eventIds);
  return notes.map((note) =>
    note.tournamentId && names.has(note.tournamentId)
      ? { ...note, eventName: names.get(note.tournamentId) ?? note.eventName }
      : note,
  );
}

/**
 * The names of the events a set of notes points at. This is a staff read through RLS, scoped to the
 * caller's club. A name is context for the note; a failed names read must not hide the note itself,
 * so the inbox falls back to the id and stays usable.
 */
export async function loadFeedbackEventNames(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(tournamentIds.filter((id) => id !== ""))];
  if (ids.length === 0) return new Map();

  const { data, error } = await client
    .from("tournaments")
    .select("id, name")
    .eq("club_id", clubId)
    .in("id", ids);

  if (error) return new Map();

  const names = new Map<string, string>();
  for (const row of data ?? []) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (id !== "" && name !== "") names.set(id, name);
  }
  return names;
}

/**
 * Moves one note to a new status and returns the row the database kept. RLS allows an owner or
 * organizer only; a desk account gets a clear refusal instead of a silent no-op.
 */
export async function updateFeedbackStatus(
  client: SupabaseClient<Database>,
  clubId: string,
  id: string,
  status: FeedbackStatus,
): Promise<FeedbackNote> {
  const update = (columns: string) =>
    client
      .from("public_feedback")
      .update({ status })
      .eq("club_id", clubId)
      .eq("id", id)
      .select(columns)
      .maybeSingle();

  let { data, error } = await update(FEEDBACK_INBOX_COLUMNS);
  if (error && isMissingDetailsColumn(error)) {
    ({ data, error } = await update(FEEDBACK_INBOX_COLUMNS_BEFORE_CONCERNS));
  }

  if (error) {
    if (isMissingTable(error)) {
      throw new Error(
        "The feedback inbox is not available yet. The feedback migration has not been applied.",
      );
    }
    if (isMissingFollowupColumn(error)) {
      throw new Error(
        "The feedback inbox is not ready yet. The feedback follow-up migration has not been applied.",
      );
    }
    if (error.code === "42501") {
      throw new Error("Only an owner or organizer can change a feedback status.");
    }
    throw new Error(`Could not change the status: ${error.message}`);
  }

  const note = parseFeedbackNote(data);
  if (!note) {
    throw new Error("That note was not found, or this account cannot change its status.");
  }
  return note;
}

/**
 * Saves the organizer's private resolution note. The column grant, the update policy and the trigger
 * all allow an owner or organizer; a desk account gets a clear refusal.
 */
export async function updateFeedbackResolution(
  client: SupabaseClient<Database>,
  clubId: string,
  id: string,
  resolutionNote: string | null,
): Promise<FeedbackNote> {
  const normalized = normalizeFeedbackResolutionNote(resolutionNote);
  if (!normalized.ok) {
    throw new Error(
      `Keep the resolution note to ${FEEDBACK_RESOLUTION_NOTE_MAX} characters or fewer.`,
    );
  }

  const update = (columns: string) =>
    client
      .from("public_feedback")
      .update({ resolution_note: normalized.value })
      .eq("club_id", clubId)
      .eq("id", id)
      .select(columns)
      .maybeSingle();

  let { data, error } = await update(FEEDBACK_INBOX_COLUMNS);
  if (error && isMissingDetailsColumn(error)) {
    ({ data, error } = await update(FEEDBACK_INBOX_COLUMNS_BEFORE_CONCERNS));
  }

  if (error) {
    if (isMissingTable(error)) {
      throw new Error(
        "The feedback inbox is not available yet. The feedback migration has not been applied.",
      );
    }
    if (isMissingFollowupColumn(error)) {
      throw new Error(
        "The feedback inbox is not ready yet. The feedback follow-up migration has not been applied.",
      );
    }
    if (error.code === "42501") {
      throw new Error("Only an owner or organizer can change a resolution note.");
    }
    throw new Error(`Could not save the resolution note: ${error.message}`);
  }

  const note = parseFeedbackNote(data);
  if (!note) {
    throw new Error("That note was not found, or this account cannot change its resolution note.");
  }
  return note;
}

/**
 * The private count for the desk badge. RLS still limits the rows to the caller's club; a database
 * without the feedback table answers zero rather than breaking the shell.
 */
export async function countNewFeedback(
  client: SupabaseClient<Database>,
  clubId: string,
): Promise<number> {
  const { count, error } = await client
    .from("public_feedback")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .eq("status", "new");

  if (error) {
    if (isMissingTable(error)) return 0;
    throw new Error(`Could not count feedback: ${error.message}`);
  }
  return typeof count === "number" && count > 0 ? count : 0;
}
