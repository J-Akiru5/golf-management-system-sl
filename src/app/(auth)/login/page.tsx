import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { resendConfirmation, signInWithPassword } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const ERRORS: Record<string, string> = {
  credentials_required: "Enter your email and password.",
  sign_in_failed: "Sign-in failed. Check your details and try again.",
  invalid_credentials:
    "That email and password do not match an account. Use the email address on the account, not a username.",
  email_not_confirmed:
    "This account exists, but its email address has not been confirmed. Open the confirmation email, or send a new link below.",
  rate_limited: "Too many attempts. Wait a few minutes, then try again.",
  sign_in_disabled: "Sign-in is not available for this account. Ask the club owner to check it.",
  email_required: "Enter the email address on the account.",
  link_invalid: "That link is invalid or has expired. Request a new one.",
  sign_in_required: "Sign in to continue.",
  sign_up_credentials_required: "Enter an email address and a password to create an account.",
  sign_up_password_short: "Use at least 8 characters for your password.",
  sign_up_failed: "That account could not be created. If you already have one, sign in instead.",
  supabase_not_configured: "Supabase is not configured. The app is running in demo mode.",
};

const MESSAGES: Record<string, string> = {
  signed_out: "You have signed out.",
  check_email: "Check your email to confirm the account, then sign in here.",
  confirmation_sent:
    "If that address needs confirmation, a new link is on its way. Check the inbox and the spam folder.",
  reset_sent:
    "If that address has an account, we sent a reset link. Check your email and follow it on this device.",
  password_updated: "Your password was updated. Sign in with the new one.",
};

/**
 * One sign-in page for both audiences, because an account's area is decided by what it is: a
 * club_members row opens the desk, a linked member record opens the player area. See
 * `landingFor()` in src/lib/auth/routes.ts for the rule.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] : undefined;
  const message = params.message ? MESSAGES[params.message] : undefined;
  const configured = isSupabaseConfigured();
  const next = params.next ?? "/";

  return (
    <AuthShell
      title="Sign in"
      intro={
        <>
          Players see their own entry and start. Club staff open the tournament desk. The published{" "}
          <Link href="/pairings" className="underline underline-offset-2">
            pairings
          </Link>{" "}
          are open to everyone.
        </>
      }
    >
      <div className="card grid gap-4 sm:p-5">
        <form action={signInWithPassword} className="grid gap-3.5">
          <input type="hidden" name="next" value={next} />
          <label className="field">
            <span>Email</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <PasswordField
            id="password"
            name="password"
            label="Password"
            autoComplete="current-password"
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <label className="flex items-center gap-2.5 text-[13px]">
              <input type="checkbox" name="remember" />
              <span>Remember me on this device</span>
            </label>
            <Link
              href="/forgot-password"
              className="text-[13px] font-semibold underline underline-offset-2"
            >
              Forgot password?
            </Link>
          </div>
          {error && (
            <p className="notice bad" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="notice ok" role="status">
              {message}
            </p>
          )}
          <button type="submit" className="btn">
            Sign in
          </button>
        </form>

        {params.error === "email_not_confirmed" && (
          <form action={resendConfirmation} className="grid gap-2.5 border-t border-line pt-4">
            <p className="hint">
              Send a new confirmation link to the address on the account. The reply is the same
              whether or not the address needs one.
            </p>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <button type="submit" className="btn ghost">
              Send a new confirmation link
            </button>
          </form>
        )}

        <p className="border-t border-line pt-4 text-[13px]">
          New here?{" "}
          <Link href="/signup" className="font-semibold underline underline-offset-2">
            Create an account
          </Link>
        </p>
      </div>

      {!configured && (
        <p className="hint">
          Supabase is not configured in this build, so sign-in is off and the desk runs on demo
          data. <Link href="/admin">Open the desk in demo mode</Link>.
        </p>
      )}

      <p className="hint text-center">
        By Syntaxure Labs. <Link href="/">Club home</Link>
      </p>
    </AuthShell>
  );
}
