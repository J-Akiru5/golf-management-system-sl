/**
 * Reads a club's whole desk out of Supabase and shapes it as the shell's `DeskState`.
 *
 * One read on load, then the adapters work off that state. Everything is scoped by club_id;
 * row-level security is relied on rather than bypassed. Photos are signed only where consent was
 * recorded, and only for a short window.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { daysOfTournament, selectedDaysOf } from "@/lib/data/dates";
import type {
  DayTeeAssignment,
  Hole,
  ManualOverride,
  RegistrationEntry,
  TournamentDay,
} from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";
import type { CategoryRule, FlightRule, Tee } from "@/lib/routing";
import type { BoardState, DeskState, Published } from "@/lib/store/state";
import type { Database, Json, TableRow } from "@/lib/supabase/types";
import {
  toCaddie,
  toCategoryRule,
  toDeferredMatch,
  toFlightRule,
  toHandicapRecord,
  toImportBatch,
  toPlayerRecord,
  toRegistrationEntry,
  toTournament,
} from "./domain";
import { signedEventLogo } from "./event-logo";

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

/**
 * Picks the round a tournament's board is read from.
 *
 * A round belongs to one playing day, so asking for day 3 must return day 3. It used to fall back to
 * the first round, which showed day 1's board for every day of a multi-day event (audit finding A1).
 * No day asked for keeps the old behaviour and returns the first round, or null when there is none.
 */
export function pickRoundForDay(
  rows: { id: string; day_number: number }[],
  dayNumber: number | null,
): { id: string; day_number: number } | null {
  if (dayNumber === null) return rows[0] ?? null;
  return rows.find((row) => row.day_number === dayNumber) ?? null;
}

/**
 * The round a day's board is read from, with the loader's optional fallback.
 *
 * A requested day with no round is null, which the loader turns into an error. When the caller set
 * `fallbackToFirstDay`, the first round is used instead. No day asked for keeps `pickRoundForDay`'s
 * behaviour.
 */
export function pickRoundForLoad(
  rows: { id: string; day_number: number }[],
  dayNumber: number | null,
  fallbackToFirstDay = false,
): { id: string; day_number: number } | null {
  const picked = pickRoundForDay(rows, dayNumber);
  if (picked || dayNumber === null || !fallbackToFirstDay) return picked;
  return pickRoundForDay(rows, null);
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
  /** The playing day's round each tournament's board was read from, so a save writes it back. */
  rounds: Record<string, string>;
  /** The playing day number of that round, per tournament. */
  roundDays: Record<string, number>;
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
    /**
     * The playing day whose board to load. Left out, the first playing day is used. A day the
     * opened event has no round for is an error, not a quiet fall back to the first day.
     */
    dayNumber?: number | null;
    /**
     * Use the first round when the requested day has no round instead of failing. Absent or false
     * keeps the strict behaviour above; a screen that only needs a board to show can set it.
     */
    fallbackToFirstDay?: boolean;
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

  // Categories and classes belong to one event, and a club can hold more than one event. Handing
  // every event the club's whole list put another event's classes on this event's Classes screen,
  // and saving that section then sent a class naming a category this event does not have, which the
  // database refused for the whole section.
  const categoriesByTournament = new Map<string, CategoryRule[]>();
  for (const row of asArray(categoryRows.data)) {
    const list = categoriesByTournament.get(row.tournament_id) ?? [];
    list.push(toCategoryRule(row));
    categoriesByTournament.set(row.tournament_id, list);
  }
  const flightsByCategory = new Map<string, FlightRule[]>();
  for (const row of asArray(flightRows.data)) {
    const list = flightsByCategory.get(row.category_id) ?? [];
    list.push(toFlightRule(row));
    flightsByCategory.set(row.category_id, list);
  }
  const baseTournaments = asArray(tournamentRows.data).map((row) => {
    const categories = categoriesByTournament.get(row.id) ?? [];
    const flights = categories.flatMap((category) => flightsByCategory.get(category.id) ?? []);
    return toTournament(row, categories, flights);
  });

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
  // A day's own afternoon start arrives with 20261108000800. It is read on its own so a database
  // that has not run that migration still loads its days, just without a stored afternoon start.
  const pmStartByDayId = new Map<string, string | null>();
  const pmRows = await client
    .from("tournament_days")
    .select("id, pm_start_time")
    .eq("club_id", clubId);
  if (pmRows.error && !missingObject(pmRows.error)) {
    throw new Error(`Could not load the afternoon start times: ${pmRows.error.message}`);
  }
  if (!pmRows.error) {
    for (const row of asArray(pmRows.data)) {
      pmStartByDayId.set(row.id, row.pm_start_time ? row.pm_start_time.slice(0, 5) : null);
    }
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
        pmStartTime: pmStartByDayId.get(row.id) ?? null,
        isPlayingDay: row.is_playing_day,
      });
      grouped.set(row.tournament_id, list);
    }
    daysByTournament = Object.fromEntries(grouped);
  }
  const tournaments = await Promise.all(
    baseTournaments.map(async (tournament) => {
      const row = asArray(tournamentRows.data).find((t) => t.id === tournament.id);
      const logoUrl = row?.logo_path ? await signedEventLogo(client, row.logo_path) : undefined;
      return {
        ...tournament,
        logoUrl,
        days: daysByTournament[tournament.id]?.length
          ? daysByTournament[tournament.id]
          : daysOfTournament(tournament),
      };
    }),
  );
  daysByTournament = Object.fromEntries(
    tournaments.map((tournament) => [tournament.id, tournament.days ?? []]),
  );

  // Signed URLs only where consent exists, and only for this club's objects.
  const membershipRows = await client
    .from("player_memberships")
    .select("player_id, membership_type, member_number")
    .eq("club_id", clubId)
    .eq("status", "active");
  if (membershipRows.error && !missingObject(membershipRows.error)) {
    throw new Error(`Could not load player memberships: ${membershipRows.error.message}`);
  }
  const membershipByPlayer = new Map(
    asArray(membershipRows.data).map((row) => [
      row.player_id,
      { type: row.membership_type, number: row.member_number },
    ]),
  );
  const photoPaths: Record<string, string | null> = {};
  const players = await Promise.all(
    asArray(playerRows.data).map(async (row) => {
      let photoUrl: string | undefined;
      if (row.photo_consent_at && row.photo_path?.startsWith(`${clubId}/`)) {
        const { data: signed } = await client.storage
          .from("player-photos")
          .createSignedUrl(row.photo_path, PHOTO_URL_SECONDS);
        photoUrl = signed?.signedUrl;
      }
      photoPaths[row.id] = row.photo_path;
      const membership = membershipByPlayer.get(row.id);
      return {
        ...toPlayerRecord(row, photoUrl),
        membershipType: membership?.type ?? null,
        memberNumber: membership?.number ?? null,
      };
    }),
  );

  const caddieRows = await client
    .from("caddies")
    .select("*")
    .eq("club_id", clubId)
    .order("full_name");
  if (caddieRows.error && !missingObject(caddieRows.error)) {
    throw new Error(`Could not load caddies: ${caddieRows.error.message}`);
  }
  const caddies = asArray(caddieRows.data).map(toCaddie);

  // Boards are rebuilt from the stored groups so a saved draw survives a refresh.
  const tournamentIds = tournaments.map((t) => t.id);
  const boards: Record<string, BoardState> = {};
  const revisions: Record<string, number> = {};
  // The event the desk opens with: the one asked for, then the first open event, then the first
  // event. It is decided here so a named day only has to exist on that event; another event missing
  // the day must not fail the load.
  const preferred = options.preferTournamentId
    ? tournaments.find((t) => t.id === options.preferTournamentId)?.id
    : undefined;
  const active =
    preferred ?? tournaments.find((t) => t.state === "open")?.id ?? tournaments[0]?.id ?? null;
  // A day is only honoured when it is a whole number above zero. Anything else is treated as no day
  // asked for, which keeps the old behaviour of showing the first round.
  const requestedDay =
    typeof options.dayNumber === "number" &&
    Number.isInteger(options.dayNumber) &&
    options.dayNumber > 0
      ? options.dayNumber
      : null;
  // A board belongs to one playing day. Only the selected day's round is read, so the desk shows
  // that day's groups alone; without a selection the first playing day is used.
  const roundRows = await client
    .from("competition_rounds")
    .select("id, tournament_id, day_number")
    .eq("club_id", clubId)
    .order("day_number");
  if (roundRows.error && !missingObject(roundRows.error)) {
    throw new Error(`Could not load the playing days of the draw: ${roundRows.error.message}`);
  }
  const rounds: Record<string, string> = {};
  const roundDays: Record<string, number> = {};
  for (const tournament of tournaments) {
    const rows = asArray(roundRows.data)
      .filter((row) => row.tournament_id === tournament.id)
      .sort((a, b) => a.day_number - b.day_number);
    // The named day applies to the opened event. Other events keep their first round, so nothing
    // else on the desk has to have that day on file.
    const askedDay = tournament.id === active ? requestedDay : null;
    const picked = pickRoundForLoad(rows, askedDay, options.fallbackToFirstDay === true);
    if (!picked) {
      if (tournament.id === active && requestedDay !== null && !options.fallbackToFirstDay) {
        throw new Error(
          `Day ${requestedDay} has no round on file for this event. Open the draw again after the event days are saved.`,
        );
      }
      continue;
    }
    rounds[tournament.id] = picked.id;
    roundDays[tournament.id] = picked.day_number;
  }
  const roundIds = Object.values(rounds);

  if (tournamentIds.length && roundIds.length) {
    const { data: groupRows, error: groupError } = await client
      .from("groups")
      .select("*")
      .eq("club_id", clubId)
      .in("round_id", roundIds)
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

  // The pair tables are the source of truth after 20261108002000. A database that has not applied
  // that migration keeps the team number read from `answers.teamNo`, so the screen still loads.
  const pairRows = await client
    .from("registration_pairs")
    .select("id, number")
    .eq("club_id", clubId);
  const pairMemberRows = await client
    .from("registration_pair_members")
    .select("pair_id, registration_id")
    .eq("club_id", clubId);
  if (pairRows.error && !missingObject(pairRows.error)) {
    throw new Error(`Could not load the pairs: ${pairRows.error.message}`);
  }
  if (pairMemberRows.error && !missingObject(pairMemberRows.error)) {
    throw new Error(`Could not load the pair members: ${pairMemberRows.error.message}`);
  }
  if (!pairRows.error && !pairMemberRows.error) {
    const numberByPair = new Map(
      asArray(pairRows.data).map((row) => [row.id, row.number] as const),
    );
    const numberByRegistration = new Map<string, number>();
    for (const row of asArray(pairMemberRows.data)) {
      const number = numberByPair.get(row.pair_id);
      if (number !== undefined) numberByRegistration.set(row.registration_id, number);
    }
    for (const entry of entries) {
      entry.teamNo = numberByRegistration.get(entry.id) ?? null;
    }
  }

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
  const registrationDayNumber = new Map<string, { registrationId: string; dayNumber: number }>();
  const registrationDayRows = await client
    .from("registration_days")
    .select(
      "id, registration_id, tournament_day_id, selected, tee_time, start_hole, tee_confirmed, wave",
    )
    .eq("club_id", clubId)
    .eq("selected", true);
  if (registrationDayRows.error && !missingObject(registrationDayRows.error)) {
    throw new Error(`Could not load the playing days: ${registrationDayRows.error.message}`);
  }
  if (!registrationDayRows.error) {
    for (const row of asArray(registrationDayRows.data)) {
      const day = dayNumberById.get(row.tournament_day_id);
      if (!day) continue;
      registrationDayNumber.set(row.id, {
        registrationId: row.registration_id,
        dayNumber: day.dayNumber,
      });
      const list = selectedByRegistration.get(row.registration_id) ?? [];
      list.push(day.dayNumber);
      selectedByRegistration.set(row.registration_id, list);
      if (
        row.tee_time !== null ||
        row.start_hole !== null ||
        row.wave !== null ||
        row.tee_confirmed
      ) {
        const assignments = teeByRegistration.get(row.registration_id) ?? {};
        assignments[day.dayNumber] = {
          teeTime: row.tee_time ? row.tee_time.slice(0, 5) : null,
          startHole: row.start_hole,
          wave: row.wave,
          confirmed: row.tee_confirmed,
        };
        teeByRegistration.set(row.registration_id, assignments);
      }
    }
  }

  // The AM/PM session sits beside the day. It is read on its own so a database that has not run
  // migration 20261105000100 still loads its days, just without a session on them.
  const sessionsByRegistration = new Map<string, Record<number, "AM" | "PM">>();
  const sessionRows = await client
    .from("registration_days")
    .select("registration_id, tournament_day_id, session")
    .eq("club_id", clubId)
    .eq("selected", true);
  if (!sessionRows.error) {
    for (const row of asArray(sessionRows.data)) {
      const day = dayNumberById.get(row.tournament_day_id);
      if (!day) continue;
      if (row.session !== "AM" && row.session !== "PM") continue;
      const sessions = sessionsByRegistration.get(row.registration_id) ?? {};
      sessions[day.dayNumber] = row.session;
      sessionsByRegistration.set(row.registration_id, sessions);
    }
  }

  // The arrival stamp sits on the same day row, added by 20261106000000. It is read on its own so
  // a database that has not run that migration still loads, just with everybody still expected.
  const checkInByRegistration = new Map<string, NonNullable<RegistrationEntry["dayCheckIn"]>>();
  const checkInRows = (await client
    .from("registration_days")
    .select("registration_id, tournament_day_id, checked_in_at")
    .eq("club_id", clubId)
    .eq("selected", true)
    .not("checked_in_at", "is", null)) as unknown as {
    data:
      | {
          registration_id: string;
          tournament_day_id: string | null;
          checked_in_at: string | null;
        }[]
      | null;
    error: { message: string; code?: string } | null;
  };
  if (!checkInRows.error) {
    for (const row of asArray(checkInRows.data)) {
      const day = row.tournament_day_id ? dayNumberById.get(row.tournament_day_id) : undefined;
      if (!day || !row.checked_in_at) continue;
      const map = checkInByRegistration.get(row.registration_id) ?? {};
      map[day.dayNumber] = { at: row.checked_in_at, byName: null };
      checkInByRegistration.set(row.registration_id, map);
    }
  }

  const caddieAssignmentsByRegistration = new Map<
    string,
    NonNullable<RegistrationEntry["caddieByDay"]>
  >();
  const assignmentRows = await client
    .from("caddie_assignments")
    .select("registration_day_id, caddie_id, status")
    .eq("club_id", clubId)
    .in("status", ["assigned", "confirmed"]);
  if (assignmentRows.error && !missingObject(assignmentRows.error)) {
    throw new Error(`Could not load caddie assignments: ${assignmentRows.error.message}`);
  }
  if (!assignmentRows.error) {
    const caddieById = new Map(caddies.map((caddie) => [caddie.id, caddie]));
    for (const row of asArray(assignmentRows.data)) {
      const day = registrationDayNumber.get(row.registration_day_id);
      if (!day) continue;
      const caddie = caddieById.get(row.caddie_id);
      if (!caddie) continue;
      const map = caddieAssignmentsByRegistration.get(day.registrationId) ?? {};
      map[day.dayNumber] = {
        caddieId: row.caddie_id,
        caddieName: caddie.fullName,
        status: row.status,
      };
      caddieAssignmentsByRegistration.set(day.registrationId, map);
    }
  }
  const withDays = entries.map((entry) => {
    const stored = selectedByRegistration.get(entry.id);
    const dayTee = teeByRegistration.get(entry.id) ?? {};
    const caddieByDay = caddieAssignmentsByRegistration.get(entry.id) ?? {};
    if (stored?.length) {
      return {
        ...entry,
        selectedDays: [...stored].sort((a, b) => a - b),
        daySessions: sessionsByRegistration.get(entry.id) ?? {},
        dayCheckIn: checkInByRegistration.get(entry.id) ?? {},
        dayTee,
        caddieByDay,
      };
    }
    const tournamentDays = daysByTournament[entry.tournamentId] ?? [];
    return {
      ...entry,
      selectedDays: selectedDaysOf(entry, tournamentDays),
      daySessions: sessionsByRegistration.get(entry.id) ?? {},
      dayCheckIn: checkInByRegistration.get(entry.id) ?? {},
      dayTee,
      caddieByDay,
    };
  });

  const records = asArray(recordRows.data).map(toHandicapRecord);

  // The control room tile beside "Handicaps" reports how many of the selected event's records came
  // from an NGAP import. It was hard-coded to 0, so a finished import still read "Not imported
  // yet". Count what the connected desk loader counts: imported records for this event's field,
  // dated on or before its cut-off.
  const activeTournament = tournaments.find((t) => t.id === active) ?? null;
  const activePlayerIds = new Set(
    entries.filter((entry) => entry.tournamentId === active).map((entry) => entry.playerId),
  );
  const importedCount = activeTournament
    ? records.filter(
        (record) =>
          record.source === "ngap_import" &&
          record.effectiveDate <= activeTournament.cutOffDate &&
          activePlayerIds.has(record.playerId),
      ).length
    : 0;

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
    rounds,
    roundDays,
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
      records,
      entries: withDays,
      caddies,
      photoPaths,
      batches: asArray(batchRows.data).map(toImportBatch),
      deferred: asArray(deferredRows.data).map(toDeferredMatch),
      boards,
      importedCount,
      seq: 0,
    },
  };
}
