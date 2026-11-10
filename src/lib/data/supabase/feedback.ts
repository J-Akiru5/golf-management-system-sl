/**
 * The public feedback write and the desk inbox read/write.
 *
 * The public side goes through `submit_feedback`, a SECURITY DEFINER function, so a visitor never
 * touches a club table. The desk side reads the table directly; RLS decides which club's rows are
 * visible and which role may change a status.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
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
  | "consent_required"
  | "invalid_page"
  | "invalid_locale"
  | "invalid_event"
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
  "consent_required",
  "invalid_page",
  "invalid_locale",
  "invalid_event",
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

export async function submitFeedback(
  client: SupabaseClient<Database>,
  submission: FeedbackSubmission & { honeypot?: string; tournamentId?: string | null },
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
  });

  if (error) {
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
  const { data, error } = await client
    .from("public_feedback")
    .select(FEEDBACK_INBOX_COLUMNS)
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(limit);

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
  const { data, error } = await client
    .from("public_feedback")
    .update({ status })
    .eq("club_id", clubId)
    .eq("id", id)
    .select(FEEDBACK_INBOX_COLUMNS)
    .maybeSingle();

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

  const { data, error } = await client
    .from("public_feedback")
    .update({ resolution_note: normalized.value })
    .eq("club_id", clubId)
    .eq("id", id)
    .select(FEEDBACK_INBOX_COLUMNS)
    .maybeSingle();

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
