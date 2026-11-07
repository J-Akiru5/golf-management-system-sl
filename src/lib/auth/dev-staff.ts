import { cookies } from "next/headers";
import { DEV_STAFF_COOKIE } from "./dev-staff-cookie";
import { DEV_STAFF_EMAIL, devStaffLoginEnabled } from "./dev-staff-rules";

const REMEMBER_SECONDS = 60 * 60 * 24 * 30;

/**
 * The cookie is readable by the shell so it can name the signed-in account. That is safe because it
 * carries only the address: the sign-in branch is open only in development with no Supabase project,
 * and the desk is already open in that mode. It must never be treated as an access token.
 */
function cookieOptions(remembered: boolean) {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: false,
    path: "/",
    ...(remembered ? { maxAge: REMEMBER_SECONDS } : {}),
  };
}

export async function startDevStaffSession(remembered: boolean): Promise<void> {
  if (!devStaffLoginEnabled()) throw new Error("Development staff sign-in is off.");
  const store = await cookies();
  store.set(DEV_STAFF_COOKIE, DEV_STAFF_EMAIL, cookieOptions(remembered));
}

export async function clearDevStaffSession(): Promise<void> {
  const store = await cookies();
  store.delete(DEV_STAFF_COOKIE);
}

export async function hasDevStaffSession(): Promise<boolean> {
  if (!devStaffLoginEnabled()) return false;
  const store = await cookies();
  return store.get(DEV_STAFF_COOKIE)?.value === DEV_STAFF_EMAIL;
}
