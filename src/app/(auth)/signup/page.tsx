import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordStrengthField } from "@/components/auth/PasswordStrengthField";
import { signUpWithPassword } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-strength";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Create an account" };

const ERRORS: Record<string, string> = {
  name_required: "Enter the name you want on the account.",
  credentials_required: "Enter an email address and a password.",
  password_short: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
  password_common: "That password is one of the most commonly used. Choose something else.",
  password_mismatch: "The two passwords do not match.",
  sign_up_failed: "That account could not be created. If you already have one, sign in instead.",
  rate_limited: "Too many attempts from this connection. Wait a few minutes, then try again.",
  supabase_not_configured: "Accounts are not available in this build.",
};

/**
 * Creating an account, on its own page.
 *
 * It used to be a disclosure inside the sign-in form, which meant the rules were hidden until it was
 * opened and there was nowhere to put a strength meter or a confirmation field. A dedicated page can
 * say what the account is for before asking for anything.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] : undefined;
  const configured = isSupabaseConfigured();

  return (
    <AuthShell
      title="Create an account"
      intro={
        <>
          One account, for your own entry and your tee time. After you sign in, link your club
          record with your NGAP number and birthdate. If that does not work, the desk can link it
          for you.
        </>
      }
    >
      <div className="card grid gap-4 sm:p-5">
        {configured ? (
          <form action={signUpWithPassword} className="grid gap-3.5">
            <label className="field">
              <span>Your name</span>
              <input
                name="displayName"
                type="text"
                autoComplete="name"
                required
                defaultValue={params.email ? undefined : undefined}
              />
            </label>

            <label className="field">
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={params.email ?? ""}
              />
            </label>

            <PasswordStrengthField name="password" label="Password" />

            <label className="field">
              <span>Confirm password</span>
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
            </label>

            {error && (
              <p className="notice bad" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn">
              Create account
            </button>

            <p className="hint m-0">
              Club staff accounts are created by the club, not here. An account with no matched
              record can still sign in; the desk can link it to your entry.
            </p>
          </form>
        ) : (
          <p className="notice" role="status">
            Accounts are not available in this build, because it has no connection to the
            club&apos;s database. You can still{" "}
            <Link href="/pairings" className="font-semibold underline underline-offset-2">
              view the published pairings
            </Link>
            .
          </p>
        )}

        <p className="border-t border-line pt-4 text-[13px]">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>

      <p className="hint text-center">
        By creating an account you accept the{" "}
        <Link href="/terms" className="underline underline-offset-2">
          terms of service
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          privacy policy
        </Link>
        .
      </p>
    </AuthShell>
  );
}
