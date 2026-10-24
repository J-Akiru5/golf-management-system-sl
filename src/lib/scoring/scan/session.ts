import type { SupabaseClient } from "@supabase/supabase-js";
import { type DeskMember, getDeskMember } from "@/lib/auth/member";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type ScanSession =
  | {
      ok: true;
      client: SupabaseClient<Database>;
      userId: string;
      member: DeskMember;
    }
  | { ok: false; status: number; message: string };

/** The same desk session used by the scoring screen: owner, organizer or desk. */
export async function scanSession(): Promise<ScanSession> {
  let client: SupabaseClient<Database>;
  try {
    client = await createSupabaseServerClient();
  } catch {
    return { ok: false, status: 503, message: "Supabase is not configured for this deployment." };
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 401, message: "Sign in to scan a scorecard." };
  }
  try {
    const member = await getDeskMember(client, data.user.id);
    return { ok: true, client, userId: data.user.id, member };
  } catch (e) {
    return {
      ok: false,
      status: 403,
      message: e instanceof Error ? e.message : "This account cannot use the desk.",
    };
  }
}

export async function tournamentForClub(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
): Promise<{ id: string; name: string } | null> {
  if (!tournamentId) return null;
  const { data, error } = await client
    .from("tournaments")
    .select("id, name, club_id")
    .eq("id", tournamentId)
    .eq("club_id", clubId)
    .maybeSingle();
  if (error) throw new Error(`Could not check the tournament: ${error.message}`);
  return data ? { id: data.id, name: data.name } : null;
}
