/**
 * The database errors a member change can raise, and the plain sentence each one becomes.
 *
 * The codes match what `supabase/migrations/20261120000100_workspace_members.sql` raises:
 * 42501 permission denied, P0002 no account for that email, 23505 duplicate, 23514 check
 * violation (used for the last active owner). Anything else is unknown and says so.
 */
export type MemberErrorCode = "42501" | "P0002" | "23505" | "23514";

export const MEMBER_ERROR_MESSAGES = {
  denied: "Only an owner can do that.",
  noAccount:
    "No account has that email address. Create the account in Supabase first, then add them here.",
  duplicate: "That person is already a member.",
  lastOwner: "The workspace needs at least one active owner.",
  unknown: "Something went wrong. Nothing was changed.",
} as const;

/** An error that carries the database code, so a caller can map it back to a sentence. */
export type CodedError = Error & { code?: string };

export function memberError(code: MemberErrorCode, message: string = code): Error {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
}

/** The code on an error, whoever produced it, or null when it has none. */
export function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function mapMemberError(error: unknown): string {
  switch (codeOf(error)) {
    case "42501":
      return MEMBER_ERROR_MESSAGES.denied;
    case "P0002":
      return MEMBER_ERROR_MESSAGES.noAccount;
    case "23505":
      return MEMBER_ERROR_MESSAGES.duplicate;
    case "23514":
      return MEMBER_ERROR_MESSAGES.lastOwner;
    default:
      return MEMBER_ERROR_MESSAGES.unknown;
  }
}

/**
 * What a server action hands back to a form. The message is always safe to show: it comes from
 * mapMemberError or from a validation rule, never from a raw database error.
 */
export type ActionResult = { ok: true; message: string } | { ok: false; message: string };
