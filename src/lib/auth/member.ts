import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type ClubRole = Database["public"]["Tables"]["club_members"]["Row"]["role"];

export interface DeskMember {
  clubId: string;
  displayName: string;
  role: ClubRole;
}

/** The first release supports one club membership per signed-in user. */
export async function getDeskMember(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<DeskMember> {
  const { data, error } = await client
    .from("club_members")
    .select("club_id, display_name, role")
    .eq("user_id", userId)
    .limit(2);

  if (error) throw new Error(`Could not check club membership: ${error.message}`);
  if (!data?.length) throw new Error("This account is not a member of a club.");
  if (data.length > 1)
    throw new Error(
      "This account belongs to more than one club; club switching is not set up yet.",
    );

  const row = data[0];
  if (!row) throw new Error("This account is not a member of a club.");
  if (row.role !== "owner" && row.role !== "organizer" && row.role !== "desk") {
    throw new Error("This account has an unsupported club role.");
  }

  return {
    clubId: row.club_id,
    displayName: row.display_name ?? "",
    role: row.role,
  };
}
