/**
 * Public feedback: validation, normalisation, parsing and the inbox filters.
 *
 * This module is pure. The database and the browser both use the same limits, so a note that the
 * form accepts is one the function will also accept, and the two cannot drift apart silently.
 *
 * The status names match `public.public_feedback.status`; the category names match its `category`
 * check. They are repeated here rather than inferred from a generated type so the form can be built
 * and tested without a Supabase client.
 */
import type { TranslationKey } from "@/lib/i18n/t";

export const FEEDBACK_CATEGORIES = ["improvement", "bug", "content"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = ["new", "read", "planned", "done", "dismissed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_LOCALES = ["en", "tl", "hil"] as const;
export type FeedbackLocale = (typeof FEEDBACK_LOCALES)[number];

export const FEEDBACK_MESSAGE_MIN = 3;
export const FEEDBACK_MESSAGE_MAX = 2000;
export const FEEDBACK_CONTACT_NAME_MAX = 120;
export const FEEDBACK_CONTACT_EMAIL_MAX = 254;
export const FEEDBACK_PAGE_PATH_MAX = 300;
/** The organizer's private answer to the team. Mirrors the column check. */
export const FEEDBACK_RESOLUTION_NOTE_MAX = 2000;

/** Mirrors the bucket in public.submit_feedback: five notes in ten minutes, per connection. */
export const FEEDBACK_RATE_LIMIT = 5;
export const FEEDBACK_RATE_WINDOW_MINUTES = 10;

/**
 * The hidden field. It is off-screen and out of the tab order, so a person does not fill it. A bot
 * that fills every input gets a neutral success and no row.
 */
export const FEEDBACK_HONEYPOT_FIELD = "website";

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  improvement: "Improvement",
  bug: "Bug",
  content: "Content",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  read: "Read",
  planned: "Planned",
  done: "Done",
  dismissed: "Dismissed",
};

/** The public form's translated labels, keyed by the stored category. */
export const FEEDBACK_CATEGORY_KEYS: Record<FeedbackCategory, TranslationKey> = {
  improvement: "feedback.categoryImprovement",
  bug: "feedback.categoryBug",
  content: "feedback.categoryContent",
};

/** The public form's translated problems, keyed by the code this module returns. */
export type FeedbackProblem =
  | "category"
  | "messageRequired"
  | "messageTooShort"
  | "messageTooLong"
  | "contactNameTooLong"
  | "contactEmailInvalid"
  | "consentRequired"
  | "pagePathInvalid"
  | "locale";

export interface FeedbackDraft {
  category: string;
  message: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactConsent: boolean;
  pagePath?: string | null;
  locale: string;
  honeypot?: string;
}

export interface FeedbackSubmission {
  category: FeedbackCategory;
  message: string;
  contactName: string | null;
  contactEmail: string | null;
  contactConsent: boolean;
  pagePath: string | null;
  locale: FeedbackLocale;
}

export type FeedbackValidation =
  | { ok: true; kind: "submission"; value: FeedbackSubmission }
  | { ok: true; kind: "honeypot" }
  | { ok: false; error: FeedbackProblem };

export interface FeedbackNote {
  id: string;
  clubId: string;
  /** The public event the note is about, or null for general site feedback. */
  tournamentId: string | null;
  /** The event's display name, loaded by the staff inbox. Null when there is no event link. */
  eventName: string | null;
  category: FeedbackCategory;
  message: string;
  contactName: string | null;
  contactEmail: string | null;
  contactConsent: boolean;
  pagePath: string | null;
  locale: FeedbackLocale;
  status: FeedbackStatus;
  /** Organizer-only. Never part of a public read. */
  resolutionNote: string | null;
  resolutionNoteUpdatedAt: string | null;
  resolutionNoteUpdatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
}

export interface FeedbackFilters {
  status: FeedbackStatus | "all";
  category: FeedbackCategory | "all";
  /** A tournament id, or "all". A note with no event stays visible under "all". */
  event: string | "all";
  query: string;
}

export const DEFAULT_FEEDBACK_FILTERS: FeedbackFilters = {
  status: "all",
  category: "all",
  event: "all",
  query: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableText(value: unknown): string | null {
  const text = asText(value);
  return text === "" ? null : text;
}

function firstValue(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return typeof value === "string" && (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

export function isFeedbackLocale(value: unknown): value is FeedbackLocale {
  return typeof value === "string" && (FEEDBACK_LOCALES as readonly string[]).includes(value);
}

export function normalizeFeedbackCategory(value: unknown): FeedbackCategory | null {
  if (typeof value !== "string") return null;
  const category = value.trim().toLowerCase();
  return isFeedbackCategory(category) ? category : null;
}

export function normalizeFeedbackStatus(value: unknown): FeedbackStatus | null {
  if (typeof value !== "string") return null;
  const status = value.trim().toLowerCase();
  return isFeedbackStatus(status) ? status : null;
}

export function normalizeFeedbackLocale(value: unknown): FeedbackLocale | null {
  if (typeof value !== "string") return null;
  const locale = value.trim().toLowerCase();
  return isFeedbackLocale(locale) ? locale : null;
}

/**
 * A page path is stored for context only. It is reduced to the pathname so a query string or a
 * fragment cannot carry a name or an address into the inbox by accident. Anything that is not a
 * single absolute path is refused.
 */
export function normalizePagePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw === "") return null;
  const path = raw.split(/[?#]/, 1)[0] ?? "";
  if (
    path === "" ||
    path.length > FEEDBACK_PAGE_PATH_MAX ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    return null;
  }
  return path;
}

/**
 * A public event id is context, not content. Only a UUID shape is passed to the RPC, so a malformed
 * query parameter is dropped before it reaches the database. The RPC still checks the club and the
 * public visibility; this function never looks an event up and cannot leak a private one.
 */
export function normalizeFeedbackTournamentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

export type FeedbackResolutionProblem = "tooLong";

export type FeedbackResolution =
  | { ok: true; value: string | null }
  | { ok: false; error: FeedbackResolutionProblem };

/** Trims a resolution note and treats an empty note as a cleared one. */
export function normalizeFeedbackResolutionNote(value: unknown): FeedbackResolution {
  const text = asNullableText(value);
  if (text === null) return { ok: true, value: null };
  if (text.length > FEEDBACK_RESOLUTION_NOTE_MAX) return { ok: false, error: "tooLong" };
  return { ok: true, value: text };
}

/** The private badge count: notes still in `new`. Never shown on a public page. */
export function countNewFeedbackNotes(notes: readonly FeedbackNote[]): number {
  return notes.reduce((count, note) => (note.status === "new" ? count + 1 : count), 0);
}

export function isValidFeedbackEmail(value: string): boolean {
  const email = value.trim();
  return (
    email.length > 0 && email.length <= FEEDBACK_CONTACT_EMAIL_MAX && EMAIL_PATTERN.test(email)
  );
}

export function isFeedbackRateLimited(recentCount: number): boolean {
  return Number.isFinite(recentCount) && recentCount >= FEEDBACK_RATE_LIMIT;
}

/** The database policy allows an owner or organizer to triage; the desk reads only. */
export function canTriageFeedback(role: string | null | undefined): boolean {
  return role === "owner" || role === "organizer";
}

export function validateFeedback(draft: FeedbackDraft): FeedbackValidation {
  // A filled honeypot is a bot. The caller shows the same success as a real note and sends nothing.
  if (typeof draft.honeypot === "string" && draft.honeypot.trim() !== "") {
    return { ok: true, kind: "honeypot" };
  }

  const category = normalizeFeedbackCategory(draft.category);
  if (!category) return { ok: false, error: "category" };

  const message = typeof draft.message === "string" ? draft.message.trim() : "";
  if (message === "") return { ok: false, error: "messageRequired" };
  if (message.length < FEEDBACK_MESSAGE_MIN) return { ok: false, error: "messageTooShort" };
  if (message.length > FEEDBACK_MESSAGE_MAX) return { ok: false, error: "messageTooLong" };

  const contactName = asNullableText(draft.contactName);
  if (contactName && contactName.length > FEEDBACK_CONTACT_NAME_MAX) {
    return { ok: false, error: "contactNameTooLong" };
  }

  const contactEmail = asNullableText(draft.contactEmail)?.toLowerCase() ?? null;
  if (contactEmail && !isValidFeedbackEmail(contactEmail)) {
    return { ok: false, error: "contactEmailInvalid" };
  }

  const hasContact = contactName !== null || contactEmail !== null;
  if (hasContact && draft.contactConsent !== true) {
    return { ok: false, error: "consentRequired" };
  }

  let pagePath: string | null = null;
  const rawPagePath = asText(draft.pagePath);
  if (rawPagePath !== "") {
    pagePath = normalizePagePath(rawPagePath);
    if (pagePath === null) return { ok: false, error: "pagePathInvalid" };
  }

  const locale = normalizeFeedbackLocale(draft.locale);
  if (!locale) return { ok: false, error: "locale" };

  return {
    ok: true,
    kind: "submission",
    value: {
      category,
      message,
      contactName: hasContact ? contactName : null,
      contactEmail: hasContact ? contactEmail : null,
      contactConsent: hasContact,
      pagePath,
      locale,
    },
  };
}

/**
 * Reads one row returned by the inbox. An unknown category, status or locale is dropped rather than
 * guessed, and the row is not shown. The parser also accepts the raw database shape, so a caller
 * cannot forget to map a column.
 */
export function parseFeedbackNote(value: unknown): FeedbackNote | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  const id = asNullableText(row.id);
  const clubId = asNullableText(row.club_id);
  const category = normalizeFeedbackCategory(row.category);
  const message = typeof row.message === "string" ? row.message.trim() : "";
  const locale = normalizeFeedbackLocale(row.locale);
  const status = normalizeFeedbackStatus(row.status);
  const createdAt = asNullableText(row.created_at);
  const updatedAt = asNullableText(row.updated_at);

  if (
    !id ||
    !clubId ||
    !category ||
    message === "" ||
    !locale ||
    !status ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    clubId,
    tournamentId: asNullableText(row.tournament_id),
    eventName: asNullableText(row.event_name),
    category,
    message,
    contactName: asNullableText(row.contact_name),
    contactEmail: asNullableText(row.contact_email),
    contactConsent: row.contact_consent === true,
    pagePath: normalizePagePath(row.page_path),
    locale,
    status,
    resolutionNote: asNullableText(row.resolution_note),
    resolutionNoteUpdatedAt: asNullableText(row.resolution_note_updated_at),
    resolutionNoteUpdatedBy: asNullableText(row.resolution_note_updated_by),
    createdAt,
    updatedAt,
    statusChangedAt: asNullableText(row.status_changed_at),
    statusChangedBy: asNullableText(row.status_changed_by),
  };
}

function parseFilterStatus(value: string | string[] | null | undefined): FeedbackStatus | "all" {
  const text = firstValue(value);
  return normalizeFeedbackStatus(text) ?? "all";
}

function parseFilterCategory(
  value: string | string[] | null | undefined,
): FeedbackCategory | "all" {
  const text = firstValue(value);
  return normalizeFeedbackCategory(text) ?? "all";
}

function parseFilterEvent(value: string | string[] | null | undefined): string | "all" {
  const text = firstValue(value);
  return normalizeFeedbackTournamentId(text) ?? "all";
}

/**
 * Reads `?status=`, `?category=`, `?event=` and `?q=` into the inbox filter state. Junk falls back to
 * all. An invalid event id is dropped rather than used as a filter that silently matches nothing.
 */
export function parseFeedbackFilters(input: {
  status?: string | string[] | null;
  category?: string | string[] | null;
  event?: string | string[] | null;
  q?: string | string[] | null;
}): FeedbackFilters {
  return {
    status: parseFilterStatus(input.status),
    category: parseFilterCategory(input.category),
    event: parseFilterEvent(input.event),
    query: (firstValue(input.q) ?? "").trim(),
  };
}

export function matchesFeedbackFilters(note: FeedbackNote, filters: FeedbackFilters): boolean {
  if (filters.status !== "all" && note.status !== filters.status) return false;
  if (filters.category !== "all" && note.category !== filters.category) return false;
  if (filters.event !== "all" && note.tournamentId !== filters.event) return false;
  const query = filters.query.trim().toLowerCase();
  if (query === "") return true;
  return [
    note.message,
    note.contactName ?? "",
    note.contactEmail ?? "",
    note.pagePath ?? "",
    note.eventName ?? "",
  ].some((value) => value.toLowerCase().includes(query));
}

export function filterFeedback(
  notes: readonly FeedbackNote[],
  filters: FeedbackFilters,
): FeedbackNote[] {
  return notes.filter((note) => matchesFeedbackFilters(note, filters));
}

/**
 * Newest first, with the id as the tie-break so two notes saved in the same instant keep a stable
 * order. The inbox query already sorts, but a test or an optimistic update may not.
 */
export function sortFeedbackNewestFirst(notes: readonly FeedbackNote[]): FeedbackNote[] {
  return [...notes].sort((a, b) => {
    const left = Date.parse(a.createdAt);
    const right = Date.parse(b.createdAt);
    const leftTime = Number.isNaN(left) ? 0 : left;
    const rightTime = Number.isNaN(right) ? 0 : right;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return b.id.localeCompare(a.id);
  });
}

/** The statuses an owner or organizer can choose, in the order the desk shows them. */
export function feedbackStatusChoices(): FeedbackStatus[] {
  return [...FEEDBACK_STATUSES];
}
