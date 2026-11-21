/**
 * The public entry form's own payload rules.
 *
 * The form carries one field a person never sees: a honeypot that a script fills in. The server
 * treats a filled honeypot as an ordinary submission and writes nothing, so the form sends it
 * unchanged and the player sees the same confirmation either way. Keeping the rule here, away from
 * the component, is what makes it testable without a browser.
 */
import type { SubmissionPlayer } from "./supabase/public-registration";

/** The honeypot's field name. It is not a player detail and is never stored on the player row. */
export const ENTRY_HONEYPOT_FIELD = "entry_do_not_fill";

const HONEYPOT_MAX_LENGTH = 200;

/** Trimmed and bounded, and empty when the field was not filled. */
export function normaliseEntryHoneypot(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, HONEYPOT_MAX_LENGTH);
}

/**
 * The player payload to send. The honeypot is added only when it was filled, so an ordinary
 * submission carries exactly the fields it always did.
 */
export function entryPlayerPayload(player: SubmissionPlayer, honeypot: unknown): SubmissionPlayer {
  const trap = normaliseEntryHoneypot(honeypot);
  return trap === "" ? player : { ...player, honeypot: trap };
}
