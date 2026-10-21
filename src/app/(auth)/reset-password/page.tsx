import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { updatePassword } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  password_short: "Use at least 8 characters.",
  password_mismatch: "The two passwords do not match.",
  update_failed: "The password could not be updated. Request a new link and try again.",
  reset_session: "This reset link has expired. Request a new one.",
  supabase_not_configured: "Email is off in this build because Supabase is not configured.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] : undefined;
  const configured = isSupabaseConfigured();
  let signedIn = false;
  if (configured) {
    try {
      const client = await createSupabaseServerClient();
      const { data } = await client.auth.getUser();
      signedIn = Boolean(data.user);
    } catch {
      signedIn = false;
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      intro={
        signedIn
          ? "Use at least 8 characters. You will sign in again with the new password."
          : "Open the reset link from your email to continue. Links expire, and each one works once."
      }
    >
      <div className="card grid gap-4 sm:p-5">
        {signedIn ? (
          <form action={updatePassword} className="grid gap-3.5">
            <PasswordField
              id="new-password"
              name="password"
              label="New password"
              autoComplete="new-password"
              minLength={8}
            />
            <PasswordField
              id="confirm-password"
              name="confirm"
              label="Confirm new password"
              autoComplete="new-password"
              minLength={8}
            />
            {error && (
              <p className="notice bad" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn">
              Update password
            </button>
          </form>
        ) : (
          <div className="grid gap-3">
            {error && (
              <p className="notice bad" role="alert">
                {error}
              </p>
            )}
            <p className="hint">
              Open the link in the same browser you used to request it. If it opened inside an email
              app, copy it into that browser.
            </p>
            <Link href="/forgot-password" className="btn">
              Request a new link
            </Link>
          </div>
        )}
        <p className="hint">
          <Link href="/login">Back to sign in</Link>.
        </p>
      </div>

      {!configured && (
        <p className="hint">
          Supabase is not configured in this build, so passwords cannot be changed here.
        </p>
      )}
    </AuthShell>
  );
}
