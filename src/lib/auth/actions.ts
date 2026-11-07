"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { REMEMBER_COOKIE, rememberCookieOptions } from "@/lib/auth/cookies";
import { clearDevStaffSession, startDevStaffSession } from "@/lib/auth/dev-staff";
import { devStaffLoginEnabled, isDevStaffCredentials } from "@/lib/auth/dev-staff-rules";
import { passwordProblem } from "@/lib/auth/password";
import { landingFor } from "@/lib/auth/routes";
import { signInErrorCode } from "@/lib/auth/sign-in-error";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDeskMember } from "./member";
import { safeRedirectPath } from "./redirect";

/** The public address used in email links: the configured site URL wins, the request host is the fallback. */
async function siteBase(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Where this account belongs: the desk for a club member, the player area for a linked player, and
 * the player area for a signed-in account that has not linked its record yet (that page explains
 * the claim step). The proxy makes the same call on every later request.
 */
async function homeFor(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  next: string,
): Promise<string> {
  try {
    await getDeskMember(client, userId);
    return landingFor({ next: next === "/" ? null : next, identity: "staff" });
  } catch {
    let linked = false;
    try {
      const { data } = await client.rpc("current_player_id");
      linked = typeof data === "string" && data !== "";
    } catch {
      // Before the player portal migration is applied this simply is not a player account.
    }
    return landingFor({
      next: next === "/" ? null : next,
      identity: linked ? "player" : "unlinked",
    });
  }
}

export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    redirect("/login?error=credentials_required");
  }

  // The local development desk account. Off in a production build and whenever Supabase is
  // configured, where real staff accounts take over. See docs/STAFF_ACCESS.md.
  if (devStaffLoginEnabled() && isDevStaffCredentials(email, password)) {
    await startDevStaffSession(formData.get("remember") === "on");
    redirect("/admin");
  }

  if (!isSupabaseConfigured()) redirect("/login?error=supabase_not_configured");

  // The preference is written first and passed to the client explicitly: the auth cookies are set in
  // the same action, and the request cookie store does not have to show the write back.
  const remember = formData.get("remember") === "on";
  const store = await cookies();
  store.set(REMEMBER_COOKIE, remember ? "1" : "0", rememberCookieOptions(remember));

  const client = await createSupabaseServerClient({ remembered: remember });
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    // The provider's message is the difference between a wrong password and an account that was
    // never confirmed. Folding both into "sign-in failed" is what made the phone report unusable.
    redirect(`/login?error=${signInErrorCode(error.message)}`);
  }

  const { data, error: userError } = await client.auth.getUser();
  if (userError || !data.user) {
    await client.auth.signOut();
    redirect("/login?error=sign_in_failed");
  }

  redirect(await homeFor(client, data.user.id, safeRedirectPath(formData.get("next"))));
}

/**
 * Sends a fresh confirmation link. The reply is the same whether or not the address needs one, so
 * this cannot be used to enumerate accounts. A staff account is provisioned by the owner, not by
 * this form; a player account is the one that normally needs confirmation.
 */
export async function resendConfirmation(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/login?error=supabase_not_configured");
  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    redirect("/login?error=email_required");
  }
  const client = await createSupabaseServerClient();
  await client.auth.resend({ type: "signup", email: email.trim() });
  redirect("/login?message=confirmation_sent");
}

/**
 * Player accounts are created by the players themselves; staff accounts are not, because belonging
 * to the desk means a club_members row that only the club can add. A new account can do nothing
 * until it links a member record, which the claim step on /my does.
 */
export async function signUpWithPassword(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/signup?error=supabase_not_configured");

  const displayName = formData.get("displayName");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirm = formData.get("confirmPassword");

  if (typeof displayName !== "string" || !displayName.trim()) {
    redirect("/signup?error=name_required");
  }
  if (typeof email !== "string" || !email.trim() || typeof password !== "string") {
    redirect("/signup?error=credentials_required");
  }

  // The same rule the reset form uses, enforced here so a request that skips the page is held to it.
  const problem = passwordProblem(password, typeof confirm === "string" ? confirm : "");
  if (problem) redirect(`/signup?error=${problem}`);

  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: displayName.trim() } },
  });

  if (error) {
    // Supabase Auth rate-limits sign-ups itself. Say so rather than blaming the person's details.
    const limited = /rate|too many|exceeded/i.test(error.message);
    redirect(
      `/signup?error=${limited ? "rate_limited" : "sign_up_failed"}&email=${encodeURIComponent(email.trim())}`,
    );
  }

  // With email confirmation on, the account exists but there is no session yet.
  if (!data.session) redirect("/login?message=check_email");

  // Never claim a record here. A display name is public and proves nothing, so the account has to
  // ask on /my and pass the claim's identity check. Sign-up therefore always lands on the card.
  redirect("/my");
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(REMEMBER_COOKIE);
  await clearDevStaffSession();
  // In demo mode there is no provider session to end, and creating a client would throw.
  if (!isSupabaseConfigured()) redirect("/login?message=signed_out");
  const client = await createSupabaseServerClient();
  await client.auth.signOut();
  redirect("/login?message=signed_out");
}

/**
 * Sends a recovery link. The reply never says whether the address has an account, so the page
 * cannot be used to enumerate players.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/forgot-password?error=supabase_not_configured");
  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    redirect("/forgot-password?error=email_required");
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${await siteBase()}/auth/confirm?next=/reset-password`,
  });
  if (error) redirect("/forgot-password?error=reset_failed");
  redirect("/login?message=reset_sent");
}

/** Sets the new password from the recovery session, then ends that session. */
export async function updatePassword(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/reset-password?error=supabase_not_configured");
  const password = formData.get("password");
  const confirm = formData.get("confirm");
  const problem = passwordProblem(
    typeof password === "string" ? password : "",
    typeof confirm === "string" ? confirm : "",
  );
  if (problem) redirect(`/reset-password?error=${problem}`);

  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/reset-password?error=reset_session");
  const { error } = await client.auth.updateUser({ password: password as string });
  if (error) redirect("/reset-password?error=update_failed");

  await client.auth.signOut();
  redirect("/login?message=password_updated");
}
