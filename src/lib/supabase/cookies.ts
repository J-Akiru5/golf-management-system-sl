/**
 * Supabase SSR writes the session as `sb-<project-ref>-auth-token`, split into `.0`, `.1`, … when
 * it is too large for one cookie. The name is the cheap signal that an auth lookup could succeed.
 *
 * The public pages use it to skip `auth.getUser()` entirely for a signed-out visitor. A stale or
 * malformed cookie still reaches the lookup and is handled there; the check only avoids the common
 * case of no cookie at all.
 */
const SUPABASE_AUTH_COOKIE = /^sb-.+-auth-token(?:\.\d+)?$/;

export function hasSupabaseAuthCookie(names: readonly string[]): boolean {
  return names.some((name) => SUPABASE_AUTH_COOKIE.test(name));
}
