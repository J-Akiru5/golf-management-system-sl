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
  options: { photoUrl?: string; shirt?: string } = {},
): DeskPlayer {
  return {
    id: row.id,
    name: row.full_name,
    birthdate: row.birthdate,
    gender: row.gender,
    index: frozenIndex,
    ngapId: row.ngap_id,
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
  return {
    number: value.number,
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
}

export function mapPublicPairingRows(rows: PublicPairing[]): PublicPairingsData | null {
  const first = rows[0];
  if (!first) return null;
  if (first.start_format !== "shotgun" && first.start_format !== "two_tee") {
    throw new Error("The public pairings have an unsupported start format.");
  }

  const groups = new Map<number, PublishedGroup>();
  for (const row of rows) {
    if (
      row.tournament_id !== first.tournament_id ||
      row.tournament_name !== first.tournament_name ||
      row.play_date !== first.play_date ||
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
        throw new Error("The public pairings response has incomplete group data.");
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
      throw new Error("The public pairings response has incomplete player data.");
    }
    const group = groups.get(row.group_number) ?? {
      number: row.group_number,
      startHole: row.start_hole,
      wave: row.wave,
      time: row.tee_time.slice(0, 5),
      flight: row.flight_name,
      players: [],
    };
    if (
      group.startHole !== row.start_hole ||
      group.wave !== row.wave ||
      group.time !== row.tee_time.slice(0, 5) ||
      group.flight !== row.flight_name
    ) {
      throw new Error(`Public pairings group ${row.group_number} has inconsistent rows.`);
    }
    group.players.push(row.player_name);
    groups.set(row.group_number, group);
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
          groups: [...groups.values()].sort((a, b) => a.number - b.number),
        }
      : null;
  return {
    tournamentId: first.tournament_id,
    name: first.tournament_name,
    date: first.play_date,
    startFormat: first.start_format,
    firstTeeTime: first.first_tee_time.slice(0, 5),
    published,
  };
}
