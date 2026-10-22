/**
 * Maps the provider's sign-in failure to the message the person actually needs.
 *
 * Supabase returns "Invalid login credentials" for a wrong email/password, and "Email not
 * confirmed" for an account that exists but cannot sign in yet. Collapsing both into "Sign-in
 * failed" is what made a phone report unusable: the person kept retrying a password that was
 * correct while the real problem was an unconfirmed address.
 */
export type SignInErrorCode =
  | "email_not_confirmed"
  | "invalid_credentials"
  | "rate_limited"
  | "sign_in_disabled"
  | "sign_in_failed";

export function signInErrorCode(message: string): SignInErrorCode {
  const text = message.toLowerCase();
  if (/email not confirmed|not confirmed/.test(text)) return "email_not_confirmed";
  if (/invalid login credentials|invalid credentials/.test(text)) return "invalid_credentials";
  if (/rate limit|too many requests|security purposes/.test(text)) return "rate_limited";
  if (/signups not allowed|signup disabled|signups disabled/.test(text)) return "sign_in_disabled";
  return "sign_in_failed";
}
