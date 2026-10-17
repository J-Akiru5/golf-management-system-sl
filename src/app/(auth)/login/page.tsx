import Link from "next/link";
import { Crest } from "@/components/Crest";
import { signInWithPassword } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const ERRORS: Record<string, string> = {
  credentials_required: "Enter your email and password.",
  sign_in_failed: "Sign-in failed. Check your details and try again.",
  sign_in_required: "Sign in to open the tournament desk.",
  membership_required:
    "This account is not a member of an IGCC club. Ask an administrator for access.",
  supabase_not_configured: "Supabase is not configured. The app is running in demo mode.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] : undefined;
  const configured = isSupabaseConfigured();

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="grid w-full max-w-[26rem] gap-5">
        <header className="grid justify-items-center gap-2 text-center">
          <Crest size={56} />
          <span>
            <b className="block font-display text-[15px] font-extrabold text-ink">
              Iloilo Golf &amp; Country Club
            </b>
            <span className="text-xs text-ink-muted">Tournament office · Sta. Barbara</span>
          </span>
          <h1 className="mt-1 text-[24px] leading-8">Sign in to the tournament desk</h1>
          <p className="hint">Organizer access only. The player view needs no sign-in.</p>
        </header>

        <div className="card grid gap-4 sm:p-5">
          <form action={signInWithPassword} className="grid gap-3.5">
            <input type="hidden" name="next" value={params.next ?? "/"} />
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
            {params.message === "signed_out" && (
              <p className="notice ok" role="status">
                You have signed out.
              </p>
            )}
            <button type="submit" className="btn">
              Sign in
            </button>
          </form>
          {!configured && (
            <p className="hint">
              Supabase is not configured in this build, so sign-in is off and the desk runs on demo
              data. <Link href="/">Open the desk in demo mode</Link>.
            </p>
          )}
        </div>

        <p className="hint text-center">
          By Syntaxure Labs. There is no account creation or password reset yet; ask an
          administrator for access.
        </p>
      </div>
    </main>
  );
}
