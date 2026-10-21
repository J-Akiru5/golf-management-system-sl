/**
 * Reads a club's whole desk out of Supabase and shapes it as the shell's `DeskState`.
 *
 * One read on load, then the adapters work off that state. Everything is scoped by club_id;
 * row-level security is relied on rather than bypassed. Photos are signed only where consent was
 * recorded, and only for a short window.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { daysOfTournament } from "@/lib/data/dates";
import type { DayTeeAssignment, Hole, ManualOverride, TournamentDay } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";
import type { Tee } from "@/lib/routing";
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

/** A database that has not applied an optional migration is a supported state, not a load failure. */
function missingObject(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST205" ||
    /does not exist|schema cache|column .* not found/i.test(error.message ?? "")
  );
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
  /** The course the setup edits belong to, or null when no event is set up yet. */
  courseId: string | null;
  /** The club's saved tees and holes, so entered ratings are read back rather than shown as samples. */
  tees: Tee[];
  holes: Hole[];
}

export async function loadDeskState(
  client: SupabaseClient<Database>,
  clubId: string,
  options: {
    /** Keep this event selected across a reload (for example right after creating it). */
    preferTournamentId?: string | null;
  } = {},
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
  const baseTournaments = asArray(tournamentRows.data).map((row) =>
    toTournament(row, categories, flights),
  );

  // Structured days are optional: a database that has not applied 20261037000000 still loads and
  // the UI derives the same shape from the event dates.
  let daysByTournament: Record<string, TournamentDay[]> = {};
  const dayRows = await client
    .from("tournament_days")
    .select("id, tournament_id, day_number, play_date, label, start_time, is_playing_day")
    .eq("club_id", clubId)
    .order("day_number");
  if (dayRows.error && !missingObject(dayRows.error)) {
    throw new Error(`Could not load the event days: ${dayRows.error.message}`);
  }
  if (!dayRows.error) {
    const grouped = new Map<string, TournamentDay[]>();
    for (const row of asArray(dayRows.data)) {
      if (!row.is_playing_day) continue;
      const list = grouped.get(row.tournament_id) ?? [];
      list.push({
        id: row.id,
        dayNumber: row.day_number,
        playDate: row.play_date,
        label: row.label,
        startTime: row.start_time ? row.start_time.slice(0, 5) : null,
        isPlayingDay: row.is_playing_day,
      });
      grouped.set(row.tournament_id, list);
    }
    daysByTournament = Object.fromEntries(grouped);
  }
  const tournaments = baseTournaments.map((tournament) => ({
    ...tournament,
    days: daysByTournament[tournament.id]?.length
      ? daysByTournament[tournament.id]
      : daysOfTournament(tournament),
  }));
  daysByTournament = Object.fromEntries(
    tournaments.map((tournament) => [tournament.id, tournament.days ?? []]),
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

  // The selected days live in registration_days after 20261037000000. Before it, the old
  // teePreferences keys are the only record; derive the same day numbers so the UI is unchanged.
  const dayNumberById = new Map(
    asArray(dayRows.data).map((row) => [
      row.id,
      { tournamentId: row.tournament_id, dayNumber: row.day_number },
    ]),
  );
  const selectedByRegistration = new Map<string, number[]>();
  const teeByRegistration = new Map<string, Record<number, DayTeeAssignment>>();
  const registrationDayRows = await client
    .from("registration_days")
    .select("registration_id, tournament_day_id, selected, tee_time, start_hole, tee_confirmed")
    .eq("club_id", clubId)
    .eq("selected", true);
  if (registrationDayRows.error && !missingObject(registrationDayRows.error)) {
    throw new Error(`Could not load the playing days: ${registrationDayRows.error.message}`);
  }
  if (!registrationDayRows.error) {
    for (const row of asArray(registrationDayRows.data)) {
      const day = dayNumberById.get(row.tournament_day_id);
      if (!day) continue;
      const list = selectedByRegistration.get(row.registration_id) ?? [];
      list.push(day.dayNumber);
      selectedByRegistration.set(row.registration_id, list);
      if (row.tee_time !== null || row.start_hole !== null || row.tee_confirmed) {
        const assignments = teeByRegistration.get(row.registration_id) ?? {};
        assignments[day.dayNumber] = {
          teeTime: row.tee_time ? row.tee_time.slice(0, 5) : null,
          startHole: row.start_hole,
          confirmed: row.tee_confirmed,
        };
        teeByRegistration.set(row.registration_id, assignments);
      }
    }
  }
  const withDays = entries.map((entry) => {
    const stored = selectedByRegistration.get(entry.id);
    const dayTee = teeByRegistration.get(entry.id) ?? {};
    if (stored?.length) {
      return {
        ...entry,
        selectedDays: [...stored].sort((a, b) => a - b),
        dayTee,
      };
    }
    const tournamentDays = daysByTournament[entry.tournamentId] ?? [];
    const derived = Object.entries(entry.teePreferences)
      .filter(([, value]) => Boolean(value))
      .map(([date]) => tournamentDays.find((day) => day.playDate === date)?.dayNumber)
      .filter((day): day is number => typeof day === "number");
    return {
      ...entry,
      selectedDays: [...new Set(derived)].sort((a, b) => a - b),
      dayTee,
    };
  });
  const preferred = options.preferTournamentId
    ? tournaments.find((t) => t.id === options.preferTournamentId)?.id
    : undefined;
  const active =
    preferred ?? tournaments.find((t) => t.state === "open")?.id ?? tournaments[0]?.id ?? null;

  // The tees and holes the setup edits. Without these the desk would show the sample ratings even
  // after they had been saved, which reads as "it did not save".
  const courseId = asArray(tournamentRows.data).find((t) => t.id === active)?.course_id ?? null;
  let tees: Tee[] = [];
  let holes: Hole[] = [];
  if (courseId) {
    const [teeRows, holeRows] = await Promise.all([
      client.from("tees").select("*").eq("club_id", clubId).eq("course_id", courseId).order("name"),
      client
        .from("holes")
        .select("*")
        .eq("club_id", clubId)
        .eq("course_id", courseId)
        .order("number"),
    ]);
    if (teeRows.error) throw new Error(`Could not load tees: ${teeRows.error.message}`);
    if (holeRows.error) throw new Error(`Could not load holes: ${holeRows.error.message}`);
    tees = asArray(teeRows.data).map((row) => ({
      id: row.id,
      name: row.name,
      courseRating: Number(row.course_rating),
      slope: Number(row.slope),
      par: Number(row.par),
    }));
    holes = asArray(holeRows.data).map((row) => ({
      id: `${row.course_id}-${row.number}`,
      courseId: row.course_id,
      number: row.number,
      par: row.par,
      strokeIndex: row.stroke_index,
    }));
  }

  return {
    clubName: club.name,
    revisions,
    courseId,
    tees,
    holes,
    state: {
      clubId,
      club: { id: club.id, name: club.name, shortName: club.name, location: "" },
      tees,
      holes,
      tournaments,
      activeTournamentId: active,
      days: daysByTournament,
      players,
      records: asArray(recordRows.data).map(toHandicapRecord),
      entries: withDays,
      batches: asArray(batchRows.data).map(toImportBatch),
      deferred: asArray(deferredRows.data).map(toDeferredMatch),
      boards,
      importedCount: 0,
      seq: 0,
    },
  };
}
