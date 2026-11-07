/**
 * The development staff sign-in marker.
 *
 * It holds the address so the desk shell can say who is signed in at a glance. It is not a session
 * token and no access check reads it: it is only written in development with no Supabase project,
 * where the proxy is already open in demo mode. It is readable by the browser on purpose, so the
 * shell can show the signed-in account without making every page dynamic.
 */
export const DEV_STAFF_COOKIE = "teeline-dev-staff";

export function readDevStaffCookieEmail(): string | null {
  if (typeof document === "undefined" || process.env.NODE_ENV === "production") return null;
  const prefix = `${DEV_STAFF_COOKIE}=`;
  const part = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix));
  if (!part) return null;
  const value = decodeURIComponent(part.slice(prefix.length));
  return value || null;
}
