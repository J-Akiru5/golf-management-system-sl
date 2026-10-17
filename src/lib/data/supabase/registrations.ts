import type { SupabaseClient } from "@supabase/supabase-js";
import type { Registration } from "@/lib/routing";
import type { Database, TableRow } from "@/lib/supabase/types";

type RegistrationRow = TableRow<"registrations">;

export async function loadTournamentRegistrations(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
): Promise<RegistrationRow[]> {
  const { data, error } = await client
    .from("registrations")
    .select("*")
    .eq("club_id", clubId)
    .eq("tournament_id", tournamentId)
    .order("created_at");
  if (error) throw new Error(`Could not load registrations: ${error.message}`);
  return data ?? [];
}

export async function insertRegistration(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  registration: Registration,
  shirt?: string,
): Promise<string> {
  const answers = shirt ? { shirt } : {};
  const { data, error } = await client
    .from("registrations")
    .insert({
      club_id: clubId,
      tournament_id: tournamentId,
      player_id: registration.playerId,
      status: registration.status,
      reasons: registration.reasons,
      frozen_index: registration.index,
      category_id: registration.categoryId,
      tee_id: registration.teeId,
      playing_handicap: registration.playingHandicap,
      flight_id: registration.flightId,
      answers,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not register player for this tournament: ${error.message}`);
  return data.id;
}

export async function deleteRegistration(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  playerId: string,
): Promise<void> {
  const { data, error } = await client
    .from("registrations")
    .delete()
    .eq("club_id", clubId)
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not remove tournament registration: ${error.message}`);
  if (!data) throw new Error("Could not find the tournament registration to remove.");
}

export async function getRegistrationIdMap(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
): Promise<Map<string, string>> {
  const { data, error } = await client
    .from("registrations")
    .select("id, player_id")
    .eq("club_id", clubId)
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(`Could not resolve tournament registrations: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.player_id, row.id]));
}

export async function saveRegistrationClassifications(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  registrations: Registration[],
): Promise<void> {
  const updates = registrations.map((registration) =>
    client
      .from("registrations")
      .update({
        status: registration.status,
        reasons: registration.reasons,
        frozen_index: registration.index,
        category_id: registration.categoryId,
        tee_id: registration.teeId,
        playing_handicap: registration.playingHandicap,
        flight_id: registration.flightId,
      })
      .eq("club_id", clubId)
      .eq("tournament_id", tournamentId)
      .eq("player_id", registration.playerId)
      .select("id")
      .maybeSingle(),
  );
  const results = await Promise.all(updates);
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw new Error(`Could not save player routing: ${failure.message}`);
  if (results.some((result) => !result.data)) {
    throw new Error("A player registration was not found while saving player routing.");
  }
}

export async function updateRegistrationAnswers(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  playerId: string,
  answers: RegistrationRow["answers"],
): Promise<void> {
  const { data: updated, error } = await client
    .from("registrations")
    .update({ answers })
    .eq("club_id", clubId)
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not save tournament answers: ${error.message}`);
  if (!updated) throw new Error("Could not find the player's tournament registration.");
}

export async function updateRegistrationShirt(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  playerId: string,
  shirt: string | undefined,
): Promise<void> {
  const { data, error: readError } = await client
    .from("registrations")
    .select("answers")
    .eq("club_id", clubId)
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (readError) throw new Error(`Could not load tournament answers: ${readError.message}`);
  if (!data) throw new Error("Could not find the player's tournament registration.");

  const answers =
    typeof data.answers === "object" && data.answers !== null && !Array.isArray(data.answers)
      ? { ...data.answers }
      : {};
  if (shirt) answers.shirt = shirt;
  else delete answers.shirt;

  await updateRegistrationAnswers(client, clubId, tournamentId, playerId, answers);
}

export type { RegistrationRow };
