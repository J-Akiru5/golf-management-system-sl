import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeskPlayer } from "@/lib/demo/data";
import type { Database, TableRow } from "@/lib/supabase/types";
import { mapPlayerRow } from "./mappers";

type PlayerRow = TableRow<"players">;
type RegistrationRow = TableRow<"registrations">;

function answerShirt(value: RegistrationRow["answers"]): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const shirt = value.shirt;
  return typeof shirt === "string" ? shirt : undefined;
}

export interface LoadedPlayers {
  players: DeskPlayer[];
  photoPaths: Record<string, string | null>;
}

/** Loads only players registered for this event; each query is explicitly scoped to the club. */
export async function loadTournamentPlayers(
  client: SupabaseClient<Database>,
  clubId: string,
  registrations: RegistrationRow[],
): Promise<LoadedPlayers> {
  if (!registrations.length) return { players: [], photoPaths: {} };
  const playerIds = registrations.map((registration) => registration.player_id);
  const { data: rows, error } = await client
    .from("players")
    .select("*")
    .eq("club_id", clubId)
    .in("id", playerIds)
    .order("full_name");
  if (error) throw new Error(`Could not load tournament players: ${error.message}`);

  const registrationByPlayer = new Map(registrations.map((row) => [row.player_id, row]));
  const photoPaths: Record<string, string | null> = {};
  const players = await Promise.all(
    (rows ?? []).map(async (row) => {
      const registration = registrationByPlayer.get(row.id);
      if (!registration) throw new Error(`Registration for player ${row.id} was not returned.`);
      let photoUrl: string | undefined;
      if (row.photo_path && row.photo_consent_at && row.photo_path.startsWith(`${clubId}/`)) {
        const { data: signed, error: signError } = await client.storage
          .from("player-photos")
          .createSignedUrl(row.photo_path, 30 * 60);
        if (!signError) photoUrl = signed.signedUrl;
      }
      photoPaths[row.id] = row.photo_path;
      return mapPlayerRow(row, registration.frozen_index, {
        photoUrl,
        shirt: answerShirt(registration.answers),
      });
    }),
  );

  if (players.length !== registrations.length) {
    throw new Error("A tournament registration points to a player that could not be loaded.");
  }
  return { players, photoPaths };
}

export async function insertPlayerRow(
  client: SupabaseClient<Database>,
  clubId: string,
  player: DeskPlayer,
): Promise<PlayerRow> {
  if (player.photo && !player.photoConsent) {
    throw new Error("A player photo cannot be saved without recorded consent.");
  }
  const { data, error } = await client
    .from("players")
    .insert({
      id: player.id,
      club_id: clubId,
      full_name: player.name,
      birthdate: player.birthdate,
      gender: player.gender,
      ngap_id: player.ngapId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Could not add player: ${error.message}`);
  return data;
}

export async function updatePlayerRow(
  client: SupabaseClient<Database>,
  clubId: string,
  player: DeskPlayer,
): Promise<void> {
  const { data, error } = await client
    .from("players")
    .update({
      full_name: player.name,
      birthdate: player.birthdate,
      gender: player.gender,
      ngap_id: player.ngapId,
    })
    .eq("club_id", clubId)
    .eq("id", player.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not update player: ${error.message}`);
  if (!data) throw new Error("The player was not found while saving profile changes.");
}

export async function updatePlayerNgapId(
  client: SupabaseClient<Database>,
  clubId: string,
  playerId: string,
  ngapId: string | null,
): Promise<void> {
  const { data, error } = await client
    .from("players")
    .update({ ngap_id: ngapId })
    .eq("club_id", clubId)
    .eq("id", playerId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not save the imported NGAP ID: ${error.message}`);
  if (!data) throw new Error("The player was not found while saving the imported NGAP ID.");
}

export async function deletePlayerRow(
  client: SupabaseClient<Database>,
  clubId: string,
  playerId: string,
): Promise<void> {
  const { data, error } = await client
    .from("players")
    .delete()
    .eq("club_id", clubId)
    .eq("id", playerId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not roll back the new player row: ${error.message}`);
  if (!data) throw new Error("Could not find the new player row to roll it back.");
}

function parsePhotoDataUrl(dataUrl: string): {
  blob: Blob;
  extension: string;
  contentType: string;
} {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("The photo must be a JPEG, PNG, or WebP image.");
  const subtype = match[1] === "jpg" ? "jpeg" : match[1];
  const encoded = match[2];
  if (!subtype || !encoded) throw new Error("The photo could not be read.");
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return {
    blob: new Blob([bytes], { type: `image/${subtype}` }),
    extension: subtype === "jpeg" ? "jpg" : subtype,
    contentType: `image/${subtype}`,
  };
}

/** Uploads only an explicitly consented image; the bucket remains private. */
export async function saveConsentedPhoto(
  client: SupabaseClient<Database>,
  clubId: string,
  playerId: string,
  photoDataUrl: string,
): Promise<{ path: string; signedUrl: string; consentAt: string }> {
  const { blob, extension, contentType } = parsePhotoDataUrl(photoDataUrl);
  const path = `${clubId}/${playerId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage.from("player-photos").upload(path, blob, {
    contentType,
    upsert: true,
  });
  if (uploadError)
    throw new Error(`Could not save the consented player photo: ${uploadError.message}`);

  const { data: signed, error: signError } = await client.storage
    .from("player-photos")
    .createSignedUrl(path, 30 * 60);
  if (signError) {
    await client.storage.from("player-photos").remove([path]);
    throw new Error(`Could not create a private photo URL: ${signError.message}`);
  }

  return { path, signedUrl: signed.signedUrl, consentAt: new Date().toISOString() };
}

export async function removeStoredPhoto(
  client: SupabaseClient<Database>,
  clubId: string,
  path: string | null | undefined,
): Promise<void> {
  if (!path) return;
  if (!path.startsWith(`${clubId}/`))
    throw new Error("Refusing to remove a photo outside this club.");
  const { error } = await client.storage.from("player-photos").remove([path]);
  if (error) throw new Error(`Could not remove the player photo: ${error.message}`);
}

export async function setPlayerPhotoConsent(
  client: SupabaseClient<Database>,
  clubId: string,
  playerId: string,
  photoPath: string | null,
  consentAt: string | null,
): Promise<void> {
  const { data, error } = await client
    .from("players")
    .update({ photo_path: photoPath, photo_consent_at: consentAt })
    .eq("club_id", clubId)
    .eq("id", playerId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not save photo consent: ${error.message}`);
  if (!data) throw new Error("The player was not found while saving photo consent.");
}

export function isPhotoDataUrl(value: string | undefined): value is string {
  return Boolean(value?.startsWith("data:image/"));
}
