import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeskPlayer } from "@/lib/demo/data";
import { classifyPlayer } from "@/lib/routing";
import type { Action, DeskState } from "@/lib/store/legacy-supabase-store";
import type { Database } from "@/lib/supabase/types";
import { publishPairings, saveDraw, unpublishPairings } from "./draw-sync";
import {
  effectiveIndexesFromImport,
  loadLatestHandicapRecordsAtCutoff,
  upsertImportedHandicapRecords,
} from "./handicap-records";
import {
  deletePlayerRow,
  insertPlayerRow,
  isPhotoDataUrl,
  removeStoredPhoto,
  saveConsentedPhoto,
  setPlayerPhotoConsent,
  updatePlayerNgapId,
  updatePlayerRow,
} from "./players";
import {
  deleteRegistration,
  insertRegistration,
  saveRegistrationClassifications,
  updateRegistrationShirt,
} from "./registrations";
import { saveTournamentConfig } from "./tournaments";

export interface PersistResult {
  photoPathUpdates?: Record<string, string | null>;
  photoUrlUpdates?: Record<string, string | undefined>;
  consentUpdates?: Record<string, boolean>;
  indexUpdates?: Record<string, number | null>;
}

/** The parked store does not track revisions, so it reads the current one just before each write. */
async function currentRevision(
  client: SupabaseClient<Database>,
  tournamentId: string,
): Promise<number> {
  const { data, error } = await client
    .from("tournaments")
    .select("draw_revision")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the draw revision: ${error.message}`);
  if (!data) throw new Error("The tournament was not found while saving the draw.");
  return data.draw_revision;
}

function ids(state: DeskState): { clubId: string; tournamentId: string } {
  if (!state.clubId || !state.tournamentId) {
    throw new Error("No active club tournament is loaded; the change was not saved.");
  }
  return { clubId: state.clubId, tournamentId: state.tournamentId };
}

function classifyAll(state: DeskState, players: DeskPlayer[] = state.players) {
  const input = {
    players,
    config: state.config,
    tees: state.tees,
    categories: state.categories,
    flights: state.flights,
  };
  return players.map((player) => classifyPlayer(player, input));
}

function classifyOne(state: DeskState, player: DeskPlayer) {
  return classifyPlayer(player, {
    players: state.players,
    config: state.config,
    tees: state.tees,
    categories: state.categories,
    flights: state.flights,
  });
}

async function persistNewPlayer(
  client: SupabaseClient<Database>,
  state: DeskState,
  player: DeskPlayer,
): Promise<PersistResult> {
  const { clubId, tournamentId } = ids(state);
  if (player.photo && !player.photoConsent) {
    throw new Error("A player photo cannot be saved without recorded consent.");
  }

  await insertPlayerRow(client, clubId, player);
  let photoPath: string | null = null;
  let photoUrl: string | undefined;
  try {
    if (player.photo && player.photoConsent) {
      if (!isPhotoDataUrl(player.photo))
        throw new Error("New player photos must be uploaded as image data.");
      const saved = await saveConsentedPhoto(client, clubId, player.id, player.photo);
      photoPath = saved.path;
      photoUrl = saved.signedUrl;
      await setPlayerPhotoConsent(client, clubId, player.id, saved.path, saved.consentAt);
    }

    const registration = classifyOne(state, player);
    await insertRegistration(client, clubId, tournamentId, registration, player.shirt);
  } catch (error) {
    if (photoPath) await removeStoredPhoto(client, clubId, photoPath).catch(() => undefined);
    await deletePlayerRow(client, clubId, player.id).catch(() => undefined);
    throw error;
  }

  return {
    photoPathUpdates: { [player.id]: photoPath },
    photoUrlUpdates: { [player.id]: photoUrl },
    consentUpdates: { [player.id]: Boolean(photoPath) },
  };
}

async function persistPlayerUpdate(
  client: SupabaseClient<Database>,
  before: DeskState,
  after: DeskState,
  playerId: string,
): Promise<PersistResult> {
  const { clubId, tournamentId } = ids(after);
  const player = after.players.find((item) => item.id === playerId);
  if (!player) throw new Error(`Could not find updated player ${playerId}.`);
  await updatePlayerRow(client, clubId, player);
  await saveRegistrationClassifications(client, clubId, tournamentId, [classifyOne(after, player)]);
  await updateRegistrationShirt(client, clubId, tournamentId, player.id, player.shirt);

  const previousPath = before.photoPaths[playerId] ?? null;
  if (!player.photoConsent || !player.photo) {
    if (previousPath || player.photoConsent) {
      await setPlayerPhotoConsent(client, clubId, player.id, null, null);
      await removeStoredPhoto(client, clubId, previousPath);
    }
    return {
      photoPathUpdates: { [player.id]: null },
      photoUrlUpdates: { [player.id]: undefined },
      consentUpdates: { [player.id]: false },
    };
  }

  if (isPhotoDataUrl(player.photo)) {
    const saved = await saveConsentedPhoto(client, clubId, player.id, player.photo);
    try {
      await setPlayerPhotoConsent(client, clubId, player.id, saved.path, saved.consentAt);
      if (previousPath && previousPath !== saved.path)
        await removeStoredPhoto(client, clubId, previousPath);
    } catch (error) {
      await removeStoredPhoto(client, clubId, saved.path).catch(() => undefined);
      throw error;
    }
    return {
      photoPathUpdates: { [player.id]: saved.path },
      photoUrlUpdates: { [player.id]: saved.signedUrl },
      consentUpdates: { [player.id]: true },
    };
  }

  if (!previousPath) {
    throw new Error("The player has consent marked but no saved private photo.");
  }
  return {};
}

export async function persistDeskAction(
  client: SupabaseClient<Database>,
  action: Action,
  before: DeskState,
  after: DeskState,
): Promise<PersistResult> {
  const { clubId, tournamentId } = ids(after);

  switch (action.type) {
    case "addPlayer": {
      const player = after.players.find((item) => item.id === action.player.id);
      if (!player) throw new Error("The new player was not present in the updated desk state.");
      return persistNewPlayer(client, after, player);
    }
    case "updatePlayer":
      return persistPlayerUpdate(client, before, after, action.id);
    case "removePlayer":
      await deleteRegistration(client, clubId, tournamentId, action.id);
      return {};
    case "setConfig":
      await saveTournamentConfig(client, clubId, tournamentId, after.config);
      await saveRegistrationClassifications(client, clubId, tournamentId, classifyAll(after));
      return {};
    case "applyImport": {
      await upsertImportedHandicapRecords(client, clubId, action.records);
      const matchedIds = new Set(
        action.records.flatMap((record) => (record.playerId ? [record.playerId] : [])),
      );
      await Promise.all(
        after.players
          .filter((player) => matchedIds.has(player.id))
          .map((player) => updatePlayerNgapId(client, clubId, player.id, player.ngapId)),
      );
      if (!after.cutoffDate) throw new Error("The tournament has no handicap cut-off date set.");
      const latestStored = await loadLatestHandicapRecordsAtCutoff(
        client,
        clubId,
        [...matchedIds],
        after.cutoffDate,
      );
      const effective = effectiveIndexesFromImport(latestStored, action.records, after.cutoffDate);
      const indexUpdates = Object.fromEntries(
        [...effective].map(([playerId, record]) => [playerId, record.index]),
      );
      const updatedPlayers = after.players.map((player) =>
        Object.hasOwn(indexUpdates, player.id)
          ? { ...player, index: indexUpdates[player.id] ?? null }
          : player,
      );
      await saveRegistrationClassifications(
        client,
        clubId,
        tournamentId,
        classifyAll(after, updatedPlayers),
      );
      return { indexUpdates };
    }
    case "generate":
      await saveRegistrationClassifications(client, clubId, tournamentId, classifyAll(after));
      await saveDraw(
        client,
        tournamentId,
        await currentRevision(client, tournamentId),
        after.draw ?? [],
        null,
      );
      await unpublishPairings(client, tournamentId);
      return {};
    case "move":
    case "lock":
      await saveDraw(
        client,
        tournamentId,
        await currentRevision(client, tournamentId),
        after.draw ?? [],
        null,
      );
      return {};
    case "publish":
      if (!after.published) return {};
      await publishPairings(
        client,
        tournamentId,
        await currentRevision(client, tournamentId),
        after.published,
      );
      return {};
    case "unpublish":
      await unpublishPairings(client, tournamentId);
      return {};
  }
}
