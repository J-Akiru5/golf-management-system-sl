import Link from "next/link";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { signInWithPassword, signUpWithPassword } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const ERRORS: Record<string, string> = {
  credentials_required: "Enter your email and password.",
  sign_in_failed: "Sign-in failed. Check your details and try again.",
  sign_in_required: "Sign in to continue.",
  sign_up_credentials_required: "Enter an email address and a password to create an account.",
  sign_up_password_short: "Use at least 8 characters for your password.",
  sign_up_failed: "That account could not be created. If you already have one, sign in instead.",
  supabase_not_configured: "Supabase is not configured. The app is running in demo mode.",
};

const MESSAGES: Record<string, string> = {
  signed_out: "You have signed out.",
  check_email: "Check your email to confirm the account, then sign in here.",
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
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="grid w-full max-w-[26rem] gap-5">
        <header className="grid justify-items-center gap-2 text-center">
          <Link href="/" className="grid justify-items-center gap-2.5 no-underline">
            <span className="inline-flex rounded-2xl bg-[#f7f5ee] px-3.5 py-2.5 shadow-card">
              <TeeLineLogo variant="light" width={186} />
            </span>
            <span className="text-xs text-ink-muted">Iloilo Golf &amp; Country Club</span>
          </Link>
          <h1 className="mt-1 text-[24px] leading-8">Sign in</h1>
          <p className="hint">
            Players sign in to see their own entry and start. Club staff sign in to the tournament
            desk. Everyone else can read the published <Link href="/pairings">pairings</Link>{" "}
            without an account.
          </p>
        </header>

        <div className="card grid gap-4 sm:p-5">
          <form action={signInWithPassword} className="grid gap-3.5">
            <input type="hidden" name="next" value={next} />
            <h2 className="text-[16px]">Sign in</h2>
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
            <label className="field">
              <span>Password</span>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
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

          <details className="border-t border-line pt-4">
            <summary className="cursor-pointer text-[14px] font-semibold">
              New player? Create an account
            </summary>
            <form action={signUpWithPassword} className="mt-3 grid gap-3.5">
              <p className="hint">
                An account on its own shows nothing: after signing up you link your club record by
                name and NGAP number. Club staff accounts are created by the club, not here.
              </p>
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <span className="hint">At least 8 characters.</span>
              </label>
              <button type="submit" className="btn ghost">
                Create account
              </button>
            </form>
          </details>
        </div>

        {!configured && (
          <p className="hint">
            Supabase is not configured in this build, so sign-in is off and the desk runs on demo
            data. <Link href="/admin">Open the desk in demo mode</Link>.
          </p>
        )}

        <p className="hint text-center">
          By Syntaxure Labs. There is no password reset yet; ask the club if you are locked out.
        </p>
      </div>
    </main>
  );
}
