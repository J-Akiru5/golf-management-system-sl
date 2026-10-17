import type { SupabaseClient } from "@supabase/supabase-js";
import type { DrawGroup } from "@/lib/draw/validate";
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

async function deleteGroupMembers(
  client: SupabaseClient<Database>,
  clubId: string,
  groupIds: string[],
): Promise<void> {
  if (!groupIds.length) return;
  const { error } = await client
    .from("group_members")
    .delete()
    .eq("club_id", clubId)
    .in("group_id", groupIds);
  if (error) throw new Error(`Could not update group members: ${error.message}`);
}

/**
 * Replaces one tournament's draft groups. If a later request fails, restore the old rows. The
 * public copy is independent and remains frozen in tournaments.published_snapshot throughout.
 */
export async function saveTournamentDraw(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  draw: DrawGroup[],
): Promise<Record<number, string>> {
  const { groups: oldGroups, members: oldMembers } = await loadTournamentGroups(
    client,
    clubId,
    tournamentId,
  );
  const oldByNumber = new Map(oldGroups.map((group) => [group.number, group]));
  const registrationIdsResult = await client
    .from("registrations")
    .select("id, player_id")
    .eq("club_id", clubId)
    .eq("tournament_id", tournamentId);
  if (registrationIdsResult.error) {
    throw new Error(
      `Could not resolve group registrations: ${registrationIdsResult.error.message}`,
    );
  }
  const registrationIds = new Map(
    (registrationIdsResult.data ?? []).map((registration) => [
      registration.player_id,
      registration.id,
    ]),
  );

  const targetRows: GroupRow[] = draw.map((group) => ({
    id: oldByNumber.get(group.number)?.id ?? crypto.randomUUID(),
    club_id: clubId,
    tournament_id: tournamentId,
    flight_id: group.flightId,
    number: group.number,
    start_hole: group.startHole,
    wave: group.wave,
    tee_time: group.time,
    locked: group.locked,
  }));
  const targetIds = targetRows.map((group) => group.id);
  const targetMembers: Omit<GroupMemberRow, "club_id">[] = [];

  for (const group of draw) {
    const groupId =
      oldByNumber.get(group.number)?.id ??
      targetRows.find((row) => row.number === group.number)?.id;
    if (!groupId) throw new Error(`Could not allocate a database ID for group ${group.number}.`);
    for (const [index, playerId] of group.playerIds.entries()) {
      const registrationId = registrationIds.get(playerId);
      if (!registrationId)
        throw new Error(`Player ${playerId} is not registered for this tournament.`);
      targetMembers.push({
        group_id: groupId,
        registration_id: registrationId,
        position: index + 1,
      });
    }
  }

  const oldIds = oldGroups.map((group) => group.id);
  try {
    if (targetRows.length) {
      const { data, error } = await client
        .from("groups")
        .upsert(targetRows, { onConflict: "id" })
        .select("id");
      if (error) throw new Error(`Could not save draw groups: ${error.message}`);
      if (data.length !== targetRows.length) throw new Error("Not all draw groups were saved.");
    }

    await deleteGroupMembers(client, clubId, [...new Set([...oldIds, ...targetIds])]);

    if (targetMembers.length) {
      const { data, error } = await client
        .from("group_members")
        .insert(targetMembers.map((member) => ({ ...member, club_id: clubId })))
        .select("registration_id");
      if (error) throw new Error(`Could not save group membership: ${error.message}`);
      if (data.length !== targetMembers.length)
        throw new Error("Not all group members were saved.");
    }

    const keep = new Set(targetIds);
    const stale = oldIds.filter((id) => !keep.has(id));
    if (stale.length) {
      const { data, error } = await client
        .from("groups")
        .delete()
        .eq("club_id", clubId)
        .eq("tournament_id", tournamentId)
        .in("id", stale)
        .select("id");
      if (error) throw new Error(`Could not remove replaced draw groups: ${error.message}`);
      if (data.length !== stale.length)
        throw new Error("Not all replaced draw groups were removed.");
    }
  } catch (error) {
    try {
      await deleteGroupMembers(client, clubId, [...new Set([...oldIds, ...targetIds])]);
      if (oldGroups.length) {
        const { error: restoreError } = await client
          .from("groups")
          .upsert(oldGroups, { onConflict: "id" });
        if (restoreError) throw restoreError;
      }
      const newIds = targetIds.filter((id) => !oldIds.includes(id));
      if (newIds.length) {
        const { error: cleanupError } = await client
          .from("groups")
          .delete()
          .eq("club_id", clubId)
          .eq("tournament_id", tournamentId)
          .in("id", newIds);
        if (cleanupError) throw cleanupError;
      }
      if (oldMembers.length) {
        const { error: restoreMembersError } = await client
          .from("group_members")
          .insert(oldMembers);
        if (restoreMembersError) throw restoreMembersError;
      }
    } catch (restoreError) {
      throw new Error(
        `${error instanceof Error ? error.message : "Could not save draw."} Rollback also failed: ${restoreError instanceof Error ? restoreError.message : "unknown database error"}`,
      );
    }
    throw error;
  }

  return Object.fromEntries(targetRows.map((group) => [group.number, group.id]));
}

export async function saveGroupLock(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  groupNumber: number,
  locked: boolean,
): Promise<void> {
  const { data, error } = await client
    .from("groups")
    .update({ locked })
    .eq("club_id", clubId)
    .eq("tournament_id", tournamentId)
    .eq("number", groupNumber)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not save group lock: ${error.message}`);
  if (!data) throw new Error(`Group ${groupNumber} was not found when saving its lock.`);
}
