import { signInWithPassword } from "@/lib/auth/actions";

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

  return (
    <main>
      <h1>Sign in to the tournament desk</h1>
      <form action={signInWithPassword}>
        <input type="hidden" name="next" value={params.next ?? "/"} />
        <p>
          <label htmlFor="email">Email</label>
          <br />
          <input id="email" name="email" type="email" autoComplete="username" required />
        </p>
        <p>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </p>
        {error && <p role="alert">{error}</p>}
        {params.message === "signed_out" && <p role="status">You have signed out.</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
