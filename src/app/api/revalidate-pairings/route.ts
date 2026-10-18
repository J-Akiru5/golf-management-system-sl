import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Called by the desk right after a publish or unpublish so /pairings refreshes now instead of at
 * the end of its cache window. The caller proves who they are with their Supabase access token and
 * must be an owner or organizer; anyone else gets a 403 and nothing is revalidated.
 */
export async function POST(request: Request) {
  const environment = getSupabaseEnvironment();
  if (!environment) return Response.json({ error: "Supabase is not configured." }, { status: 404 });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return Response.json({ error: "Sign in required." }, { status: 401 });

  const client = createClient<Database>(environment.url, environment.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data: member } = await client
    .from("club_members")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", ["owner", "organizer"])
    .limit(1)
    .maybeSingle();
  if (!member) return Response.json({ error: "Not allowed." }, { status: 403 });

  revalidatePath("/pairings");
  return Response.json({ ok: true });
}
