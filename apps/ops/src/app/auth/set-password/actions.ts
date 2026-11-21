"use server";

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { MIN_PASSWORD_LENGTH, type SetPasswordState } from "./password";

/**
 * Sets the password for the account that just came through an invite or reset link. The account is
 * already signed in by the confirm route; this only writes the password the person chose.
 */
export async function setPassword(
  _previous: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password !== confirm) {
    return { ok: false, message: "The two passwords do not match." };
  }

  const supabase = await getServerSupabase();
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    return {
      ok: false,
      message: "This page needs a fresh link from your email. Ask an owner to send another one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, message: error.message };
  }

  redirect("/");
}
