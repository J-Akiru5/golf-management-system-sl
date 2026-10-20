import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { requestPasswordReset } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const ERRORS: Record<string, string> = {
  email_required: "Enter the email address on your account.",
  reset_failed: "We could not send the email. Wait a minute and try again.",
  supabase_not_configured: "Email is off in this build because Supabase is not configured.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] : undefined;
  const configured = isSupabaseConfigured();

  return (
    <AuthShell
      title="Reset your password"
      intro="Enter the email on your account. If it matches, we will send a reset link that works once."
    >
      <div className="card grid gap-4 sm:p-5">
        <form action={requestPasswordReset} className="grid gap-3.5">
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required autoFocus />
          </label>
          {error && (
            <p className="notice bad" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn" disabled={!configured}>
            Send reset link
          </button>
        </form>
        <p className="hint">
          Remembered it? <Link href="/login">Back to sign in</Link>.
        </p>
        <p className="hint">
          Open the email on this device, in the same browser you used to request it. A link opened
          inside an email app&apos;s built-in browser can fail because the session started in the
          other browser. If that happens, copy the link into this browser.
        </p>
      </div>

      {!configured && (
        <p className="hint">Supabase is not configured in this build, so no email can be sent.</p>
      )}
    </AuthShell>
  );
}
