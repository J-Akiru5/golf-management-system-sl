import type { DeskPlayer } from "@/lib/demo/data";
import type { DrawGroup } from "@/lib/draw/validate";
import type { CategoryRule, FlightRule, Tee, TournamentConfig } from "@/lib/routing";
import type { Published, PublishedGroup } from "@/lib/store/legacy-supabase-store";
import type {
  CategoryRow,
  CourseRow,
  FlightRow,
  GroupMemberRow,
  GroupRow,
  Json,
  PlayerRow,
  PublicPairing,
  RegistrationRow,
  TeeRow,
  TournamentRow,
} from "@/lib/supabase/types";

export function mapPlayerRow(
  row: PlayerRow,
  frozenIndex: number | null,
  options: { photoUrl?: string; shirt?: string; teamKey?: string | null } = {},
): DeskPlayer {
  return {
    id: row.id,
    name: row.full_name,
    birthdate: row.birthdate,
    gender: row.gender,
    index: frozenIndex,
    ngapId: row.ngap_id,
    // A member-guest pair saved on the entry: without it the router treats both partners as solo
    // players, splits them across groups and classes each one on their own index.
    teamKey: options.teamKey ?? null,
    active: row.active ?? true,
    deletedAt: row.deleted_at ?? null,
    photo: row.photo_consent_at ? options.photoUrl : undefined,
    photoConsent: Boolean(row.photo_consent_at),
    shirt: options.shirt || undefined,
  };
}

export function mapTeeRow(row: TeeRow): Tee {
  return {
    id: row.id,
    name: row.name,
    courseRating: Number(row.course_rating),
    slope: Number(row.slope),
    par: Number(row.par),
  };
}

export function mapCategoryRow(row: CategoryRow): CategoryRule {
  if (row.gender !== "M" && row.gender !== "F" && row.gender !== "any") {
    throw new Error(`Category ${row.id} has an unsupported gender rule.`);
  }
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    minAge: row.min_age,
    maxAge: row.max_age,
    teeId: row.tee_id,
  };
}

export function mapFlightRow(row: FlightRow): FlightRule {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    min: Number(row.min_value),
    max: Number(row.max_value),
  };
}

export function mapTournamentConfig(row: TournamentRow, course: CourseRow): TournamentConfig {
  if (row.start_format !== "shotgun" && row.start_format !== "two_tee") {
    throw new Error(`Tournament ${row.id} has an unsupported start format.`);
  }
  if (row.flight_basis !== "index" && row.flight_basis !== "course_handicap") {
    throw new Error(`Tournament ${row.id} has an unsupported flight basis.`);
  }
  return {
    date: row.play_date,
    maxIndex: Number(row.max_index),
    allowance: Number(row.allowance),
    flightBasis: row.flight_basis === "course_handicap" ? "courseHandicap" : "index",
    startFormat: row.start_format,
    holes: course.holes,
    groupSize: row.group_size,
    minGroupSize: row.min_group_size,
    firstTeeTime: row.first_tee_time.slice(0, 5),
    intervalMinutes: row.interval_minutes,
    waveGapMinutes: row.wave_gap_minutes,
  };
}

export function mapDrawGroups(
  rows: GroupRow[],
  members: GroupMemberRow[],
  registrations: RegistrationRow[],
): { draw: DrawGroup[]; groupIds: Record<number, string> } {
  const playerByRegistration = new Map(registrations.map((r) => [r.id, r.player_id]));
  const membersByGroup = new Map<string, GroupMemberRow[]>();
  for (const member of members) {
    if (!playerByRegistration.has(member.registration_id)) {
      throw new Error(
        "A draw group contains a registration from another tournament or an unknown player.",
      );
    }
    membersByGroup.set(member.group_id, [...(membersByGroup.get(member.group_id) ?? []), member]);
  }

  const groupIds: Record<number, string> = {};
  const draw = [...rows]
    .sort((a, b) => a.number - b.number)
    .map((row) => {
      groupIds[row.number] = row.id;
      const playerIds = (membersByGroup.get(row.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((member) => playerByRegistration.get(member.registration_id))
        .filter((id): id is string => Boolean(id));
      return {
        number: row.number,
        flightId: row.flight_id,
        playerIds,
        startHole: row.start_hole,
        wave: row.wave,
        time: row.tee_time.slice(0, 5),
        locked: row.locked,
      };
    });
  return { draw, groupIds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function mapPublishedGroup(value: unknown): PublishedGroup {
  if (
    !isRecord(value) ||
    typeof value.number !== "number" ||
    typeof value.startHole !== "number" ||
    (value.wave !== null && typeof value.wave !== "string") ||
    typeof value.time !== "string" ||
    typeof value.flight !== "string" ||
    !isStringArray(value.players)
  ) {
    throw new Error("The saved published-pairings snapshot has an invalid group.");
  }
  // Days are optional: snapshots written before 20261108000300 have none, and they still parse.
  const rawDayNumber = value.dayNumber;
  const dayNumber =
    typeof rawDayNumber === "number" && Number.isInteger(rawDayNumber) && rawDayNumber > 0
      ? rawDayNumber
      : undefined;
  const rawDayLabel = value.dayLabel;
  const dayLabel =
    typeof rawDayLabel === "string" && rawDayLabel.trim() !== "" ? rawDayLabel : undefined;
  const rawPlayDate = value.playDate;
  const playDate =
    typeof rawPlayDate === "string" && rawPlayDate.trim() !== "" ? rawPlayDate : undefined;

  return {
    number: value.number,
    ...(dayNumber === undefined ? {} : { dayNumber }),
    ...(dayLabel === undefined ? {} : { dayLabel }),
    ...(playDate === undefined ? {} : { playDate }),
    startHole: value.startHole,
    wave: value.wave,
    time: value.time,
    flight: value.flight,
    players: value.players,
  };
}

export function mapPublishedSnapshot(value: Json | null): Published | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.at !== "string" ||
    typeof value.signature !== "string" ||
    typeof value.eventName !== "string" ||
    typeof value.date !== "string" ||
    (value.startFormat !== "shotgun" && value.startFormat !== "two_tee") ||
    typeof value.firstTeeTime !== "string" ||
    !Array.isArray(value.groups)
  ) {
    throw new Error("The saved published-pairings snapshot is invalid.");
  }
  return {
    at: value.at,
    signature: value.signature,
    eventName: value.eventName,
    date: value.date,
    startFormat: value.startFormat,
    firstTeeTime: value.firstTeeTime,
    groups: value.groups.map(mapPublishedGroup),
  };
}

export interface PublicPairingsData {
  tournamentId: string;
  name: string;
  date: string;
  startFormat: TournamentConfig["startFormat"];
  firstTeeTime: string;
  published: Published | null;
  /** Public photo paths for the player ids in the published snapshot. */
  photoByPlayerId: Record<string, string>;
  /**
   * Rows that could not be used because they were incomplete or disagreed with the rest of their
   * group. They are left out of `published`; the page shows the rest and notes the gap.
   */
  skippedRows: number;
  /**
   * The playing days found in the rows, oldest number first. A one-day event has one entry. Rows
   * from the older function carry no day and are treated as day 1.
   */
  days: { dayNumber: number; label: string; playDate: string }[];
}

export function mapPublicPairingRows(rows: PublicPairing[]): PublicPairingsData | null {
  const first = rows[0];
  if (!first) return null;
  if (first.start_format !== "shotgun" && first.start_format !== "two_tee") {
    throw new Error("The public pairings have an unsupported start format.");
  }

  // The day is part of the key: two days of one event can both have group number 1.
  const groups = new Map<string, PublishedGroup>();
  const days = new Map<number, { dayNumber: number; label: string; playDate: string }>();
  const photoByPlayerId: Record<string, string> = {};
  // A published snapshot is written by the app, but a historical row can still be incomplete or
  // disagree with its group after a manual repair. Skipping the bad row keeps the rest of the
  // board readable; the caller gets the count and can say part of the list is missing.
  let skippedRows = 0;
  for (const row of rows) {
    if (
      row.tournament_id !== first.tournament_id ||
      row.tournament_name !== first.tournament_name ||
      row.start_format !== first.start_format ||
      row.first_tee_time !== first.first_tee_time ||
      row.published_at !== first.published_at
    ) {
      throw new Error("The public pairings response contains more than one tournament.");
    }
    if (row.group_number === null) {
      if (
        row.start_hole !== null ||
        row.tee_time !== null ||
        row.flight_name !== null ||
        row.player_name !== null
      ) {
        skippedRows += 1;
      }
      continue;
    }
    if (
      row.start_hole === null ||
      row.tee_time === null ||
      row.flight_name === null ||
      row.player_name === null ||
      row.published_at === null
    ) {
      skippedRows += 1;
      continue;
    }
    const dayNumber = row.day_number ?? 1;
    const key = `${dayNumber}:${row.group_number}`;
    const group = groups.get(key) ?? {
      number: row.group_number,
      dayNumber,
      ...(row.day_label ? { dayLabel: row.day_label } : {}),
      playDate: row.play_date,
      startHole: row.start_hole,
      wave: row.wave,
      time: row.tee_time.slice(0, 5),
      flight: row.flight_name,
      players: [],
      playerIds: [],
    };
    if (
      group.startHole !== row.start_hole ||
      group.wave !== row.wave ||
      group.time !== row.tee_time.slice(0, 5) ||
      group.flight !== row.flight_name ||
      group.dayNumber !== dayNumber ||
      group.playDate !== row.play_date ||
      group.dayLabel !== (row.day_label ?? undefined)
    ) {
      skippedRows += 1;
      continue;
    }
    group.players.push(row.player_name);
    // Keep the ids aligned with the names even when an old snapshot has no id for this row.
    group.playerIds?.push(row.player_id ?? "");
    if (row.player_id && row.photo_path) photoByPlayerId[row.player_id] = row.photo_path;
    groups.set(key, group);
    if (!days.has(dayNumber)) {
      days.set(dayNumber, {
        dayNumber,
        label: row.day_label ?? `Day ${dayNumber}`,
        playDate: row.play_date,
      });
    }
  }

  // Nothing usable survived. The page should show its failure state, not an empty draw.
  if (groups.size === 0 && skippedRows > 0) {
    throw new Error("The public pairings response has no usable rows.");
  }

  const published: Published | null =
    groups.size && first.published_at
      ? {
          at: first.published_at,
          signature: `public:${first.tournament_id}`,
          version: first.version ?? undefined,
          eventName: first.tournament_name,
          date: first.play_date,
          startFormat: first.start_format,
          firstTeeTime: first.first_tee_time.slice(0, 5),
          groups: [...groups.values()].sort(
            (a, b) => (a.dayNumber ?? 1) - (b.dayNumber ?? 1) || a.number - b.number,
          ),
        }
      : null;
  return {
    tournamentId: first.tournament_id,
    name: first.tournament_name,
    date: first.play_date,
    startFormat: first.start_format,
    firstTeeTime: first.first_tee_time.slice(0, 5),
    published,
    photoByPlayerId,
    skippedRows,
    days: [...days.values()].sort((a, b) => a.dayNumber - b.dayNumber),
  };
}
