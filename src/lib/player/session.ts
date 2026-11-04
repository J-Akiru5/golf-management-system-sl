import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The player pages' session guard. The proxy already sends a signed-out visitor to sign in, but a
 * server action or a cached render can arrive without a session, so each page checks once more
 * rather than trusting the request to be the one the proxy saw.
 */
export async function signedInClient(next: string) {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=sign_in_required`);
  }
  return client;
}
