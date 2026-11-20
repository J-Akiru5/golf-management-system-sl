"use server";

import { redirect } from "next/navigation";
import { demoMode } from "@/lib/flags";
import { getServerSupabase } from "@/lib/supabase/server";

/** Ends the session and returns to the sign-in page. Demo mode has no session to end. */
export async function signOut(): Promise<void> {
  if (demoMode()) redirect("/");

  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
