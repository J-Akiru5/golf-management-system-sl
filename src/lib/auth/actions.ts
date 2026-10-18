"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDeskMember } from "./member";
import { safeRedirectPath } from "./redirect";

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

  try {
    await getDeskMember(client, data.user.id);
  } catch {
    await client.auth.signOut();
    redirect("/login?error=membership_required");
  }

  redirect(safeRedirectPath(formData.get("next")));
}

export async function signOut(): Promise<void> {
  const client = await createSupabaseServerClient();
  await client.auth.signOut();
  redirect("/login?message=signed_out");
}
