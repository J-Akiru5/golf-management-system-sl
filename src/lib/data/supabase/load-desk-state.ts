/**
 * Reads a club's whole desk out of Supabase and shapes it as the shell's `DeskState`.
 *
 * One read on load, then the adapters work off that state. Everything is scoped by club_id;
 * row-level security is relied on rather than bypassed. Photos are signed only where consent was
 * recorded, and only for a short window.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManualOverride } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";
import type { BoardState, DeskState, Published } from "@/lib/store/state";
import type { Database, Json, TableRow } from "@/lib/supabase/types";
import {
  toCategoryRule,
  toDeferredMatch,
  toFlightRule,
  toHandicapRecord,
  toImportBatch,
  toPlayerRecord,
  toRegistrationEntry,
  toTournament,
} from "./domain";

const PHOTO_URL_SECONDS = 30 * 60;

function asArray<T>(rows: T[] | null): T[] {
  return rows ?? [];
}

function toPublished(value: Json | null, tournamentId: string): Published | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.at !== "string" ||
    typeof raw.signature !== "string" ||
    !Array.isArray(raw.groups)
  ) {
    return null;
  }
  return {
    tournamentId,
    at: raw.at,
    signature: raw.signature,
    version: typeof raw.version === "number" ? raw.version : undefined,
    groups: raw.groups
      .filter((g): g is Record<string, unknown> => typeof g === "object" && g !== null)
      .map((g) => ({
        number: Number(g.number),
        startHole: Number(g.startHole),
        wave: typeof g.wave === "string" ? g.wave : null,
        time: String(g.time),
        flight: String(g.flight),
        players: Array.isArray(g.players) ? g.players.map(String) : [],
      })),
  };
}

function toOverrides(value: Json | null): ManualOverride[] {
  if (!Array.isArray(value)) return [];
  const out: ManualOverride[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const kind = o.kind;
    out.push({
      id: String(o.id ?? ""),
      tournamentId: String(o.tournamentId ?? ""),
      playerId: String(o.playerId ?? ""),
      kind: kind === "lock" || kind === "unlock" || kind === "flight" ? kind : "move",
      from: typeof o.from === "string" ? o.from : null,
      to: typeof o.to === "string" ? o.to : null,
      reason: String(o.reason ?? ""),
      at: String(o.at ?? ""),
    });
  }
  return out;
}

export interface LoadedDesk {
  state: DeskState;
  clubName: string;
  /** Each tournament's draw revision. A draw save must name the revision it started from. */
  revisions: Record<string, number>;
}

export async function loadDeskState(
  client: SupabaseClient<Database>,
  clubId: string,
): Promise<LoadedDesk> {
  const { data: club, error: clubError } = await client
    .from("clubs")
    .select("id, name")
    .eq("id", clubId)
    .single();
  if (clubError || !club)
    throw new Error(`Could not load the club: ${clubError?.message ?? "not found"}`);

  const [
    tournamentRows,
    playerRows,
    recordRows,
    entryRows,
    batchRows,
    deferredRows,
    categoryRows,
    flightRows,
  ] = await Promise.all([
    client
      .from("tournaments")
      .select("*")
      .eq("club_id", clubId)
      .order("play_date", { ascending: true }),
    client.from("players").select("*").eq("club_id", clubId).order("full_name"),
    client.from("handicap_records").select("*").eq("club_id", clubId).order("effective_date"),
    client.from("registrations").select("*").eq("club_id", clubId),
    client.from("handicap_import_batches").select("*").eq("club_id", clubId).order("imported_at"),
    client.from("deferred_matches").select("*").eq("club_id", clubId).order("created_at"),
    client.from("categories").select("*").eq("club_id", clubId).order("sort_order"),
    client.from("flights").select("*").eq("club_id", clubId).order("min_value"),
  ]);
  for (const result of [
    tournamentRows,
    playerRows,
    recordRows,
    entryRows,
    batchRows,
    deferredRows,
    categoryRows,
    flightRows,
  ]) {
    if (result.error) throw new Error(`Could not load the desk: ${result.error.message}`);
  }

  const categories = asArray(categoryRows.data).map(toCategoryRule);
  const flights = asArray(flightRows.data).map(toFlightRule);
  const tournaments = asArray(tournamentRows.data).map((row) =>
    toTournament(row, categories, flights),
  );

  // Signed URLs only where consent exists, and only for this club's objects.
  const players = await Promise.all(
    asArray(playerRows.data).map(async (row) => {
      let photoUrl: string | undefined;
      if (row.photo_consent_at && row.photo_path?.startsWith(`${clubId}/`)) {
        const { data: signed } = await client.storage
          .from("player-photos")
          .createSignedUrl(row.photo_path, PHOTO_URL_SECONDS);
        photoUrl = signed?.signedUrl;
      }
      return toPlayerRecord(row, photoUrl);
    }),
  );

  // Boards are rebuilt from the stored groups so a saved draw survives a refresh.
  const tournamentIds = tournaments.map((t) => t.id);
  const boards: Record<string, BoardState> = {};
  const revisions: Record<string, number> = {};
  if (tournamentIds.length) {
    const { data: groupRows, error: groupError } = await client
      .from("groups")
      .select("*")
      .eq("club_id", clubId)
      .in("tournament_id", tournamentIds)
      .order("number");
    if (groupError) throw new Error(`Could not load the draw: ${groupError.message}`);

    const groups = asArray(groupRows);
    const groupIds = groups.map((g) => g.id);
    let memberRows: TableRow<"group_members">[] = [];
    if (groupIds.length) {
      const { data, error } = await client
        .from("group_members")
        .select("*")
        .eq("club_id", clubId)
        .in("group_id", groupIds)
        .order("position");
      if (error) throw new Error(`Could not load the group members: ${error.message}`);
      memberRows = asArray(data);
    }

    const entryById = new Map(asArray(entryRows.data).map((e) => [e.id, e]));
    for (const tournament of tournaments) {
      const rows = groups.filter((g) => g.tournament_id === tournament.id);
      const draw: DrawGroup[] = rows.map((g) => ({
        number: g.number,
        flightId: g.flight_id,
        playerIds: memberRows
          .filter((m) => m.group_id === g.id)
          .map((m) => entryById.get(m.registration_id)?.player_id ?? "")
          .filter(Boolean),
        startHole: g.start_hole,
        wave: g.wave,
        time: g.tee_time.slice(0, 5),
        locked: g.locked,
      }));
      const row = asArray(tournamentRows.data).find((t) => t.id === tournament.id) as
        | TableRow<"tournaments">
        | undefined;
      revisions[tournament.id] = row?.draw_revision ?? 0;
      boards[tournament.id] = {
        draw: draw.length ? draw : null,
        warnings: [],
        published: row?.published ? toPublished(row.published_snapshot, tournament.id) : null,
        overrides: toOverrides(row?.board_overrides ?? null),
      };
    }
  }

  const entries = asArray(entryRows.data).map(toRegistrationEntry);
  const active = tournaments.find((t) => t.state === "open")?.id ?? tournaments[0]?.id ?? null;

  return {
    clubName: club.name,
    revisions,
    state: {
      clubId,
      tournaments,
      activeTournamentId: active,
      players,
      records: asArray(recordRows.data).map(toHandicapRecord),
      entries,
      batches: asArray(batchRows.data).map(toImportBatch),
      deferred: asArray(deferredRows.data).map(toDeferredMatch),
      boards,
      importedCount: 0,
      seq: 0,
    },
  };
}
