import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TableRow } from "@/lib/supabase/types";

type GroupRow = TableRow<"groups">;
type GroupMemberRow = TableRow<"group_members">;

export async function loadTournamentGroups(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
): Promise<{ groups: GroupRow[]; members: GroupMemberRow[] }> {
  const { data: groups, error: groupError } = await client
    .from("groups")
    .select("*")
    .eq("club_id", clubId)
    .eq("tournament_id", tournamentId)
    .order("number");
  if (groupError) throw new Error(`Could not load draw groups: ${groupError.message}`);

  const groupIds = (groups ?? []).map((group) => group.id);
  if (!groupIds.length) return { groups: [], members: [] };

  const { data: members, error: memberError } = await client
    .from("group_members")
    .select("*")
    .eq("club_id", clubId)
    .in("group_id", groupIds)
    .order("position");
  if (memberError) throw new Error(`Could not load group members: ${memberError.message}`);
  return { groups: groups ?? [], members: members ?? [] };
}
