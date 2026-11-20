/**
 * The confirmed concern: validate it again, then file it through `submit_feedback`.
 *
 * The chat's note is stored as `category = 'concern'` with the structured details in `p_details`
 * (migration 20261122000000) and the conversation inside them. The submit route re-validates with
 * `normaliseConcern`, the same function the tick-box form uses, so a note the chat assembled is one
 * the database accepts. The client's `source` is overwritten with "chat" here: a browser cannot file
 * a chat note as a form note, or the other way round.
 *
 * The success reply is neutral and carries no stored row.
 */

import {
  type ConcernDetails,
  type ConcernProblem,
  concernSummary,
  normaliseConcern,
} from "@/lib/data/concerns";
import { normalizePagePath } from "@/lib/data/feedback";
import { legacyConcernMessage, parseFeedbackSubmitResult } from "@/lib/data/supabase/feedback";
import { type ChatLocale, chatLocaleFromAppLocale, isChatLocale } from "./copy";

/** The three values `public_feedback.locale` accepts today. */
export type FeedbackLocale = "en" | "tl" | "hil";

export type ConcernSubmitProblem = ConcernProblem | "not_configured" | "error";

export interface ConcernSubmitInput {
  details: unknown;
  transcript?: unknown;
  locale?: unknown;
  pagePath?: unknown;
  honeypot?: unknown;
}

export interface PreparedConcern {
  /** The cleaned, contract-shaped note. Includes the transcript when one was sent. */
  details: ConcernDetails;
  /** The one-line English summary the inbox and the email alert show. */
  message: string;
  /** The site locale the feedback table stores. */
  locale: FeedbackLocale;
  /** The language the player actually used, including Cebuano. */
  language: ChatLocale;
  pagePath: string | null;
  honeypot: string;
}

export type PrepareConcernResult =
  | { ok: true; prepared: PreparedConcern }
  | { ok: false; problem: ConcernSubmitProblem };

/**
 * The feedback table's locale check predates Cebuano, so a Cebuano note is filed under the neutral
 * default. The transcript it carries is in the player's own words either way.
 */
function feedbackLocaleFor(language: ChatLocale): FeedbackLocale {
  return language === "ceb" ? "en" : language;
}

export function prepareConcernSubmission(input: ConcernSubmitInput): PrepareConcernResult {
  if (typeof input.details !== "object" || input.details === null || Array.isArray(input.details)) {
    return { ok: false, problem: "no_concern" };
  }

  const candidate: Record<string, unknown> = { ...(input.details as Record<string, unknown>) };
  // Never trust the client for the source: this route only files chat notes.
  candidate.source = "chat";
  if (input.transcript !== undefined) candidate.transcript = input.transcript;

  const checked = normaliseConcern(candidate);
  if (!checked.ok) return { ok: false, problem: checked.problem };

  const language = isChatLocale(input.locale)
    ? input.locale
    : chatLocaleFromAppLocale(input.locale);

  return {
    ok: true,
    prepared: {
      details: checked.details,
      message: concernSummary(checked.details),
      locale: feedbackLocaleFor(language),
      language,
      pagePath: normalizePagePath(input.pagePath),
      honeypot: typeof input.honeypot === "string" ? input.honeypot.trim().slice(0, 200) : "",
    },
  };
}

/**
 * The one function this module calls. Narrow on purpose: `p_details` is added by migration
 * 20261122000000 and the generated types catch up when it is applied, so the call is described here
 * instead of editing a shared types file this work does not own.
 */
export interface ConcernSubmitRpcClient {
  rpc(
    fn: "submit_feedback",
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export type ConcernSubmitOutcome =
  | { ok: true; message: string }
  | { ok: false; code: "not_ready" | "rate_limited" | "invalid" | "error"; message: string };

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

export async function submitConcernNote(
  client: ConcernSubmitRpcClient,
  prepared: PreparedConcern,
): Promise<ConcernSubmitOutcome> {
  if (prepared.honeypot !== "") {
    // A filled honeypot gets the ordinary success and writes nothing.
    return { ok: true, message: "Thank you. The organizer will read your note." };
  }

  const first = await client.rpc("submit_feedback", {
    p_category: "concern",
    p_message: prepared.message,
    p_contact_name: null,
    p_contact_email: null,
    p_contact_consent: false,
    p_page_path: prepared.pagePath,
    p_locale: prepared.locale,
    p_honeypot: prepared.honeypot,
    p_tournament: null,
    p_details: prepared.details,
  });
  let { data, error } = first;

  // A project that has not run migration 20261122000000 has no `p_details` and no `concern`
  // category. The note still reaches the organizer: it is filed through the function the project
  // already has, as a `content` note whose text carries every answer (the same fallback as the
  // tick-box form). The transcript waits for the migration.
  if (error && isMissingFunction(error)) {
    ({ data, error } = await client.rpc("submit_feedback", {
      p_category: "content",
      p_message: legacyConcernMessage(prepared.details, prepared.message),
      p_contact_name: null,
      p_contact_email: null,
      p_contact_consent: false,
      p_page_path: prepared.pagePath,
      p_locale: prepared.locale,
      p_honeypot: prepared.honeypot,
      p_tournament: null,
    }));
  }

  if (error) {
    if (isMissingFunction(error)) {
      return {
        ok: false,
        code: "not_ready",
        message: "The inbox is not switched on yet. Please use the form instead.",
      };
    }
    // The public route does not echo a database message: it can name internals and is not useful
    // to a player.
    return {
      ok: false,
      code: "error",
      message: "The note could not be sent. Please try again.",
    };
  }

  const parsed = parseFeedbackSubmitResult(data);
  if (parsed.ok) return { ok: true, message: parsed.message };

  switch (parsed.code) {
    case "rate_limited":
      return { ok: false, code: "rate_limited", message: parsed.message };
    case "not_configured":
    case "not_ready":
      return { ok: false, code: "not_ready", message: parsed.message };
    case "invalid_category":
    case "message_required":
    case "message_too_short":
    case "message_too_long":
    case "contact_name_too_long":
    case "contact_email_invalid":
    case "consent_required":
    case "invalid_page":
    case "invalid_locale":
    case "invalid_event":
      return { ok: false, code: "invalid", message: parsed.message };
    default:
      return { ok: false, code: "error", message: parsed.message };
  }
}
