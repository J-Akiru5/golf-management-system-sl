"use server";

import { redirect } from "next/navigation";
import { landingFor } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDeskMember } from "./member";
import { safeRedirectPath } from "./redirect";

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
  if (!isSupabaseConfigured()) redirect("/login?error=supabase_not_configured");
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    redirect("/login?error=credentials_required");
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) redirect("/login?error=sign_in_failed");

  const { data, error: userError } = await client.auth.getUser();
  if (userError || !data.user) {
    await client.auth.signOut();
    redirect("/login?error=sign_in_failed");
  }

  redirect(await homeFor(client, data.user.id, safeRedirectPath(formData.get("next"))));
}

/**
 * Player accounts are created by the players themselves; staff accounts are not, because belonging
 * to the desk means a club_members row that only the club can add. A new account can do nothing
 * until it links a member record, which the claim step on /my does.
 */
export async function signUpWithPassword(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/login?error=supabase_not_configured");

  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email.trim()) {
    redirect("/login?error=sign_up_credentials_required");
  }
  if (password.length < 8) redirect("/login?error=sign_up_password_short");

  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.signUp({ email: email.trim(), password });
  if (error) redirect("/login?error=sign_up_failed");

  // With email confirmation on, the account exists but there is no session yet.
  if (!data.session) redirect("/login?message=check_email");
  redirect("/my?claim=start");
}

export async function signOut(): Promise<void> {
  const client = await createSupabaseServerClient();
  await client.auth.signOut();
  redirect("/login?message=signed_out");
}
