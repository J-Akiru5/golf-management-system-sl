"use server";

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Email and password sign-in against the shared Supabase project. There is no sign-up and no
 * password reset in this phase: accounts are made in the Supabase dashboard by the owner.
 */
export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Enter your email and password.")}`);
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // One plain message for every cause: a wrong password and an unknown address look the same,
    // and neither is worth telling a stranger apart.
    redirect(
      `/login?error=${encodeURIComponent("That email and password did not match. Try again.")}`,
    );
  }

  redirect("/");
}
