/**
 * The optional feedback digest. This module is pure: it builds the short body and the stable dedupe
 * key. The API route owns the session, the outbox insert and the provider. Nothing here claims that
 * mail was delivered.
 */
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/data/feedback";

export interface FeedbackDigestNote {
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  createdAt: string;
}

export interface FeedbackDigest {
  subject: string;
  body: string;
  newCount: number;
  plannedCount: number;
}

const EXCERPT_MAX = 160;
const DEFAULT_NOTE_LIMIT = 12;

function excerpt(message: string): string {
  const text = message.replace(/\s+/g, " ").trim();
  if (text.length <= EXCERPT_MAX) return text;
  return `${text.slice(0, EXCERPT_MAX).trimEnd()}…`;
}

function dayOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * A short digest of the notes still waiting on the team. The body never carries contact details:
 * the recipient already has the inbox for that.
 */
export function buildFeedbackDigest(
  notes: readonly FeedbackDigestNote[],
  options: { day: string; limit?: number },
): FeedbackDigest | null {
  const relevant = notes.filter((note) => note.status === "new" || note.status === "planned");
  if (relevant.length === 0) return null;

  const newCount = relevant.filter((note) => note.status === "new").length;
  const plannedCount = relevant.filter((note) => note.status === "planned").length;
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_NOTE_LIMIT), 1), 50);
  const shown = relevant.slice(0, limit);

  const lines = shown.map((note) => {
    const day = dayOf(note.createdAt);
    const prefix = day ? `${day}, ` : "";
    return `- ${FEEDBACK_CATEGORY_LABELS[note.category]} (${note.status}), ${prefix}${excerpt(note.message)}`;
  });
  const remaining = relevant.length - shown.length;
  if (remaining > 0) lines.push(`- ...and ${plural(remaining, "more note")}.`);

  return {
    subject: `Feedback digest for ${options.day}`,
    body: [
      `${plural(newCount, "new note")} and ${plural(plannedCount, "planned note")} in the feedback inbox.`,
      `Latest notes:\n${lines.join("\n")}`,
      "Open the desk feedback inbox to read and triage them. Contact details are not included in this digest.",
    ].join("\n\n"),
    newCount,
    plannedCount,
  };
}

/** One digest per club per day. The unique (club_id, dedupe_key) index makes a retry harmless. */
export function feedbackDigestDedupeKey(clubId: string, day: string): string {
  return `feedback_digest:${clubId.trim()}:${day.trim()}`;
}
