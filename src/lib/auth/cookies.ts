/**
 * The "remember me" contract.
 *
 * Supabase's SSR client writes the auth cookies. When the person did not ask to be remembered, the
 * session must not outlive the browser, so maxAge/expires are stripped from every auth cookie. A
 * single httpOnly preference cookie carries that choice to the proxy, which refreshes the session on
 * later requests.
 */
export const REMEMBER_COOKIE = "teeline-remember";
export const REMEMBER_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** `true`/`false` from the stored preference, `null` when no choice has been recorded. */
export function rememberPreference(value: string | undefined | null): boolean | null {
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

/**
 * Removes the lifetime from a cookie when the session should end with the browser. The options come
 * from Supabase, so this keeps everything else (path, sameSite, secure) untouched.
 */
export function authCookieOptions<T extends object>(options: T, remembered: boolean | null): T {
  if (remembered !== false) return options;
  const rest = { ...(options as Record<string, unknown>) };
  delete rest.maxAge;
  delete rest.expires;
  return rest as T;
}

/** The httpOnly preference cookie: 30 days when remembered, session-only otherwise. */
export function rememberCookieOptions(remembered: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remembered ? { maxAge: REMEMBER_MAX_AGE_SECONDS } : {}),
  };
}
